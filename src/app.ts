/**
 * Entrada del Worker.
 *
 * Hono es el router principal: atiende todo el plano de protocolo
 * (`/oauth/*`, `/api/*`, `/.well-known/*`, `/jwks.json`) y delega el resto en
 * Astro mediante `pages()`. Así hay un único Worker, una única sesión y una
 * única base de datos, sin KV por medio.
 */

import { Hono } from 'hono';
import { cf } from '@astrojs/cloudflare/hono';
import { middleware, pages } from 'astro/hono';

import authRoutes from './server/routes/auth';
import clientRoutes from './server/routes/clients';
import oauthRoutes from './server/routes/oauth';
import { mountDiscovery } from './server/routes/discovery';
import { securityHeaders } from './server/headers';
import type { AppEnv } from './server/types';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(securityHeaders(new URL(c.req.url)))) {
    c.header(name, value);
  }
});

// Assets estáticos y utilidades del adaptador de Cloudflare.
app.use(cf());

app.route('/api/auth', authRoutes);
app.route('/api', clientRoutes);
app.route('/oauth', oauthRoutes);
mountDiscovery(app);

// Las rutas de API desconocidas no deben caer en el 404 de Astro.
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
app.all('/oauth/*', (c) => c.json({ error: 'not_found' }, 404));

// Middleware y páginas de Astro (SSR).
app.use(middleware());
app.use(pages());

export default app;
