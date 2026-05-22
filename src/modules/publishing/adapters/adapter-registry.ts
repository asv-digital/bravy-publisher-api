import { Injectable } from '@nestjs/common';
import { ContentType, Platform } from '@prisma/client';
import { PublishAdapter } from './base-adapter';
import { InstagramClient } from './instagram-client';
import { LinkedInClient } from './linkedin-client';

@Injectable()
export class PublishAdapterRegistry {
  private readonly adapters: Map<Platform, PublishAdapter>;

  constructor(
    private readonly instagram: InstagramClient,
    private readonly linkedin: LinkedInClient,
  ) {
    this.adapters = new Map<Platform, PublishAdapter>([
      [Platform.INSTAGRAM, instagram],
      [Platform.LINKEDIN, linkedin],
    ]);
  }

  get(platform: Platform, contentType: ContentType): PublishAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    if (!adapter.supports(contentType)) {
      throw new Error(
        `Adapter for ${platform} does not support content type ${contentType}`,
      );
    }
    return adapter;
  }
}
