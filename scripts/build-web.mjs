// Construit l'appli en UN SEUL fichier HTML :
//  - dist/avispro.html          : version autonome (à héberger où tu veux, ou à ouvrir sur le téléphone)
//  - dist/avispro-artifact.html : même contenu au format « artefact » claude.ai (sans <html>/<head>/<body>)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ICONS } from '../src/web/icons.js';

const root = new URL('..', import.meta.url).pathname;
const out = await build({
  entryPoints: [root + 'src/web/app.js'], bundle: true, write: false, format: 'iife', minify: true,
  target: ['safari13', 'chrome80', 'firefox78', 'edge88'], legalComments: 'none', charset: 'utf8',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(root + 'src/web/styles.css', 'utf8');
const body = readFileSync(root + 'src/web/body.html', 'utf8').replace(/<!--ICON:(\w+)-->/g, (_, k) => ICONS[k] || '');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Martian+Mono:wght@400;500&family=Young+Serif&display=swap">';
const reset = '[hidden]{display:none!important}';

const artifact = `<title>AvisPro</title>\n${fonts}\n<style>${reset}\n${css}</style>\n${body}\n<script>${js}</script>\n`;
const standalone = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1f5a43">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="AvisPro">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f5a43"/><path d="M32 12l5.6 12.4 13.4 1.4-10 9.1 2.9 13.2L32 41.4 20.1 48.1l2.9-13.2-10-9.1 13.4-1.4z" fill="#e2bc68"/></svg>')}">
<title>AvisPro</title>
${fonts}
<style>${reset}:root{padding-top:env(safe-area-inset-top,0px)}\n${css}</style>
</head>
<body>
${body}
<script>${js}</script>
</body>
</html>
`;
mkdirSync(root + 'dist', { recursive: true });
writeFileSync(root + 'dist/avispro-artifact.html', artifact);
writeFileSync(root + 'dist/avispro.html', standalone);
console.log('dist/avispro.html', (standalone.length / 1024).toFixed(0) + ' Ko · dist/avispro-artifact.html', (artifact.length / 1024).toFixed(0) + ' Ko');
