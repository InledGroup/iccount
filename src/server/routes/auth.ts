/**
 * Registro e inicio de sesión zero-knowledge.
 *
 * El navegador envía:
 *   - authKey   (HKDF de la Master Password, PBKDF2-SHA256 600k)
 *   - blobs cifrados con la clave del usuario (email, user key, perfil)
 *
 * El servidor nunca recibe la contraseña ni la clave de cifrado: solo la
 * authKey, de la que deriva un HMAC que sí almacena.
 */

import { Hono } from 'hono';
import {
  authHashFor,
  blindIndexFor,
  decoyKdfParams,
  normalizeEmail,
  openFromServer,
  sealForServer,
  timingSafeEqual,
} from '../crypto';
import {
  findUserByEmail,
  findUserById,
  insertUser,
  nowSeconds,
  type UserRow,
} from '../db';
import { buildClearedSessionCookie, createSession, readSession } from '../session';
import { NO_STORE, isBase64UrlField, isEmail, rejectCrossOrigin } from '../http';
import type { AppEnv } from '../types';

const MIN_KDF_ITERATIONS = 100_000;
const MAX_KDF_ITERATIONS = 2_000_000;

const auth = new Hono<AppEnv>();

interface RegistrationBody {
  email?: unknown;
  kdfSalt?: unknown;
  kdfIterations?: unknown;
  authKey?: unknown;
  encryptedEmail?: unknown;
  encryptedUserKey?: unknown;
  encryptedProfile?: unknown;
  recoveryWrappedUserKey?: unknown;
  emailRecoverable?: unknown;
  recoverableProfile?: unknown;
}

interface RecoverableProfileInput {
  name?: unknown;
  picture?: unknown;
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    emailRecoverable: user.email_recoverable === 1,
    kdfSalt: user.kdf_salt,
    kdfIterations: user.kdf_iterations,
    encryptedUserKey: user.encrypted_user_key,
    encryptedProfile: user.encrypted_profile,
  };
}

/** Parámetros KDF para derivar claves (públicamente necesarios antes del login). */
auth.post('/salt', async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => ({}) as { email?: unknown });
  if (!isEmail(body.email)) return c.json({ error: 'invalid_request' }, 400, NO_STORE);

  const blindIndex = await blindIndexFor(c.env, body.email);
  const user = await findUserByEmail(c.env.DB, blindIndex);

  const params = user
    ? { kdfSalt: user.kdf_salt, kdfIterations: user.kdf_iterations }
    : await decoyKdfParams(c.env, blindIndex);

  return c.json(params, 200, NO_STORE);
});

