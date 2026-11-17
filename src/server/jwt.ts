/**
 * Firma y verificación de JWT con `jose` (ES256).
 *
 * Un único par de claves firma los tres tipos de token del sistema; el claim
 * `aud` los separa para que ninguno pueda reutilizarse en otro contexto:
 *
 *   - sesión SSO       -> aud = "iccount:session"
 *   - petición OAuth   -> aud = "iccount:oauth-request"
 *   - access token     -> aud = client_id
 *   - id_token         -> aud = client_id
 */

import { SignJWT, jwtVerify, importJWK, calculateJwkThumbprint, type JWK, type JWTPayload } from 'jose';

export const SESSION_AUDIENCE = 'iccount:session';
export const OAUTH_REQUEST_AUDIENCE = 'iccount:oauth-request';

export function issuerFor(env: Env): string {
  return (env.ISSUER || 'https://iccount.inled.es').replace(/\/+$/, '');
}

interface SigningMaterial {
  privateKey: CryptoKey;
  publicJwk: JWK;
  kid: string;
}

let cached: SigningMaterial | null = null;
let cachedSource = '';

export async function signingMaterial(env: Env): Promise<SigningMaterial> {
  if (cached && cachedSource === env.SIGNING_JWK) return cached;
  if (!env.SIGNING_JWK) {
    throw new Error(
      'SIGNING_JWK no está configurado. Ejecuta `npm run gen:keys` o usa `wrangler secret put SIGNING_JWK`.',
    );
  }

  const jwk = JSON.parse(env.SIGNING_JWK) as JWK;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new Error('SIGNING_JWK debe ser una clave EC P-256 (ES256)');
  }

  // La clave pública se reconstruye explícitamente: nunca se publica `d`.
  const publicJwk: JWK = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  const kid = await calculateJwkThumbprint(publicJwk, 'sha256');
  const privateKey = (await importJWK(jwk, 'ES256')) as CryptoKey;

  cached = { privateKey, publicJwk: { ...publicJwk, kid, use: 'sig', alg: 'ES256' }, kid };
  cachedSource = env.SIGNING_JWK;
  return cached;
}

export async function publicJwks(env: Env): Promise<{ keys: JWK[] }> {
  const { publicJwk } = await signingMaterial(env);
  return { keys: [publicJwk] };
}

export interface SignOptions {
  audience: string;
  subject: string;
  expiresInSeconds: number;
  claims?: JWTPayload;
}

export async function signJwt(env: Env, options: SignOptions): Promise<string> {
  const { privateKey, kid } = await signingMaterial(env);
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ ...options.claims })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid })
    .setIssuer(issuerFor(env))
    .setSubject(options.subject)
    .setAudience(options.audience)
    .setIssuedAt(now)
    .setNotBefore(now - 5)
    .setExpirationTime(now + options.expiresInSeconds)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

export async function verifyJwt(
  env: Env,
  token: string,
  audience: string,
): Promise<JWTPayload | null> {
  try {
    const { publicJwk } = await signingMaterial(env);
    const key = await importJWK(publicJwk, 'ES256');
    const { payload } = await jwtVerify(token, key, {
      issuer: issuerFor(env),
      audience,
      algorithms: ['ES256'],
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Verifica emisor, firma y caducidad sin fijar `aud`. Solo para el access
 * token, cuya audiencia es el client_id que lo solicitó: quien lo valida
 * comprueba después que ese cliente siga registrado.
 */
export async function verifyJwtAnyAudience(
  env: Env,
  token: string,
): Promise<JWTPayload | null> {
  try {
    const { publicJwk } = await signingMaterial(env);
    const key = await importJWK(publicJwk, 'ES256');
    const { payload } = await jwtVerify(token, key, {
      issuer: issuerFor(env),
      algorithms: ['ES256'],
    });
    return payload;
  } catch {
    return null;
  }
}

/** at_hash del id_token: mitad izquierda del SHA-256 del access token. */
export async function accessTokenHash(accessToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken));
  const bytes = new Uint8Array(digest).slice(0, 16);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
