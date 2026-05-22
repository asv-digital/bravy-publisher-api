import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Platform } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { EncryptionService } from '../../../common/services/encryption.service';

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DIALOG_BASE = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
] as const;

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

interface MetaPagesResponse {
  data: MetaPage[];
}

interface ConnectedAccount {
  socialAccountId: string;
  accountName: string;
  accountId: string;
}

/**
 * Instagram Business Login — exchanges an OAuth `code` for a long-lived user
 * token, finds the first Facebook Page linked to an Instagram Business account,
 * and persists the resulting Page Access Token (which is what /publish needs).
 *
 * Required env: META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI.
 */
@Injectable()
export class InstagramOAuthService {
  private readonly logger = new Logger(InstagramOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.requireConfig('META_APP_ID'),
      redirect_uri: this.requireConfig('META_OAUTH_REDIRECT_URI'),
      state,
      scope: REQUIRED_SCOPES.join(','),
      response_type: 'code',
    });
    return `${DIALOG_BASE}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    tenantId: string,
  ): Promise<ConnectedAccount> {
    const shortToken = await this.exchangeCodeForToken(code);
    const longToken = await this.exchangeForLongLived(shortToken);
    const page = await this.findFirstInstagramPage(longToken);

    if (!page.instagram_business_account) {
      throw new BadRequestException(
        'Facebook Page connected has no Instagram Business account linked',
      );
    }

    const igUsername = await this.fetchInstagramUsername(
      page.instagram_business_account.id,
      page.access_token,
    );

    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // ~60d

    const existing = await this.prisma.socialAccount.findFirst({
      where: {
        tenantId,
        platform: Platform.INSTAGRAM,
        accountId: page.instagram_business_account.id,
      },
    });

    const data = {
      tenantId,
      platform: Platform.INSTAGRAM,
      accountName: igUsername,
      accountId: page.instagram_business_account.id,
      accessToken: this.encryption.encrypt(page.access_token),
      tokenExpiresAt: expiresAt,
    };

    const account = existing
      ? await this.prisma.socialAccount.update({ where: { id: existing.id }, data })
      : await this.prisma.socialAccount.create({ data });

    this.logger.log(
      `Connected IG account @${igUsername} (${account.accountId}) for tenant ${tenantId}`,
    );

    return {
      socialAccountId: account.id,
      accountName: account.accountName,
      accountId: account.accountId,
    };
  }

  /**
   * Refreshes an existing Page Access Token by re-deriving it from a new
   * long-lived user token. Used by `TokenRefreshService` on the cron schedule.
   *
   * `refreshToken` here is the long-lived USER access token previously stored;
   * we don't keep it separately right now (page tokens derived from a non-
   * expiring system user don't expire), so the refresh path is a no-op until
   * we wire user-level refresh tokens. Kept as a stub so the cron has a hook.
   */
  async refreshPageToken(socialAccountId: string): Promise<void> {
    this.logger.warn(
      `refreshPageToken(${socialAccountId}) — re-derive not yet implemented; ` +
        `user must reconnect when token approaches expiry`,
    );
  }

  private async exchangeCodeForToken(code: string): Promise<string> {
    const params = new URLSearchParams({
      client_id: this.requireConfig('META_APP_ID'),
      client_secret: this.requireConfig('META_APP_SECRET'),
      redirect_uri: this.requireConfig('META_OAUTH_REDIRECT_URI'),
      code,
    });
    const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
    const json = await this.fetchJson<MetaTokenResponse>('GET', url);
    if (!json.access_token) {
      throw new InternalServerErrorException('Meta returned no access_token');
    }
    return json.access_token;
  }

  private async exchangeForLongLived(shortToken: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.requireConfig('META_APP_ID'),
      client_secret: this.requireConfig('META_APP_SECRET'),
      fb_exchange_token: shortToken,
    });
    const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`;
    const json = await this.fetchJson<MetaTokenResponse>('GET', url);
    if (!json.access_token) {
      throw new InternalServerErrorException(
        'Meta returned no long-lived access_token',
      );
    }
    return json.access_token;
  }

  private async findFirstInstagramPage(userToken: string): Promise<MetaPage> {
    const params = new URLSearchParams({
      fields: 'id,name,access_token,instagram_business_account',
      access_token: userToken,
    });
    const url = `${GRAPH_BASE}/me/accounts?${params.toString()}`;
    const json = await this.fetchJson<MetaPagesResponse>('GET', url);

    if (!json.data || json.data.length === 0) {
      throw new BadRequestException(
        'No Facebook Pages found for this user. Connect a Page first.',
      );
    }

    const withIg = json.data.find((p) => p.instagram_business_account?.id);
    if (!withIg) {
      throw new BadRequestException(
        'None of your Pages have an Instagram Business account linked.',
      );
    }
    return withIg;
  }

  private async fetchInstagramUsername(
    igBusinessId: string,
    pageToken: string,
  ): Promise<string> {
    const params = new URLSearchParams({
      fields: 'username',
      access_token: pageToken,
    });
    const url = `${GRAPH_BASE}/${igBusinessId}?${params.toString()}`;
    const json = await this.fetchJson<{ username: string }>('GET', url);
    return json.username ?? `ig_${igBusinessId}`;
  }

  private async fetchJson<T>(method: 'GET' | 'POST', url: string): Promise<T> {
    const res = await fetch(url, { method });
    const text = await res.text();
    if (!res.ok) {
      throw new InternalServerErrorException(
        `Meta API ${method} ${url.split('?')[0]} failed: HTTP ${res.status} — ${text.slice(0, 300)}`,
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new InternalServerErrorException(
        `Meta API returned non-JSON: ${text.slice(0, 200)}`,
      );
    }
  }

  private requireConfig(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) {
      throw new InternalServerErrorException(
        `Missing required env var: ${key}`,
      );
    }
    return v;
  }
}
