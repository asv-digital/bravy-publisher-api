import { Injectable, Logger } from '@nestjs/common';
import { ContentType, Platform } from '@prisma/client';
import {
  PublishAdapter,
  ContentToPublish,
  MediaItem,
  PublishContext,
  PublishResult,
} from './base-adapter';

/**
 * LinkedIn adapter using the UGC Posts API (v2).
 *
 * Required OAuth scopes:
 *   - w_member_social   (for personal posts via urn:li:person:{id})
 *   - w_organization_social + r_organization_admin (for company pages)
 *
 * `ctx.accountId` is expected to be a LinkedIn URN — either:
 *   - urn:li:person:{member-id}
 *   - urn:li:organization:{org-id}
 * Bare IDs are auto-normalized to person URNs.
 *
 * Multi-image posts (LinkedIn's native "carousel" feed format) use
 * shareMediaCategory=IMAGE with multiple media entries (up to 9 images).
 */
@Injectable()
export class LinkedInClient implements PublishAdapter {
  readonly platform: Platform = Platform.LINKEDIN;
  private readonly logger = new Logger(LinkedInClient.name);
  private readonly API_BASE = 'https://api.linkedin.com/v2';
  private readonly MAX_IMAGES = 9;
  private readonly ASSET_READY_POLL_MS = 1_500;
  private readonly ASSET_READY_TIMEOUT_MS = 60_000;

  supports(contentType: ContentType): boolean {
    return contentType === ContentType.CAROUSEL || contentType === ContentType.STATIC;
  }

  async publish(content: ContentToPublish, ctx: PublishContext): Promise<PublishResult> {
    const author = this.normalizeAuthorUrn(ctx.accountId);

    switch (content.type) {
      case 'CAROUSEL':
        return this.publishMultiImage(content.media, content.caption, author, ctx.accessToken);
      case 'STATIC':
        return this.publishMultiImage([content.media], content.caption, author, ctx.accessToken);
      default:
        throw new Error(`LinkedInClient does not support ${content.type} yet`);
    }
  }

  async validateCredentials(ctx: PublishContext): Promise<boolean> {
    try {
      const response = await fetch(`${this.API_BASE}/userinfo`, {
        headers: this.headers(ctx.accessToken),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async publishMultiImage(
    media: MediaItem[],
    caption: string,
    author: string,
    accessToken: string,
  ): Promise<PublishResult> {
    const images = media.filter(m => m.kind === 'image');
    if (images.length === 0) {
      throw new Error('LinkedIn post requires at least 1 image');
    }
    if (images.length > this.MAX_IMAGES) {
      throw new Error(`LinkedIn supports up to ${this.MAX_IMAGES} images, got ${images.length}`);
    }

    this.logger.log(`Uploading ${images.length} image(s) to LinkedIn assets...`);
    const assets: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const asset = await this.uploadImage(images[i].url, author, accessToken);
      assets.push(asset);
      this.logger.log(`Asset ${i + 1}/${images.length}: ${asset}`);
    }

    this.logger.log('Creating UGC post...');
    const postId = await this.createUgcPost(author, caption, assets, accessToken);
    this.logger.log(`Published! ugcPost=${postId}`);

    return {
      externalMediaId: postId,
      platform: Platform.LINKEDIN,
      publishedAt: new Date(),
    };
  }

  private async uploadImage(
    imageUrl: string,
    owner: string,
    accessToken: string,
  ): Promise<string> {
    // Step 1: registerUpload — get uploadUrl + asset URN
    const register = await this.liPost(
      '/assets?action=registerUpload',
      {
        registerUploadRequest: {
          owner,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [
            {
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            },
          ],
          supportedUploadMechanism: ['SYNCHRONOUS_UPLOAD'],
        },
      },
      accessToken,
    );

    const uploadUrl: string | undefined =
      register?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;
    const asset: string | undefined = register?.value?.asset;

    if (!uploadUrl || !asset) {
      throw new Error(
        `LinkedIn registerUpload returned unexpected payload: ${JSON.stringify(register)}`,
      );
    }

    // Step 2: fetch image bytes from our storage and PUT to LinkedIn
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image ${imageUrl}: HTTP ${imageRes.status}`);
    }
    const imageBytes = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get('content-type') ?? 'image/png';

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': contentType,
      },
      body: imageBytes,
    });

    if (!uploadRes.ok) {
      const body = await uploadRes.text().catch(() => '');
      throw new Error(`LinkedIn asset upload failed (HTTP ${uploadRes.status}): ${body}`);
    }

    // Step 3: poll until asset is in AVAILABLE state
    await this.waitForAssetReady(asset, accessToken);

    return asset;
  }

  private async waitForAssetReady(asset: string, accessToken: string): Promise<void> {
    const assetId = asset.split(':').pop()!;
    const start = Date.now();

    while (Date.now() - start < this.ASSET_READY_TIMEOUT_MS) {
      const res = await fetch(`${this.API_BASE}/assets/${assetId}`, {
        headers: this.headers(accessToken),
      });

      if (res.ok) {
        const json = await res.json();
        const status: string | undefined = json?.recipes?.[0]?.status;
        if (status === 'AVAILABLE') return;
        if (status === 'CLIENT_ERROR' || status === 'SERVER_ERROR') {
          throw new Error(`LinkedIn asset ${asset} processing failed: ${status}`);
        }
      }

      await this.sleep(this.ASSET_READY_POLL_MS);
    }

    throw new Error(`LinkedIn asset ${asset} did not become AVAILABLE within timeout`);
  }

  private async createUgcPost(
    author: string,
    caption: string,
    assetUrns: string[],
    accessToken: string,
  ): Promise<string> {
    const body = {
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'IMAGE',
          media: assetUrns.map(urn => ({
            status: 'READY',
            media: urn,
          })),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const res = await fetch(`${this.API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`LinkedIn ugcPosts failed (HTTP ${res.status}): ${errBody}`);
    }

    // ugcPost URN comes back in the x-restli-id header (sometimes also in the body)
    const headerId = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
    if (headerId) return headerId;

    const json = await res.json().catch(() => null);
    if (json?.id) return json.id;

    throw new Error('LinkedIn ugcPosts succeeded but no post id returned');
  }

  private async liPost(path: string, body: unknown, accessToken: string): Promise<any> {
    const res = await fetch(`${this.API_BASE}${path}`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`LinkedIn API ${path} failed (HTTP ${res.status}): ${errBody}`);
    }

    return res.json();
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  private normalizeAuthorUrn(accountId: string): string {
    if (accountId.startsWith('urn:li:')) return accountId;
    return `urn:li:person:${accountId}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
