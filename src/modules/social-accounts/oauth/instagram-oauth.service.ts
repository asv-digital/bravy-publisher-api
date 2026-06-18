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

interface TokenDebugInfo {
  app_id?: string;
  type?: string;
  application?: string;
  data_access_expires_at?: number;
  expires_at?: number;
  is_valid: boolean;
  issued_at?: number;
  profile_id?: string;
  scopes?: string[];
  user_id?: string;
  error?: { message: string };
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
    const providerUserId = await this.fetchMeId(longToken);
    const page = await this.findFirstInstagramPage(longToken);

    if (!page.instagram_business_account) {
      throw new BadRequestException(
        'Facebook Page connected has no Instagram Business account linked',
      );
    }

    const { username: igUsername, profilePictureUrl } =
      await this.fetchInstagramProfile(
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
      avatarUrl: profilePictureUrl,
      accessToken: this.encryption.encrypt(page.access_token),
      userAccessToken: this.encryption.encrypt(longToken),
      providerUserId,
      tokenExpiresAt: expiresAt,
      lastRefreshedAt: new Date(),
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
   * Refreshes a Page Access Token by re-deriving it from the stored long-lived
   * user token. Strategy:
   *   1. Decrypt the user token, run `fb_exchange_token` to refresh it (extends
   *      validity by another ~60d).
   *   2. Re-fetch the user's pages and locate the one whose linked Instagram
   *      Business account matches the saved accountId.
   *   3. Persist the new page token + refreshed user token + updated expiry.
   *
   * Idempotent: safe to call repeatedly. Throws if the account has no stored
   * user token (legacy rows from before the user-token column existed) so the
   * cron logs the warning and the user can reconnect.
   */
  async refreshPageToken(socialAccountId: string): Promise<void> {
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: socialAccountId },
    });

    if (!account.userAccessToken) {
      throw new BadRequestException(
        `Account ${socialAccountId} has no stored user token — user must reconnect`,
      );
    }

    const currentUserToken = this.encryption.decrypt(account.userAccessToken);
    const newUserToken = await this.exchangeForLongLived(currentUserToken);
    const pages = await this.listInstagramPages(newUserToken);

    const match = pages.find(
      (p) => p.instagram_business_account?.id === account.accountId,
    );
    if (!match) {
      throw new BadRequestException(
        `Linked Page for IG account ${account.accountId} no longer accessible — user must reconnect`,
      );
    }

    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    // O profile_picture_url do IG é um link de CDN assinado que rota com o
    // tempo — re-busca aqui pra manter o avatar válido. Falha não bloqueia o
    // refresh do token (mantém o avatar antigo se a chamada cair).
    const profilePictureUrl = await this.fetchInstagramProfile(
      account.accountId,
      match.access_token,
    )
      .then((p) => p.profilePictureUrl)
      .catch(() => undefined);

    await this.prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: {
        accessToken: this.encryption.encrypt(match.access_token),
        userAccessToken: this.encryption.encrypt(newUserToken),
        ...(profilePictureUrl ? { avatarUrl: profilePictureUrl } : {}),
        tokenExpiresAt: expiresAt,
        lastRefreshedAt: new Date(),
      },
    });

    this.logger.log(`Refreshed page token for account ${socialAccountId}`);
  }

  /**
   * Diagnostic helper consumed by the `/oauth/instagram/diagnose` endpoint.
   * Returns Meta-side state for a given account (token validity, scopes, linked
   * pages and Instagram accounts) without persisting anything.
   */
  async describeAccount(socialAccountId: string): Promise<{
    accountId: string;
    accountName: string;
    db: {
      tokenExpiresAt: Date | null;
      lastRefreshedAt: Date | null;
      providerUserId: string | null;
      hasUserToken: boolean;
    };
    pageToken: TokenDebugInfo;
    pages: Array<{ id: string; name: string; hasInstagram: boolean; igUsername?: string }>;
  }> {
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: socialAccountId },
    });

    const pageToken = this.encryption.decrypt(account.accessToken);
    const pageTokenDebug = await this.debugToken(pageToken);

    let pages: Array<{ id: string; name: string; hasInstagram: boolean; igUsername?: string }> = [];
    if (account.userAccessToken) {
      try {
        const userToken = this.encryption.decrypt(account.userAccessToken);
        const apiPages = await this.listInstagramPages(userToken);
        pages = await Promise.all(
          apiPages.map(async (p) => {
            const igId = p.instagram_business_account?.id;
            const igUsername = igId
              ? await this.fetchInstagramProfile(igId, p.access_token)
                  .then((profile) => profile.username)
                  .catch(() => undefined)
              : undefined;
            return { id: p.id, name: p.name, hasInstagram: !!igId, igUsername };
          }),
        );
      } catch (err) {
        this.logger.warn(
          `Could not list pages for diagnose of ${socialAccountId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      accountId: account.accountId,
      accountName: account.accountName,
      db: {
        tokenExpiresAt: account.tokenExpiresAt,
        lastRefreshedAt: account.lastRefreshedAt,
        providerUserId: account.providerUserId,
        hasUserToken: !!account.userAccessToken,
      },
      pageToken: pageTokenDebug,
      pages,
    };
  }

  configStatus(): { appIdSet: boolean; appSecretSet: boolean; redirectUri: string | null } {
    return {
      appIdSet: !!this.config.get<string>('META_APP_ID'),
      appSecretSet: !!this.config.get<string>('META_APP_SECRET'),
      redirectUri: this.config.get<string>('META_OAUTH_REDIRECT_URI') ?? null,
    };
  }

  private async fetchMeId(userToken: string): Promise<string> {
    const url = `${GRAPH_BASE}/me?fields=id&access_token=${encodeURIComponent(userToken)}`;
    const json = await this.fetchJson<{ id: string }>('GET', url);
    return json.id;
  }

  private async listInstagramPages(userToken: string): Promise<MetaPage[]> {
    const params = new URLSearchParams({
      fields: 'id,name,access_token,instagram_business_account',
      access_token: userToken,
    });
    const url = `${GRAPH_BASE}/me/accounts?${params.toString()}`;
    const json = await this.fetchJson<MetaPagesResponse>('GET', url);
    return json.data ?? [];
  }

  private async debugToken(token: string): Promise<TokenDebugInfo> {
    const appAccess = `${this.requireConfig('META_APP_ID')}|${this.requireConfig('META_APP_SECRET')}`;
    const url = `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appAccess)}`;
    try {
      const json = await this.fetchJson<{ data: TokenDebugInfo }>('GET', url);
      return json.data;
    } catch (err) {
      return { is_valid: false, error: { message: (err as Error).message } } as TokenDebugInfo;
    }
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

  /**
   * Fetches the public profile (username + avatar) of an Instagram Business
   * account in a single Graph call. `profile_picture_url` is a CDN link that
   * Meta rotates over time, so we re-fetch it on every token refresh.
   */
  private async fetchInstagramProfile(
    igBusinessId: string,
    pageToken: string,
  ): Promise<{ username: string; profilePictureUrl?: string }> {
    const params = new URLSearchParams({
      fields: 'username,profile_picture_url',
      access_token: pageToken,
    });
    const url = `${GRAPH_BASE}/${igBusinessId}?${params.toString()}`;
    const json = await this.fetchJson<{
      username?: string;
      profile_picture_url?: string;
    }>('GET', url);
    return {
      username: json.username ?? `ig_${igBusinessId}`,
      profilePictureUrl: json.profile_picture_url,
    };
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
