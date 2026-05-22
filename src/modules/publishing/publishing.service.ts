import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ContentType, Slide } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { PublishAdapterRegistry } from './adapters/adapter-registry';
import { ContentToPublish, MediaItem } from './adapters/base-adapter';

@Injectable()
export class PublishingService {
  private readonly logger = new Logger(PublishingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: PublishAdapterRegistry,
    private readonly encryption: EncryptionService,
    @InjectQueue('publish') private readonly publishQueue: Queue,
  ) {}

  async enqueuePublish(contentId: string, socialAccountId: string, scheduledAt?: Date) {
    const publishTarget = await this.prisma.publishTarget.create({
      data: {
        contentId,
        socialAccountId,
        status: 'PENDING',
        scheduledAt,
      },
    });

    if (!scheduledAt) {
      await this.publishQueue.add('publish-content', {
        publishTargetId: publishTarget.id,
      });
    }

    return publishTarget;
  }

  async publish(publishTargetId: string) {
    const target = await this.prisma.publishTarget.findUniqueOrThrow({
      where: { id: publishTargetId },
      include: {
        content: { include: { slides: { orderBy: { position: 'asc' } } } },
        socialAccount: true,
      },
    });

    const content = this.buildContentToPublish(
      target.content.contentType,
      target.content.slides,
      target.content.caption ?? '',
    );

    const adapter = this.adapterRegistry.get(
      target.socialAccount.platform,
      target.content.contentType,
    );

    const result = await adapter.publish(content, {
      accountId: target.socialAccount.accountId,
      accessToken: this.encryption.decrypt(target.socialAccount.accessToken),
    });

    await this.prisma.publishTarget.update({
      where: { id: publishTargetId },
      data: {
        status: 'COMPLETED',
        externalMediaId: result.externalMediaId,
        publishedAt: result.publishedAt,
      },
    });

    await this.prisma.content.update({
      where: { id: target.contentId },
      data: { status: 'PUBLISHED' },
    });

    return result;
  }

  private buildContentToPublish(
    contentType: ContentType,
    slides: Slide[],
    caption: string,
  ): ContentToPublish {
    const renderedImages: MediaItem[] = slides
      .filter(s => s.imageUrl)
      .map(s => ({ kind: 'image' as const, url: s.imageUrl! }));

    switch (contentType) {
      case 'CAROUSEL': {
        if (renderedImages.length < 2) {
          throw new Error('Carousel content requires at least 2 rendered slides');
        }
        return { type: 'CAROUSEL', media: renderedImages, caption };
      }
      case 'STATIC': {
        if (renderedImages.length === 0) {
          throw new Error('Static content has no rendered image');
        }
        return { type: 'STATIC', media: renderedImages[0], caption };
      }
      case 'REEL': {
        throw new Error(
          'REEL publishing not yet supported — video URL is not modeled on Content/Slide',
        );
      }
    }
  }
}
