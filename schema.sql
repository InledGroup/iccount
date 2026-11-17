-- Inled Iccount — esquema D1
-- SQLite / Cloudflare D1
--
-- Diseño: zero-knowledge por defecto y extensible (solo columnas aditivas y
-- nullables). Todas las fechas son enteros en segundos desde la época Unix.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  -- UUID v4 inmutable. Es el `sub` en OIDC y nunca cambia.
  id TEXT PRIMARY KEY,

  -- HMAC-SHA256(email normalizado, subclave de PEPPER_KEY).
  -- Permite buscar por email en O(1) sin almacenarlo en claro.
  email_blind_index TEXT NOT NULL UNIQUE,

  -- Email cifrado en el navegador con la clave del usuario (AES-GCM).
  encrypted_email TEXT NOT NULL,

  -- 1 = el usuario acepta que el servidor guarde además una copia del perfil
  -- (email incluido) cifrada con SERVER_ENC_KEY, para poder enviarle
  -- comunicaciones y devolver claims en /userinfo.
  email_recoverable INTEGER NOT NULL DEFAULT 0,
  recoverable_profile TEXT,

  -- HMAC-SHA256(authKey, subclave de PEPPER_KEY). Nunca se almacena la
  -- contraseña ni la authKey en claro.
  auth_hash TEXT NOT NULL,

  -- Parámetros KDF que el navegador necesita ANTES de autenticarse.
  kdf_salt TEXT NOT NULL,
  kdf_iterations INTEGER NOT NULL DEFAULT 600000,

  -- Clave simétrica AES-256 del usuario, envuelta con la clave derivada de la
  -- Master Password. El servidor no puede desenvolverla.
  encrypted_user_key TEXT NOT NULL,

  -- La misma clave de usuario envuelta con la Recovery Key (descargable).
  recovery_wrapped_user_key TEXT NOT NULL,

  -- JSON cifrado en cliente: { name, picture, email, ... }
  encrypted_profile TEXT,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

-- ---------------------------------------------------------------------------
-- Clientes OAuth 2.0
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,

  -- SHA-256 base64url del secreto. NULL = cliente público (SPA / móvil): solo PKCE.
  client_secret_hash TEXT,

  owner_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  name TEXT NOT NULL,

  -- JSON array de URIs de redirección exactas.
  redirect_uris TEXT NOT NULL,

  -- 1 = aplicación oficial de Inled: se omite la pantalla de consentimiento.
  is_first_party INTEGER NOT NULL DEFAULT 0,

  -- Espacio de scopes que el cliente puede solicitar.
  scopes TEXT NOT NULL DEFAULT 'openid profile email',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_clients_owner ON oauth_clients (owner_user_id);

-- ---------------------------------------------------------------------------
-- Códigos de autorización (temporales)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS oauth_codes (
  -- SHA-256 base64url del código. El código en claro solo viaja al navegador.
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients (client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  scopes TEXT NOT NULL,
  -- nonce de OIDC y momento de autenticación (claims del id_token).
  nonce TEXT,
  auth_time INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON oauth_codes (expires_at);
