import { Injectable, Logger } from '@nestjs/common';
import { ContentType, Platform } from '@prisma/client';
import {
  PublishAdapter,
  ContentToPublish,
  MediaItem,
  PublishContext,
  PublishResult,
  OnPublishProgress,
} from './base-adapter';

@Injectable()
export class InstagramClient implements PublishAdapter {
  readonly platform: Platform = Platform.INSTAGRAM;
  private readonly logger = new Logger(InstagramClient.name);
  // IMPORTANT: must be graph.facebook.com, not graph.instagram.com.
  // graph.instagram.com only accepts tokens from Instagram Basic Display
  // (deprecated). Page Access Tokens from Facebook Login for Business —
  // which is what our OAuth flow produces — only work against the Facebook
  // Graph host. Using the IG host returns code 190 "Cannot parse access token".
  private readonly API_BASE = 'https://graph.facebook.com/v21.0';
  private readonly PROCESS_WAIT_PER_SLIDE_MS = 8_000;
  private readonly CAROUSEL_WAIT_MS = 15_000;

  supports(contentType: ContentType): boolean {
    return contentType === ContentType.CAROUSEL;
  }

  async publish(
    content: ContentToPublish,
    ctx: PublishContext,
    onProgress?: OnPublishProgress,
  ): Promise<PublishResult> {
    switch (content.type) {
      case 'CAROUSEL':
        return this.publishCarousel(content.media, content.caption, ctx, onProgress);
      default:
        throw new Error(`InstagramClient does not support ${content.type} yet`);
    }
  }

  async validateCredentials(ctx: PublishContext): Promise<boolean> {
    try {
      const result = await this.igGet(`/${ctx.accountId}`, { fields: 'id,username' }, ctx.accessToken);
      return !!result.id;
    } catch {
      return false;
    }
  }

  private async publishCarousel(
    media: MediaItem[],
    caption: string,
    ctx: PublishContext,
    onProgress?: OnPublishProgress,
  ): Promise<PublishResult> {
    const imageUrls = media
      .filter(m => m.kind === 'image')
      .map(m => m.url);

    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new Error(`Carousel requires 2-10 image items, got ${imageUrls.length}`);
    }

    const { accountId, accessToken } = ctx;
    const total = imageUrls.length;
    const report = async (progress: number, phase: string) => {
      if (onProgress) await onProgress({ progress, phase });
    };

    // Fases e seus pesos no total (0–100):
    //  uploading dos N slides ... 5 → 55
    //  processamento das mídias . 55 → 80
    //  montagem do carrossel .... 80 → 92
    //  publicação ............... 92 → 98 (100 quando o service confirma COMPLETED)
    await report(5, 'Iniciando publicação');

    this.logger.log(`Creating ${total} child containers...`);
    const childrenIds: string[] = [];

    for (let i = 0; i < total; i++) {
      const result = await this.igPost(`/${accountId}/media`, {
        image_url: imageUrls[i],
        is_carousel_item: 'true',
      }, accessToken);

      childrenIds.push(result.id);
      this.logger.log(`Child ${i + 1}/${total}: container ${result.id}`);
      await report(5 + Math.round(((i + 1) / total) * 50), `Enviando slide ${i + 1}/${total}`);
    }

    const waitMs = this.PROCESS_WAIT_PER_SLIDE_MS * childrenIds.length;
    this.logger.log(`Waiting ${waitMs}ms for processing...`);
    await this.sleepWithProgress(waitMs, 55, 80, 'Processando mídias', report);

    this.logger.log('Creating CAROUSEL container...');
    await report(82, 'Montando carrossel');
    const carouselResult = await this.igPost(`/${accountId}/media`, {
      media_type: 'CAROUSEL',
      children: childrenIds.join(','),
      caption,
    }, accessToken);

    const carouselId = carouselResult.id;
    this.logger.log(`CAROUSEL ${carouselId}`);

    await this.sleepWithProgress(this.CAROUSEL_WAIT_MS, 82, 92, 'Finalizando carrossel', report);

    this.logger.log('Publishing...');
    await report(94, 'Publicando no Instagram');
    const publishResult = await this.igPost(`/${accountId}/media_publish`, {
      creation_id: carouselId,
    }, accessToken);

    this.logger.log(`Published! media_id=${publishResult.id}`);
    await report(98, 'Publicado');

    return {
      externalMediaId: publishResult.id,
      platform: Platform.INSTAGRAM,
      publishedAt: new Date(),
    };
  }

  private async igPost(
    path: string,
    data: Record<string, string>,
    accessToken: string,
  ): Promise<any> {
    // Meta Graph v21 sometimes rejects access_token in POST bodies with code 190
    // ("Cannot parse access token") even though the token itself is valid.
    // Putting it on the query string matches the official Graph API examples
    // and is consistently accepted across endpoints.
    const url = `${this.API_BASE}${path}?access_token=${encodeURIComponent(accessToken)}`;
    const body = new URLSearchParams(data);

    const response = await fetch(url, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const json = await response.json();

    if (json.error) {
      throw new Error(`IG API error at ${path}: ${json.error.message} (code ${json.error.code})`);
    }

    return json;
  }

  private async igGet(
    path: string,
    params: Record<string, string>,
    accessToken: string,
  ): Promise<any> {
    const searchParams = new URLSearchParams({ ...params, access_token: accessToken });
    const url = `${this.API_BASE}${path}?${searchParams}`;

    const response = await fetch(url, { method: 'GET' });
    return response.json();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Aguarda `totalMs` em passos curtos, avançando a barra de `fromPct` até
   * `toPct` ao longo da espera — assim a UI não congela durante os sleeps
   * fixos que o Instagram exige para processar as mídias.
   */
  private async sleepWithProgress(
    totalMs: number,
    fromPct: number,
    toPct: number,
    phase: string,
    report: (progress: number, phase: string) => Promise<void>,
  ): Promise<void> {
    const stepMs = 2_000;
    const steps = Math.max(1, Math.ceil(totalMs / stepMs));
    for (let i = 0; i < steps; i++) {
      await this.sleep(Math.min(stepMs, totalMs - i * stepMs));
      const pct = fromPct + Math.round(((i + 1) / steps) * (toPct - fromPct));
      await report(pct, phase);
    }
  }
}
