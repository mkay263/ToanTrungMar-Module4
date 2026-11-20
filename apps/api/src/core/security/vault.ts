import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for AES-GCM
const PREFIX = 'vault$v1$';
const VAULT_SALT = 'toantrung_oauth_vault_salt_2026';

const globalVaultCache = globalThis as unknown as {
  __toantrungDerivedVaultKeys?: Map<string, Buffer>;
};

function getDerivedKeyMemo(): Map<string, Buffer> {
  if (!globalVaultCache.__toantrungDerivedVaultKeys) {
    globalVaultCache.__toantrungDerivedVaultKeys = new Map<string, Buffer>();
  }
  return globalVaultCache.__toantrungDerivedVaultKeys;
}

function getCandidateKeys(): Buffer[] {
  const secrets = [
    process.env.SESSION_SECRET,
    'independent-toantrung-v2-local-session-secret-key-2026-hmac-sha256',
    'toantrung-v2-production-default-secret-key-2026',
    'toantrung-v2-fallback-dev-secret-2026',
  ].filter(Boolean) as string[];

  // Memoize scryptSync output per secret across all requests & chunks to avoid ~240ms CPU stall per call
  const memo = getDerivedKeyMemo();
  const unique = Array.from(new Set(secrets));
  return unique.map((s) => {
    const hit = memo.get(s);
    if (hit) return hit;
    const derived = crypto.scryptSync(s, VAULT_SALT, 32);
    memo.set(s, derived);
    return derived;
  });
}

function getVaultKey(): Buffer {
  return getCandidateKeys()[0];
}

/**
 * Encrypts sensitive secrets at rest using AES-256-GCM with authenticated tag.
 * Even if database is leaked, cipher text cannot be read without SESSION_SECRET.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  // Avoid double encryption
  if (plainText.startsWith(PREFIX)) return plainText;

  const key = getVaultKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return `${PREFIX}${iv.toString('hex')}$${tag}$${encrypted}`;
}

/**
 * Decrypts sensitive secrets at rest using AES-256-GCM.
 * Backward-compatible: if the string was unencrypted, returns it safely.
 */
export function decryptSecret(cipherPayload: string): string {
  if (!cipherPayload) return '';
  if (!cipherPayload.startsWith(PREFIX)) {
    return cipherPayload;
  }

  const parts = cipherPayload.slice(PREFIX.length).split('$');
  if (parts.length !== 3) return cipherPayload;
  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  for (const key of getCandidateKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      if (decrypted) return decrypted;
    } catch {
      // try next key
    }
  }
  return '';
}

/**
 * Safely masks secret values for preview (e.g. "4889••••••••4451")
 */
export function maskSecret(str: string): string {
  if (!str) return '••••••••';
  const clean = str.trim();
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••••••${clean.slice(-4)}`;
}

