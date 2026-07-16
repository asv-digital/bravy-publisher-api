import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { OAuthStateService } from './oauth-state.service';
import { InstagramOAuthService } from './instagram-oauth.service';

@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);

  constructor(
    private readonly state: OAuthStateService,
    private readonly instagram: InstagramOAuthService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Authenticated. Returns the URL the SPA should redirect to.
   * Frontend pattern: `window.location.href = (await api.get('/oauth/instagram/start')).data.authUrl`.
   */
  @Get('instagram/start')
  startInstagram(
    @CurrentUser() user: { userId: string; tenantId: string },
  ): { authUrl: string } {
    const stateToken = this.state.sign({
      tenantId: user.tenantId,
      userId: user.userId,
      platform: 'INSTAGRAM',
    });
    return { authUrl: this.instagram.buildAuthorizationUrl(stateToken) };
  }

  /**
   * Public — Meta hits this directly with `code` + `state` query params.
   * No JWT header; we recover tenant/user context from the signed `state`.
   * Always redirects back to the SPA with a status flag.
   */
  @Public()
  @Get('instagram/callback')
  async callbackInstagram(
    @Query('code') code: string | undefined,
    @Query('state') stateToken: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const returnPath = this.config.get<string>('OAUTH_RETURN_PATH') ?? '/settings/channels';
    const accountsPage = `${frontendUrl}${returnPath}`;

    if (error) {
      this.logger.warn(`OAuth denied by Meta: ${error} — ${errorDescription}`);
      return res.redirect(
        `${accountsPage}?status=error&reason=${encodeURIComponent(error)}`,
      );
    }

    if (!code || !stateToken) {
      throw new BadRequestException('Missing code or state');
    }

    try {
      const payload = this.state.verify(stateToken);
      if (payload.platform !== 'INSTAGRAM') {
        throw new BadRequestException('Platform mismatch in OAuth state');
      }

      const connected = await this.instagram.handleCallback(code, payload.tenantId);
      return res.redirect(
        `${accountsPage}?status=success&accountId=${connected.socialAccountId}&accountName=${encodeURIComponent(connected.accountName)}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown OAuth error';
      this.logger.error(`OAuth callback failed: ${message}`);
      return res.redirect(
        `${accountsPage}?status=error&reason=${encodeURIComponent(message)}`,
      );
    }
  }

  /**
   * Authenticated diagnostic endpoint — returns the Meta-side state of every
   * Instagram account the current tenant has connected, plus our app config.
   * Use this to quickly answer "why isn't publishing working?" without
   * re-running the OAuth dance:
   *   - is META_APP_ID/SECRET configured?
   *   - is each stored token still valid (debug_token result)?
   *   - which pages does the user own, and which have IG Business linked?
   *   - when was each token last refreshed?
   */
  @Get('instagram/diagnose')
  async diagnoseInstagram(
    @CurrentUser() user: { userId: string; tenantId: string },
  ) {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { tenantId: user.tenantId, platform: 'INSTAGRAM' },
      orderBy: { createdAt: 'desc' },
    });

    const descriptions = await Promise.all(
      accounts.map(async (a) => {
        try {
          return { id: a.id, ...(await this.instagram.describeAccount(a.id)) };
        } catch (err) {
          return {
            id: a.id,
            accountId: a.accountId,
            accountName: a.accountName,
            error: (err as Error).message,
          };
        }
      }),
    );

    return {
      config: this.instagram.configStatus(),
      accounts: descriptions,
    };
  }

  /**
   * Manually trigger a Page Token refresh for a single account. Useful for
   * verifying the refresh path end-to-end without waiting for the daily cron.
   */
  @Post('instagram/:accountId/refresh')
  async manualRefresh(
    @CurrentUser() user: { userId: string; tenantId: string },
    @Param('accountId') accountId: string,
  ): Promise<{ refreshed: boolean }> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { id: accountId, tenantId: user.tenantId },
    });
    if (!account) {
      throw new BadRequestException(`Account ${accountId} not found for tenant`);
    }
    await this.instagram.refreshPageToken(accountId);
    return { refreshed: true };
  }
}
