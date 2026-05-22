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

export interface PublishAdapter {
  readonly platform: Platform;

  supports(contentType: ContentType): boolean;

  publish(content: ContentToPublish, ctx: PublishContext): Promise<PublishResult>;

  validateCredentials(ctx: PublishContext): Promise<boolean>;
}
