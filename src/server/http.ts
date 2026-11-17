import type { Context } from 'hono';
import type { AppEnv } from './types';

export const NO_STORE = { 'cache-control': 'no-store', pragma: 'no-cache' } as const;

/**
 * Defensa CSRF adicional para peticiones con cookie de sesión.
 * SameSite=Lax ya bloquea el envío cruzado; esto además rechaza formularios
 * de otros orígenes que pudieran llegar desde navegadores antiguos.
 */
export function rejectCrossOrigin(c: Context<AppEnv>): Response | null {
  const origin = c.req.header('origin');
  if (!origin) return null;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(c.req.url);
    if (originUrl.host === requestUrl.host) return null;
  } catch {
    // Origen malformado: se trata como cruzado.
  }

  return c.json({ error: 'invalid_origin', error_description: 'Origen no permitido' }, 403);
}

export function invalidRequest(
  c: Context<AppEnv>,
  description: string,
  status: 400 | 401 = 400,
): Response {
  return c.json({ error: 'invalid_request', error_description: description }, status);
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value);
}

/** Valida que un campo sea base64url con una longitud en bytes razonable. */
export function isBase64UrlField(
  value: unknown,
  options: { minBytes: number; maxBytes: number },
): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const bytes = Math.floor((value.length * 3) / 4);
  return bytes >= options.minBytes && bytes <= options.maxBytes;
}
