// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://docs.astro.build/en/guides/integrations-guide/cloudflare/
export default defineConfig({
  output: 'server',
  // Everything that is not an Astro page (the OAuth 2.0 / OIDC surface) is
  // handled by Hono through src/middleware.ts.
  adapter: cloudflare({
    // Free plan friendly: no KV-backed Astro sessions and no Cloudflare Images.
    imageService: 'passthrough',
  }),
  session: false,
  devToolbar: { enabled: false },
});