auth.post('/register', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const body = await c
    .req
    .json<RegistrationBody>()
    .catch(() => ({}) as RegistrationBody);

  if (!isEmail(body.email)) return c.json({ error: 'invalid_email' }, 400, NO_STORE);
  if (
    typeof body.kdfIterations !== 'number' ||
    !Number.isInteger(body.kdfIterations) ||
    body.kdfIterations < MIN_KDF_ITERATIONS ||
    body.kdfIterations > MAX_KDF_ITERATIONS
  ) {
    return c.json({ error: 'invalid_kdf_iterations' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.kdfSalt, { minBytes: 16, maxBytes: 32 })) {
    return c.json({ error: 'invalid_kdf_salt' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.authKey, { minBytes: 32, maxBytes: 32 })) {
    return c.json({ error: 'invalid_auth_key' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.encryptedUserKey, { minBytes: 44, maxBytes: 512 })) {
    return c.json({ error: 'invalid_user_key' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.recoveryWrappedUserKey, { minBytes: 44, maxBytes: 512 })) {
    return c.json({ error: 'invalid_recovery_key' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.encryptedEmail, { minBytes: 28, maxBytes: 2048 })) {
    return c.json({ error: 'invalid_encrypted_email' }, 400, NO_STORE);
  }
  if (!isBase64UrlField(body.encryptedProfile, { minBytes: 28, maxBytes: 8192 })) {
    return c.json({ error: 'invalid_encrypted_profile' }, 400, NO_STORE);
  }

  const email = normalizeEmail(body.email);
  const emailRecoverable = body.emailRecoverable === true;

  let recoverableProfile: string | null = null;
  if (emailRecoverable) {
    const input: RecoverableProfileInput =
      typeof body.recoverableProfile === 'object' && body.recoverableProfile !== null
        ? (body.recoverableProfile as RecoverableProfileInput)
        : {};
    const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
    const picture = typeof input.picture === 'string' ? input.picture.trim().slice(0, 512) : '';

    recoverableProfile = await sealForServer(
      c.env,
      JSON.stringify({ email, name: name || null, picture: picture || null }),
    );
  }

  const blindIndex = await blindIndexFor(c.env, email);
  const id = crypto.randomUUID();

  const inserted = await insertUser(c.env.DB, {
    id,
    emailBlindIndex: blindIndex,
    encryptedEmail: body.encryptedEmail,
    emailRecoverable,
    recoverableProfile,
    authHash: await authHashFor(c.env, body.authKey),
    kdfSalt: body.kdfSalt,
    kdfIterations: body.kdfIterations,
    encryptedUserKey: body.encryptedUserKey,
    recoveryWrappedUserKey: body.recoveryWrappedUserKey,
    encryptedProfile: body.encryptedProfile,
    createdAt: nowSeconds(),
  });

  if (!inserted) {
    // Mismo mensaje para cuenta existente y para cualquier conflicto: no se
    // añade más superficie de enumeración de la que ya expone el registro.
    return c.json({ error: 'email_unavailable' }, 409, NO_STORE);
  }

  const session = await createSession(c.env, id);
  c.header('set-cookie', session.cookie);

  return c.json({ user: { id } }, 201, NO_STORE);
});

auth.post('/login', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const body = await c
    .req
    .json<{ email?: unknown; authKey?: unknown }>()
    .catch(() => ({}) as { email?: unknown; authKey?: unknown });
  if (!isEmail(body.email) || !isBase64UrlField(body.authKey, { minBytes: 32, maxBytes: 64 })) {
    return c.json({ error: 'invalid_request' }, 400, NO_STORE);
  }

  const blindIndex = await blindIndexFor(c.env, body.email);
  const user = await findUserByEmail(c.env.DB, blindIndex);

  if (!user) {
    // Trabajo equivalente al de un login válido: mitiga el oráculo temporal.
    await authHashFor(c.env, body.authKey);
    return c.json({ error: 'invalid_credentials' }, 401, NO_STORE);
  }

  const candidate = await authHashFor(c.env, body.authKey);
  if (!timingSafeEqual(candidate, user.auth_hash)) {
    return c.json({ error: 'invalid_credentials' }, 401, NO_STORE);
  }

  const session = await createSession(c.env, user.id);
  c.header('set-cookie', session.cookie);

  return c.json({ user: publicUser(user) }, 200, NO_STORE);
});

auth.post('/logout', (c) => {
  c.header('set-cookie', buildClearedSessionCookie());
  return c.json({ ok: true }, 200, NO_STORE);
});

auth.get('/session', async (c) => {
  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  // La sesión es stateless: hay que comprobar que la cuenta siga existiendo.
  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  return c.json({ sub: session.sub }, 200, NO_STORE);
});

/**
 * Material cifrado del propio usuario, para descifrar el perfil en el cliente.
 * Requiere sesión: no expone nada que el servidor pueda leer por sí mismo.
 */
auth.get('/me', async (c) => {
  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  let email: string | null = null;
  if (user.email_recoverable === 1 && user.recoverable_profile) {
    const raw = await openFromServer(c.env, user.recoverable_profile);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { email?: string };
        email = typeof parsed.email === 'string' ? parsed.email : null;
      } catch {
        email = null;
      }
    }
  }

  return c.json({ user: { ...publicUser(user), email } }, 200, NO_STORE);
});

/**
 * Elimina la cuenta y todo lo asociado. Exige la authKey (derivada de la
 * contraseña en el navegador) para que una sesión robada no pueda borrarla.
 */
auth.delete('/account', async (c) => {
  const crossOrigin = rejectCrossOrigin(c);
  if (crossOrigin) return crossOrigin;

  const session = await readSession(c.env, c.req.raw);
  if (!session) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const body = await c
    .req
    .json<{ authKey?: unknown }>()
    .catch(() => ({}) as { authKey?: unknown });

  if (!isBase64UrlField(body.authKey, { minBytes: 32, maxBytes: 64 })) {
    return c.json({ error: 'invalid_request' }, 400, NO_STORE);
  }

  const user = await findUserById(c.env.DB, session.sub);
  if (!user) return c.json({ error: 'unauthenticated' }, 401, NO_STORE);

  const candidate = await authHashFor(c.env, body.authKey);
  if (!timingSafeEqual(candidate, user.auth_hash)) {
    return c.json({ error: 'invalid_credentials' }, 401, NO_STORE);
  }

  // Se borra explícitamente todo lo dependiente, sin depender del PRAGMA de FK.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM oauth_codes WHERE user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM oauth_clients WHERE owner_user_id = ?1').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(user.id),
  ]);

  c.header('set-cookie', buildClearedSessionCookie());
  return c.json({ ok: true }, 200, NO_STORE);
});

export default auth;
