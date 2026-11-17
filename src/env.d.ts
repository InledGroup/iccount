/// <reference types="astro/client" />

// Bindings y variables de entorno del Worker (wrangler.jsonc + .dev.vars).
interface Env {
  DB: D1Database;

  /** Secreto maestro en base64url (32 bytes). Deriva el blind index y el pepper de auth. */
  PEPPER_KEY: string;

  /** Clave AES-256 en base64url (32 bytes) para la copia "recoverable" del perfil. */
  SERVER_ENC_KEY: string;

  /** JWK privada ES256 (JSON) para firmar id_tokens, access tokens y sesiones. */
  SIGNING_JWK: string;

  /** Emisor OIDC, sin barra final. */
  ISSUER?: string;

  /** Vida del access token en segundos (por defecto 3600). */
  ACCESS_TOKEN_TTL?: string;

  /** Vida de la cookie de sesión en segundos (por defecto 43200 = 12 h). */
  SESSION_TTL?: string;
}
