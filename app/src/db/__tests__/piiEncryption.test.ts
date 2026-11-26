import { describe, it, expect, beforeEach } from 'vitest';
import { encryptPII, decryptPII } from '../index';

describe('PII Encryption & Decryption', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('handles empty strings gracefully', async () => {
    expect(await encryptPII('')).toBe('');
    expect(await decryptPII('')).toBe('');
  });

  it('successfully encrypts and decrypts a phone number', async () => {
    const phone = '9876543210';
    const cipher = await encryptPII(phone);

    expect(cipher).toBeDefined();
    expect(cipher).not.toBe(phone);

    const decrypted = await decryptPII(cipher);
    expect(decrypted).toBe(phone);
  });

  it('produces distinct ciphertexts for identical plaintext due to random IV', async () => {
    const text = '9123456780';
    const cipher1 = await encryptPII(text);
    const cipher2 = await encryptPII(text);

    expect(cipher1).not.toBe(cipher2);
    expect(await decryptPII(cipher1)).toBe(text);
    expect(await decryptPII(cipher2)).toBe(text);
  });
});
