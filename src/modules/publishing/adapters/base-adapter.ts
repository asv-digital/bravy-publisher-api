import { ContentType, Platform } from '@prisma/client';

export type MediaItem =
  | { kind: 'image'; url: string; altText?: string }
  | { kind: 'video'; url: string; thumbnailUrl?: string; durationSec?: number };

export type ContentToPublish =
  | { type: 'CAROUSEL'; media: MediaItem[]; caption: string }
  | { type: 'STATIC'; media: MediaItem; caption: string }
  | { type: 'REEL'; media: MediaItem; caption: string };

export interface PublishContext {
  accountId: string;
  accessToken: string;
}

export interface PublishResult {
  externalMediaId: string;
  platform: Platform;
  publishedAt: Date;
}

/** Reported by adapters as the publish job advances; drives the UI progress bar. */
export interface PublishProgress {
  /** 0–100 overall completion. */
  progress: number;
  /** Human-readable phase label, e.g. "Enviando slide 2/6". */
  phase: string;
}

export type OnPublishProgress = (
  update: PublishProgress,
) => void | Promise<void>;

export interface PublishAdapter {
  readonly platform: Platform;

  supports(contentType: ContentType): boolean;

  publish(
    content: ContentToPublish,
    ctx: PublishContext,
    onProgress?: OnPublishProgress,
  ): Promise<PublishResult>;

  validateCredentials(ctx: PublishContext): Promise<boolean>;
}
