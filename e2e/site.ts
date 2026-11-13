import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test as base } from '@playwright/test';

const DIST = path.resolve('dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export interface Site {
  /** The address to open. It ends in /soundboard/. */
  url: string;
  /** From now on the offline copy (sw.js) differs, so a browser that looks again finds a newer version. */
  publishNewVersion(): void;
  stop(): Promise<void>;
}

/** Serves the built web app on its own port, so a test decides when a newer version appears. */
export async function serveBuild(): Promise<Site> {
  let newer = false;
  const server = createServer((request, response) => {
    void (async () => {
      const { pathname } = new URL(request.url ?? '/', 'http://127.0.0.1');
      const name = decodeURIComponent(pathname).replace(/^\/soundboard\//, '');
      const file = path.resolve(DIST, name === '' ? 'index.html' : name);
      if (!pathname.startsWith('/soundboard/') || !file.startsWith(DIST + path.sep)) {
        response.writeHead(404).end();
        return;
      }
      try {
        let body = await readFile(file);
        if (name === 'sw.js' && newer) body = Buffer.concat([body, Buffer.from('\n// A newer version.\n')]);
        response.writeHead(200, {
          'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/soundboard/`,
    publishNewVersion: () => {
      newer = true;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Like the usual test, but the page opens from its own copy of the built app, which can "publish" a newer version. */
export const test = base.extend<{ site: Site }>({
  site: async ({}, use) => {
    const site = await serveBuild();
    await use(site);
    await site.stop();
  },
  baseURL: async ({ site }, use) => {
    await use(site.url);
  },
});
