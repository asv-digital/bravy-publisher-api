import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';

export interface OAuthStatePayload {
  tenantId: string;
  userId: string;
  platform: 'INSTAGRAM' | 'LINKEDIN' | 'TIKTOK' | 'TWITTER';
  csrf: string;
}

/**
 * State token carried through the OAuth redirect dance.
 *
 * Stateless — no DB row required. We sign a short-lived JWT with the user/tenant
 * context plus a random CSRF nonce, hand it to Meta as the `state` query param,
 * and verify it back when the user lands on the callback. Same secret as the
 * app JWT (already vetted by `assertEnv`), 15-minute TTL.
 */
@Injectable()
export class OAuthStateService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  sign(payload: Omit<OAuthStatePayload, 'csrf'>): string {
    const csrf = randomBytes(16).toString('hex');
    return this.jwt.sign(
      { ...payload, csrf },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '15m',
      },
    );
  }

  verify(token: string): OAuthStatePayload {
    try {
      return this.jwt.verify<OAuthStatePayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
  }
}
