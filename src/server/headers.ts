/**
 * Cabeceras de seguridad para todas las respuestas (Astro y API).
 *
 * No se aplica CSP en desarrollo para no interferir con el cliente de Vite;
 * en producción el aislamiento del origen es estricto.
 */

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

export function securityHeaders(url: URL): Record<string, string> {
  const isLocalDev = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const headers: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };

  if (!isLocalDev) {
    headers['content-security-policy'] = CONTENT_SECURITY_POLICY;
    headers['strict-transport-security'] = 'max-age=31536000';
  }

  return headers;
}
