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

    if (!isIndex || request.method !== 'GET') {
      return env.ASSETS.fetch(request);
    }

    // Sem validação condicional: a resposta é no-store, e um 304 aqui viraria
    // uma página vazia depois do .text().
    const pedido = new Request(request);
    pedido.headers.delete('If-None-Match');
    pedido.headers.delete('If-Modified-Since');
    const response = await env.ASSETS.fetch(pedido);
    if (response.status !== 200) return response;

    let html = await response.text();

    // Inject the hash into <head>
    if (env.PIN_HASH) {
      html = html.replace(
        '</head>',
        `  <meta name="x-pin-hash" content="${env.PIN_HASH}" />\n</head>`
      );
    }

    // Aviso de lançamento de álbum do fotos (ver o bloco no fim do arquivo).
    // Falhou? A página sai sem ele.
    try {
      html = injeta(html, await lerDestaque((p) => ctx.waitUntil(p)));
    } catch (e) {
      console.error('destaque: faixa não posta', e);
    }

    return new Response(html, {
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

// ─────────────────────────────────────────────────────────────────────────
// Aviso de lançamento de álbum do fotos, posto no HTML pelo servidor: nenhum
// script na página (que guarda dados de documento) e nenhuma origem nova. É a
// MESMA lógica de functions/_lib/destaque-servidor.js em keys, pays e proof,
// colada aqui porque o _worker.js é um arquivo só — mudou lá, mude aqui. Só
// na página inicial (a do PIN): impressão e guias ficam de fora. Explicação
// completa no docs/ALBUM.md do fotos ("Aviso nos outros sites").
// ─────────────────────────────────────────────────────────────────────────

const DESTAQUE_FONTE = 'https://fotos.lucafchala.com/api/destaque';
// Domínio novo de álbum no fotos (DOMINIOS_DE_ALBUM) precisa entrar aqui.
const HOSTS_DE_ALBUM = new Set(['fotos.lucafchala.com', 'entrenos2026.com']);
const CACHE_S = 300;
const CACHE_FALHA_S = 60;
const INATIVO = Object.freeze({ ativo: false });

const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Só o que a faixa desenha, conferido. */
function limpaDestaque(d) {
  if (!d || typeof d !== 'object' || d.ativo !== true) return INATIVO;
  const titulo = texto(d.titulo, 80);
  const linha = texto(d.linha, 80);
  let url;
  try { url = new URL(String(d.url)); } catch { return INATIVO; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !HOSTS_DE_ALBUM.has(url.hostname)) return INATIVO;
  if (!titulo) return INATIVO;
  return { ativo: true, titulo, linha, url: url.href };
}

function faixaHTML(d) {
  return '<input type="checkbox" id="lfc-dq-x" class="lfc-dq-chk" aria-label="Fechar aviso">'
    + '<div class="lfc-dq" role="region" aria-label="Aviso">'
    + `<a class="lfc-dq-a" href="${esc(d.url)}"><span class="lfc-dq-k">${esc(d.linha || 'Novo álbum')}</span>`
    + `<span><b>${esc(d.titulo)}</b> · o álbum está no ar</span><span class="lfc-dq-c">Ver o álbum →</span></a>`
    + '<label class="lfc-dq-x" for="lfc-dq-x" aria-hidden="true">×</label></div>';
}

/** A página com a faixa (ou a mesma, se não houver onde pôr). */
function injeta(html, d) {
  if (!d || !d.ativo || html.includes('class="lfc-dq"')) return html;
  const b = html.match(/<body\b[^>]*>/i);
  const h = html.search(/<\/head>/i);
  if (!b || h < 0 || h > b.index) return html;
  const fim = b.index + b[0].length;
  return html.slice(0, h) + '<link rel="stylesheet" href="/destaque.css">\n' + html.slice(h, fim) + faixaHTML(d) + html.slice(fim);
}

/** O destaque do fotos, com cache de 5 min na borda (1 min quando falha). */
async function lerDestaque(waitUntil = () => {}) {
  const cache = globalThis.caches && caches.default;
  const chave = 'https://destaque.invalid/v1';
  if (cache) {
    try { const hit = await cache.match(chave); if (hit) return limpaDestaque(await hit.json()); } catch { /* segue sem cache */ }
  }
  let d = INATIVO;
  let ok = false;
  try {
    const r = await fetch(DESTAQUE_FONTE, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2000) });
    if (r.ok) { d = limpaDestaque(await r.json()); ok = true; }
  } catch (e) {
    console.error('destaque: fotos não respondeu', e);
  }
  if (cache) {
    const s = ok ? CACHE_S : CACHE_FALHA_S;
    waitUntil(cache.put(chave, new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${s}` } })).catch(() => {}));
  }
  return d;
}
