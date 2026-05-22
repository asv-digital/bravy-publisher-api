import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const KEY_LEN = 32;
const SEPARATOR = ':';

/**
 * Symmetric AES-256-GCM encryption for secrets at rest (OAuth tokens, etc).
 *
 * Stored format: `<iv_b64>:<authTag_b64>:<ciphertext_b64>`.
 *
 * Key resolution:
 *   1. ENCRYPTION_KEY env (base64-encoded 32 bytes — generate with `openssl rand -base64 32`)
 *   2. dev/test fallback: SHA-256(JWT_SECRET) — logs a warning, never used in production
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.key = this.resolveKey();
  }

  private resolveKey(): Buffer {
    const raw = this.config.get<string>('ENCRYPTION_KEY');
    if (raw && raw.length > 0) {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length !== KEY_LEN) {
        throw new Error(
          `ENCRYPTION_KEY must decode to ${KEY_LEN} bytes (got ${buf.length})`,
        );
      }
      return buf;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY is required in production');
    }

    const seed = this.config.get<string>('JWT_SECRET');
    if (!seed) {
      throw new Error(
        'Neither ENCRYPTION_KEY nor JWT_SECRET is set — cannot derive encryption key',
      );
    }
    this.logger.warn(
      'ENCRYPTION_KEY missing; deriving from JWT_SECRET (dev/test only)',
    );
    return createHash('sha256').update(seed).digest();
  }

  encrypt(plaintext: string): string {
    if (plaintext.length === 0) return plaintext;
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(SEPARATOR);
  }

  decrypt(payload: string): string {
    if (payload.length === 0) return payload;
    const parts = payload.split(SEPARATOR);
    if (parts.length !== 3) {
      // Backwards compat: payload predates encryption — return raw and warn once.
      this.logger.warn('Decrypt called on non-encrypted payload; returning as-is');
      return payload;
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  }

  isEncrypted(payload: string | null | undefined): boolean {
    if (!payload) return false;
    const parts = payload.split(SEPARATOR);
    return parts.length === 3 && parts.every((p) => p.length > 0);
  }
}
