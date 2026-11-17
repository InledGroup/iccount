/** Acceso tipado a D1. Todas las consultas van parametrizadas. */

export interface UserRow {
  id: string;
  email_blind_index: string;
  encrypted_email: string;
  email_recoverable: number;
  recoverable_profile: string | null;
  auth_hash: string;
  kdf_salt: string;
  kdf_iterations: number;
  encrypted_user_key: string;
  recovery_wrapped_user_key: string;
  encrypted_profile: string | null;
  created_at: number;
}

export interface ClientRow {
  client_id: string;
  client_secret_hash: string | null;
  owner_user_id: string | null;
  name: string;
  redirect_uris: string;
  is_first_party: number;
  scopes: string;
  created_at: number;
}

export interface CodeRow {
  code_hash: string;
  user_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scopes: string;
  nonce: string | null;
  auth_time: number;
  expires_at: number;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function findUserByEmail(db: D1Database, blindIndex: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE email_blind_index = ?1')
    .bind(blindIndex)
    .first<UserRow>();
}

export async function findUserById(db: D1Database, id: string): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first<UserRow>();
}

export interface NewUser {
  id: string;
  emailBlindIndex: string;
  encryptedEmail: string;
  emailRecoverable: boolean;
  recoverableProfile: string | null;
  authHash: string;
  kdfSalt: string;
  kdfIterations: number;
  encryptedUserKey: string;
  recoveryWrappedUserKey: string;
  encryptedProfile: string;
  createdAt: number;
}

export async function insertUser(db: D1Database, user: NewUser): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO users (
         id, email_blind_index, encrypted_email, email_recoverable, recoverable_profile,
         auth_hash, kdf_salt, kdf_iterations, encrypted_user_key,
         recovery_wrapped_user_key, encrypted_profile, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT (email_blind_index) DO NOTHING`,
    )
    .bind(
      user.id,
      user.emailBlindIndex,
      user.encryptedEmail,
      user.emailRecoverable ? 1 : 0,
      user.recoverableProfile,
      user.authHash,
      user.kdfSalt,
      user.kdfIterations,
      user.encryptedUserKey,
      user.recoveryWrappedUserKey,
      user.encryptedProfile,
      user.createdAt,
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Clientes OAuth
// ---------------------------------------------------------------------------

export async function findClient(db: D1Database, clientId: string): Promise<ClientRow | null> {
  return db
    .prepare('SELECT * FROM oauth_clients WHERE client_id = ?1')
    .bind(clientId)
    .first<ClientRow>();
}

export function parseRedirectUris(client: ClientRow): string[] {
  try {
    const value = JSON.parse(client.redirect_uris);
    return Array.isArray(value) ? value.filter((uri): uri is string => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

export async function listClientsByOwner(db: D1Database, ownerId: string): Promise<ClientRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM oauth_clients WHERE owner_user_id = ?1 ORDER BY created_at DESC')
    .bind(ownerId)
    .all<ClientRow>();
  return results ?? [];
}

export async function insertClient(
  db: D1Database,
  client: {
    clientId: string;
    clientSecretHash: string | null;
    ownerUserId: string;
    name: string;
    redirectUris: string[];
    scopes: string;
    createdAt: number;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_clients
         (client_id, client_secret_hash, owner_user_id, name, redirect_uris, is_first_party, scopes, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)`,
    )
    .bind(
      client.clientId,
      client.clientSecretHash,
      client.ownerUserId,
      client.name,
      JSON.stringify(client.redirectUris),
      client.scopes,
      client.createdAt,
    )
    .run();
}

export async function deleteClient(
  db: D1Database,
  clientId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM oauth_clients WHERE client_id = ?1 AND owner_user_id = ?2 AND is_first_party = 0')
    .bind(clientId, ownerId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Códigos de autorización
// ---------------------------------------------------------------------------

export async function insertCode(db: D1Database, code: CodeRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_codes
         (code_hash, user_id, client_id, redirect_uri, code_challenge, code_challenge_method,
          scopes, nonce, auth_time, expires_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
    )
    .bind(
      code.code_hash,
      code.user_id,
      code.client_id,
      code.redirect_uri,
      code.code_challenge,
      code.code_challenge_method,
      code.scopes,
      code.nonce,
      code.auth_time,
      code.expires_at,
    )
    .run();
}

/**
 * Consume el código de forma atómica: DELETE ... RETURNING garantiza que dos
 * peticiones simultáneas no puedan canjear el mismo código.
 */
export async function consumeCode(db: D1Database, codeHash: string): Promise<CodeRow | null> {
  return db
    .prepare('DELETE FROM oauth_codes WHERE code_hash = ?1 RETURNING *')
    .bind(codeHash)
    .first<CodeRow>();
}

/**
 * Limpieza oportunista de códigos caducados. Sustituye a un cron y a KV:
 * unos pocos borrados por petición mantienen la tabla diminuta en el free tier.
 */
export async function purgeExpiredCodes(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM oauth_codes WHERE expires_at < ?1').bind(nowSeconds()).run();
}
