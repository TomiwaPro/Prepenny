// The support dashboard's files, served on this computer for the tests
// (e2e/admin.wrangler.jsonc), with one security policy per page, as the
// real dashboard sends them (../admin/cloudflare/worker.ts, D559).

import { onePolicy } from '../cloudflare/worker.ts';

interface Env {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return onePolicy(await env.ASSETS.fetch(request));
  },
};
