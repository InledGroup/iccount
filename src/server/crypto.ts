/**
 * Primitivas criptográficas del servidor.
 *
 * Todo se apoya en la Web Crypto API nativa (disponible en Workers). No hay
 * dependencias de Node.js ni implementaciones criptográficas propias.
 */

const encoder = new TextEncoder();

const EMPTY_SALT = new Uint8Array(0);

// ---------------------------------------------------------------------------
// Codificación
// ---------------------------------------------------------------------------

export function base64UrlEncode(input: ArrayBuffer | ArrayBufferView | Uint8Array): string {
  const bytes =
    input instanceof Uint8Array
      ? input
      : ArrayBuffer.isView(input)
        ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
        : new Uint8Array(input);

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

/** Token opaco en base64url (32 bytes = 256 bits por defecto). */
export function randomToken(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes));
}

/** Comparación en tiempo constante para secretos de igual longitud. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// HMAC / subclaves derivadas de PEPPER_KEY
// ---------------------------------------------------------------------------

const pepperCache = new Map<string, CryptoKey>();

/**
 * Deriva una subclave HMAC independiente de PEPPER_KEY mediante HKDF.
 * Así un mismo secreto raíz sirve para blind index, pepper de auth y
 * parámetros KDF sin reutilizar material de clave entre contextos.
 */
async function pepperSubkey(rootKey: string, info: string): Promise<CryptoKey> {
  const cacheKey = `${info}:${rootKey.length}`;
  const cached = pepperCache.get(cacheKey);
  if (cached) return cached;

  const ikm = await crypto.subtle.importKey('raw', base64UrlDecode(rootKey), 'HKDF', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: EMPTY_SALT, info: encoder.encode(info) },
    ikm,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
  pepperCache.set(cacheKey, key);
  return key;
}

async function hmac(key: CryptoKey, message: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return base64UrlEncode(signature);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Identificador determinista del email: HMAC-SHA256 con subclave propia. */
export async function blindIndexFor(env: Env, email: string): Promise<string> {
  const key = await pepperSubkey(env.PEPPER_KEY, 'iccount/email-blind-index/v1');
  return hmac(key, normalizeEmail(email));
}

/** Verificador de la authKey del cliente. Nunca se guarda la authKey. */
export async function authHashFor(env: Env, authKey: string): Promise<string> {
  const key = await pepperSubkey(env.PEPPER_KEY, 'iccount/auth-hash/v1');
  return hmac(key, authKey);
}

/**
 * Parámetros KDF falsos pero deterministas para emails no registrados.
 * Evita que /api/auth/salt sirva como oráculo de existencia de cuentas.
 */
export async function decoyKdfParams(env: Env, blindIndex: string): Promise<KdfParams> {
  const key = await pepperSubkey(env.PEPPER_KEY, 'iccount/kdf-decoy/v1');
  const material = base64UrlDecode(await hmac(key, blindIndex));
  return {
    kdfSalt: base64UrlEncode(material.slice(0, 16)),
    kdfIterations: 600_000,
  };
}

export interface KdfParams {
  kdfSalt: string;
  kdfIterations: number;
}

// ---------------------------------------------------------------------------
// Hash de códigos y secretos OAuth
// ---------------------------------------------------------------------------

/** SHA-256 base64url. Se usa para códigos de autorización y secretos de cliente. */
export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return base64UrlEncode(digest);
}

// ---------------------------------------------------------------------------
// Cifrado del servidor (solo para la copia "recoverable" del perfil)
// ---------------------------------------------------------------------------

const serverKeyCache = new Map<string, CryptoKey>();

async function serverAesKey(env: Env): Promise<CryptoKey> {
  const cacheKey = env.SERVER_ENC_KEY;
  const cached = serverKeyCache.get(cacheKey);
  if (cached) return cached;

  const raw = base64UrlDecode(env.SERVER_ENC_KEY);
  if (raw.byteLength !== 32) throw new Error('SERVER_ENC_KEY debe tener 32 bytes');
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  serverKeyCache.set(cacheKey, key);
  return key;
}

const SERVER_AAD = encoder.encode('iccount/server-sealed/v1');

/** AES-256-GCM. Devuelve base64url(iv || ciphertext). */
export async function sealForServer(env: Env, plaintext: string): Promise<string> {
  const key = await serverAesKey(env);
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: SERVER_AAD },
    key,
    encoder.encode(plaintext),
  );
  const out = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ciphertext), iv.byteLength);
  return base64UrlEncode(out);
}

export async function openFromServer(env: Env, payload: string): Promise<string | null> {
  try {
    const raw = base64UrlDecode(payload);
    if (raw.byteLength < 13) return null;
    const key = await serverAesKey(env);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: SERVER_AAD },
      key,
      raw.slice(12),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}
