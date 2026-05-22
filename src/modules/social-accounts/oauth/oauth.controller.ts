import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
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
    const returnPath = this.config.get<string>('OAUTH_RETURN_PATH') ?? '/settings/canais';
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
}
