import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PublishCronService {
  private readonly logger = new Logger(PublishCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('publish') private readonly publishQueue: Queue,
  ) {}

  @Cron('* * * * *')
  async handlePendingPublishes() {
    const now = new Date();

    const targets = await this.prisma.publishTarget.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: now },
      },
      select: { id: true },
    });

    if (targets.length === 0) return;

    this.logger.log(`Found ${targets.length} target(s) ready to publish`);

    const ids = targets.map((t) => t.id);

    await this.prisma.publishTarget.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    await this.publishQueue.addBulk(
      ids.map((publishTargetId) => ({
        name: 'publish-content',
        data: { publishTargetId },
      })),
    );

    this.logger.log(`Enqueued ${ids.length} target(s) for publishing`);
  }
}
