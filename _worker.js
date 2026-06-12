/**
 * _worker.js — Cloudflare Pages Worker
 *
 * Intercepts requests to index.html and injects a
 * <meta name="x-pin-hash"> tag containing SHA-256(salt + PIN).
 *
 * The PIN itself never leaves the server. The client hashes
 * the user's input and compares against the injected hash.
 *
 * Environment variable required (set in Cloudflare Pages dashboard):
 *   PIN_HASH  — SHA-256 hex of "rg::" + your PIN
 *               Generate with: node -e "
 *                 const crypto=require('crypto');
 *                 process.stdout.write(
 *                   crypto.createHash('sha256')
 *                     .update('rg::YOUR_PIN_HERE')
 *                     .digest('hex')
 *                 );"
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only transform index.html (and bare /)
    const isIndex = url.pathname === '/' || url.pathname === '/index.html';

    // Fetch the static asset from Pages
    const response = await env.ASSETS.fetch(request);

    if (!isIndex || !env.PIN_HASH) {
      return response;
    }

    // Inject the hash into <head>
    const html = await response.text();
    const injected = html.replace(
      '</head>',
      `  <meta name="x-pin-hash" content="${env.PIN_HASH}" />\n</head>`
    );

    return new Response(injected, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers),
        'Content-Type': 'text/html; charset=utf-8',
        // Prevent caching of the injected hash
        'Cache-Control': 'no-store',
      },
    });
  },
};
