#!/usr/bin/env node
/**
 * Сайт документации для GitHub Pages (#45): docs/**.md → HTML, справочник API (Scalar) со статической спецификацией.
 * Серверная часть на Pages не работает: приложение запускается из образов GHCR (docs/06-deployment.md).
 *
 *   node scripts/build-pages.mjs --out _site [--openapi openapi.json]
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { Marked } from 'marked';

const { values } = parseArgs({
  options: { out: { type: 'string', default: '_site' }, openapi: { type: 'string' } },
});
const ROOT = new URL('..', import.meta.url).pathname;
const DOCS = join(ROOT, 'docs');
const OUT = resolve(ROOT, values.out);
const require = createRequire(join(ROOT, 'apps/api/package.json'));

const REPO = 'https://github.com/DcNi3L/bioauth-optimizer/blob/main/';
/** Страница, которую сейчас собираем (относительно docs/): нужна, чтобы разрешать ссылки за пределы docs/. */
let currentRel = '';

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const marked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      if (lang === 'mermaid') return `<pre class="mermaid">${esc(text)}</pre>\n`;
      return `<pre><code class="language-${esc(lang ?? '')}">${esc(text)}</code></pre>\n`;
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      // Ссылки между страницами документации: .md → .html; README.md → index.html.
      let to = href;
      if (!/^[a-z]+:/i.test(href) && !href.startsWith('#')) {
        const target = relative(DOCS, resolve(DOCS, dirname(currentRel), href.split('#')[0]));
        if (target.startsWith('..')) {
          // Файл вне docs/ (README, AGENTS.md, исходники) — ссылка на GitHub.
          to = REPO + relative(ROOT, resolve(DOCS, dirname(currentRel), href));
        } else {
          to = href.replace(/(^|\/)README\.md(#|$)/, '$1index.html$2').replace(/\.md(#|$)/, '.html$1');
        }
      }
      return `<a href="${esc(to)}"${title ? ` title="${esc(title)}"` : ''}>${label}</a>`;
    },
  },
});

function page(title, body, depth) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · BioAuth Optimizer</title>
<style>
:root { --ink:#17202b; --graphite:#56606d; --paper:#fbfcfa; --rule:#d5dbd4; --accent:#1e5f8c; --code:#f3f5f2; }
@media (prefers-color-scheme: dark) { :root { --ink:#e4e9ee; --graphite:#96a1ad; --paper:#0e1318; --rule:#27313b; --accent:#6db1e2; --code:#151c23; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:16px/1.65 system-ui, -apple-system, 'Segoe UI', sans-serif; }
header { border-bottom:1px solid var(--rule); padding:12px 16px; display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
header a { color:var(--ink); text-decoration:none; font-weight:600; } header nav a { font-weight:400; color:var(--graphite); margin-right:12px; }
main { max-width:960px; margin:0 auto; padding:24px 16px 64px; overflow-wrap:anywhere; }
a { color:var(--accent); } h1,h2,h3 { line-height:1.25; } h1 { font-size:1.9rem; }
pre { background:var(--code); padding:12px 14px; border-radius:8px; overflow-x:auto; font-size:.88rem; }
code { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size:.9em; }
:not(pre) > code { background:var(--code); padding:.1em .35em; border-radius:4px; }
table { border-collapse:collapse; display:block; overflow-x:auto; font-size:.92rem; margin:1em 0; }
th, td { border:1px solid var(--rule); padding:6px 10px; text-align:left; vertical-align:top; }
img { max-width:100%; height:auto; } blockquote { margin:0; padding-left:14px; border-left:3px solid var(--rule); color:var(--graphite); }
pre.mermaid { background:transparent; text-align:center; }
</style>
</head>
<body>
<header><a href="${up}index.html">BioAuth Optimizer</a>
<nav><a href="${up}index.html">Документация</a><a href="${up}api/">Справочник API</a><a href="https://github.com/DcNi3L/bioauth-optimizer">GitHub</a></nav></header>
<main>${body}</main>
<script type="module">
if (document.querySelector('pre.mermaid')) {
  const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs');
  mermaid.initialize({ startOnLoad: false, theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' });
  await mermaid.run({ querySelector: 'pre.mermaid' });
}
</script>
</body>
</html>
`;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

mkdirSync(OUT, { recursive: true });
let pages = 0;
for (const file of walk(DOCS)) {
  const rel = relative(DOCS, file);
  // Бинарные материалы сдачи (docx, pdf, pptx) на сайт не копируются: они в репозитории и в релизах.
  if (rel.startsWith('deliverables/') && !/\.(png|jpe?g|svg|md)$/i.test(rel)) continue;
  const depth = rel.split('/').length - 1;
  if (rel.endsWith('.md')) {
    const src = readFileSync(file, 'utf8');
    currentRel = rel;
    const title = /^#\s+(.+)$/m.exec(src)?.[1] ?? rel;
    const target = join(OUT, rel.replace(/(^|\/)README\.md$/, '$1index.md').replace(/\.md$/, '.html'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, page(title, marked.parse(src), depth));
    pages++;
  } else {
    mkdirSync(dirname(join(OUT, rel)), { recursive: true });
    cpSync(file, join(OUT, rel));
  }
}

// Справочник API: та же сборка Scalar, что раздаёт сервер, и спецификация, снятая с запущенного API в CI.
mkdirSync(join(OUT, 'api'), { recursive: true });
cpSync(
  join(dirname(require.resolve('@scalar/api-reference')), 'browser', 'standalone.js'),
  join(OUT, 'api', 'standalone.js'),
);
if (values.openapi && existsSync(values.openapi)) {
  const spec = JSON.parse(readFileSync(values.openapi, 'utf8'));
  // Сервер на Pages не опубликован: адрес — локальный запуск, отправка запросов отсюда отключена.
  spec.servers = [{ url: 'http://localhost:4000', description: 'Локальный запуск (docker compose up)' }];
  spec.info.description =
    '> Статическая копия справочника для чтения. Сервер на GitHub Pages не работает: запустите систему из образов ' +
    '(`docker compose up`) и откройте справочник на `http://localhost:4000/api/docs` — там запросы можно отправлять.\n\n' +
    (spec.info.description ?? '');
  writeFileSync(join(OUT, 'api', 'openapi.json'), JSON.stringify(spec));
}
const scalarConfig = JSON.stringify({
  url: './openapi.json',
  layout: 'modern',
  telemetry: false,
  hideClientButton: false,
  showToolbar: 'never',
  defaultOpenAllTags: false,
  operationTitleSource: 'summary',
  // Отправка запросов отсюда некуда: сервер не опубликован; примеры показываются, «Try it» скрыт.
  hideTestRequestButton: true,
});
writeFileSync(
  join(OUT, 'api', 'index.html'),
  `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Справочник API · BioAuth Optimizer</title>
<style>.explore-scalar-card, .explore-scalar-cta, .generate-sdk-button, .ask-ai-button,
button[aria-haspopup="dialog"].text-c-1.px-3.py-1 { display: none !important; }</style></head><body><div id="app"></div>
<script src="./standalone.js"></script><script>Scalar.createApiReference('#app', ${scalarConfig.replace(/</g, '\\u003c')});</script>
</body></html>
`,
);
writeFileSync(join(OUT, '.nojekyll'), '');
process.stdout.write(`страниц: ${pages}, каталог: ${OUT}\n`);
