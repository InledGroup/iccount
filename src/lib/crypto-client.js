/**
 * Iccount — cliente criptográfico zero-knowledge (navegador).
 *
 * Contrato:
 *  1. PBKDF2-SHA256(Master Password, kdf_salt, 600.000 iteraciones) -> 256 bits.
 *  2. HKDF-SHA256 sobre esos bits, con `info` distinto, produce:
 *       - authKey        (se envía al servidor; solo se usa como verificador)
 *       - encryptionKey  (nunca sale del navegador)
 *  3. La clave de usuario (AES-256-GCM, aleatoria) cifra el perfil y el email.
 *     Se envuelve con encryptionKey (login normal) y con la Recovery Key.
 *
 * El servidor recibe únicamente: authKey, blobs cifrados, sales y parámetros.
 */

const te = new TextEncoder();
const td = new TextDecoder();

/** Iteraciones por defecto de PBKDF2-SHA256. */
export const KDF_DEFAULT_ITERATIONS = 600_000;

const HKDF_SALT = te.encode('iccount-hkdf-v1');
const INFO_AUTH = te.encode('iccount/auth/v1');
const INFO_ENCRYPTION = te.encode('iccount/enc/v1');
const INFO_RECOVERY = te.encode('iccount/recovery/v1');

const AAD_USER_KEY = te.encode('iccount/user-key/v1');
const AAD_EMAIL = te.encode('iccount/email/v1');
const AAD_PROFILE = te.encode('iccount/profile/v1');
const AAD_RECOVERY = te.encode('iccount/recovery-wrap/v1');

const IV_BYTES = 12;
const USER_KEY_BYTES = 32;
const RECOVERY_KEY_BYTES = 32;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && Boolean(crypto.subtle);
}

export function toBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value) {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalised + '='.repeat((4 - (normalised.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}

async function hkdf(masterBits, info, length = 32) {
  const key = await crypto.subtle.importKey('raw', masterBits, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

async function seal(key, plaintextBytes, additionalData) {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintextBytes),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return toBase64Url(out);
}

async function open(key, payload, additionalData) {
  const raw = fromBase64Url(payload);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: raw.slice(0, IV_BYTES), additionalData },
    key,
    raw.slice(IV_BYTES),
  );
  return new Uint8Array(plaintext);
}

// ---------------------------------------------------------------------------
// Derivación de claves
// ---------------------------------------------------------------------------

/**
 * Deriva las claves de autenticación y cifrado de la Master Password.
 * @returns {Promise<{ authKey: string, encryptionKey: CryptoKey }>}
 */
export async function deriveKeys({ password, salt, iterations = KDF_DEFAULT_ITERATIONS }) {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto no está disponible. Usa HTTPS o localhost.');
  }

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    te.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const masterBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64Url(salt),
      iterations,
    },
    passwordKey,
    256,
  );

  const authKeyBits = await hkdf(masterBits, INFO_AUTH);
  const encryptionBits = await hkdf(masterBits, INFO_ENCRYPTION);

  return {
    authKey: toBase64Url(authKeyBits),
    encryptionKey: await importAesKey(encryptionBits),
  };
}

// ---------------------------------------------------------------------------
// Clave de usuario y Recovery Key
// ---------------------------------------------------------------------------

/** Clave AES-256 aleatoria del usuario, junto a sus bytes para poder envolverla. */
function generateUserKey() {
  const raw = randomBytes(USER_KEY_BYTES);
  return { raw, keyPromise: importAesKey(raw) };
}

/** Recovery Key: 32 bytes aleatorios mostrados como 8 grupos hexadecimales. */
export function generateRecoveryKey() {
  return randomBytes(RECOVERY_KEY_BYTES);
}

const HEX = '0123456789ABCDEF';

export function formatRecoveryKey(bytes) {
  let hex = '';
  for (const byte of bytes) hex += HEX[byte >> 4] + HEX[byte & 0x0f];
  return hex.match(/.{1,8}/g).join('-');
}

export function parseRecoveryKey(text) {
  const hex = text.toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== RECOVERY_KEY_BYTES * 2) {
    throw new Error('La Recovery Key debe tener 64 caracteres hexadecimales.');
  }
  const bytes = new Uint8Array(RECOVERY_KEY_BYTES);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

// ---------------------------------------------------------------------------
// Material de registro
// ---------------------------------------------------------------------------

/**
 * Genera todo lo que el servidor necesita en el registro. La contraseña y la
 * encryptionKey no se incluyen en el resultado.
 *
 * @param {object} input
 * @param {string} input.email
 * @param {string} input.password
 * @param {string} [input.name]
 * @param {string} [input.picture]
 * @param {boolean} [input.emailRecoverable]
 */
export async function createRegistrationMaterial({
  email,
  password,
  name = '',
  picture = '',
  emailRecoverable = false,
}) {
  const saltBytes = randomBytes(16);
  const salt = toBase64Url(saltBytes);
  const iterations = KDF_DEFAULT_ITERATIONS;

  const { authKey, encryptionKey } = await deriveKeys({ password, salt, iterations });

  const userKey = generateUserKey();
  const userKeyAes = await userKey.keyPromise;

  const encryptedUserKey = await seal(encryptionKey, userKey.raw, AAD_USER_KEY);

  const recoveryKey = generateRecoveryKey();
  const recoveryAes = await importAesKey(await hkdf(recoveryKey, INFO_RECOVERY));
  const recoveryWrappedUserKey = await seal(recoveryAes, userKey.raw, AAD_RECOVERY);

  const encryptedEmail = await seal(userKeyAes, te.encode(email), AAD_EMAIL);
  const encryptedProfile = await seal(
    userKeyAes,
    te.encode(JSON.stringify({ email, name, picture })),
    AAD_PROFILE,
  );

  return {
    payload: {
      email,
      kdfSalt: salt,
      kdfIterations: iterations,
      authKey,
      encryptedEmail,
      encryptedUserKey,
      encryptedProfile,
      recoveryWrappedUserKey,
      emailRecoverable,
      recoverableProfile: emailRecoverable ? { name, picture } : undefined,
    },
    recoveryKeyText: formatRecoveryKey(recoveryKey),
  };
}

/**
 * Descifra el perfil del usuario en el navegador. Requiere la contraseña: la
 * clave de usuario solo se puede desenvolver con la Master Password o con la
 * Recovery Key.
 */
export async function decryptProfile({ password, kdfSalt, kdfIterations, encryptedUserKey, encryptedProfile }) {
  const { encryptionKey } = await deriveKeys({
    password,
    salt: kdfSalt,
    iterations: kdfIterations,
  });
  const userKeyRaw = await open(encryptionKey, encryptedUserKey, AAD_USER_KEY);
  const userKey = await importAesKey(userKeyRaw);
  const profileBytes = await open(userKey, encryptedProfile, AAD_PROFILE);
  return JSON.parse(td.decode(profileBytes));
}

/** Comprueba que el material de recuperación permite abrir la clave de usuario. */
export async function unwrapUserKeyWithRecoveryKey({ recoveryKeyText, recoveryWrappedUserKey }) {
  const recoveryKey = parseRecoveryKey(recoveryKeyText);
  const recoveryAes = await importAesKey(await hkdf(recoveryKey, INFO_RECOVERY));
  return open(recoveryAes, recoveryWrappedUserKey, AAD_RECOVERY);
}

export { sha256 };
