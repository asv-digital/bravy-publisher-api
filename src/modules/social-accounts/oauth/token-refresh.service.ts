import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { InstagramOAuthService } from './instagram-oauth.service';

const WARN_WINDOW_DAYS = 7;
const REFRESH_WINDOW_DAYS = 14;

@Injectable()
export class TokenRefreshService {
  private readonly logger = new Logger(TokenRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instagram: InstagramOAuthService,
  ) {}

  /**
   * Daily at 03:00 — looks for tokens approaching expiry and either refreshes
   * them (Instagram) or logs a warning so the team can prompt the user to
   * reconnect. Other platforms get a passive warn until their adapters land.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    const now = new Date();
    const refreshThreshold = new Date(
      now.getTime() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const candidates = await this.prisma.socialAccount.findMany({
      where: {
        tokenExpiresAt: { lte: refreshThreshold },
      },
    });

    if (candidates.length === 0) return;

    this.logger.log(
      `Token sweep: ${candidates.length} account(s) approaching expiry`,
    );

    for (const account of candidates) {
      const daysLeft = account.tokenExpiresAt
        ? Math.round((account.tokenExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      if (account.platform === 'INSTAGRAM') {
        try {
          await this.instagram.refreshPageToken(account.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'unknown';
          this.logger.error(
            `Failed to refresh IG token for ${account.id}: ${msg}`,
          );
        }
        continue;
      }

      if (daysLeft !== null && daysLeft <= WARN_WINDOW_DAYS) {
        this.logger.warn(
          `Account ${account.id} (${account.platform}) token expires in ${daysLeft} day(s) — manual reconnect needed`,
        );
      }
    }
  }
}
