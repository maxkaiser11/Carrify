import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for reversible secrets (e.g. shared account passwords the
 * booster must read back). AES-256-GCM gives confidentiality + integrity.
 *
 * Stored format: `v1.<base64(iv ‖ authTag ‖ ciphertext)>`. The `v1` prefix lets us
 * rotate schemes/keys later, and lets decrypt() pass through pre-encryption plaintext.
 *
 * Key: CREDENTIALS_ENCRYPTION_KEY — 32 bytes, base64 (generate: `openssl rand -base64 32`).
 * Production: source this from a secrets manager / KMS, not a flat env file.
 */
const SCHEME = 'v1';
const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.getOrThrow<string>('CREDENTIALS_ENCRYPTION_KEY');
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'CREDENTIALS_ENCRYPTION_KEY must decode to 32 bytes. Generate one with: openssl rand -base64 32',
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${SCHEME}.${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
  }

  decrypt(stored: string): string {
    // Rows written before encryption was added are bare plaintext — pass them through.
    if (!stored.startsWith(`${SCHEME}.`)) return stored;

    const buf = Buffer.from(stored.slice(SCHEME.length + 1), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = buf.subarray(IV_LEN + TAG_LEN);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
