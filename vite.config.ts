import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Após o build, injeta no dist/sw.js a lista completa de arquivos para cache offline. */
function precacheManifest(): Plugin {
  let outDir = 'dist';
  return {
    name: 'vaelmor-precache',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split(sep).join('/'));
        }
      };
      walk(outDir);
      const all = files.filter((f) => f !== 'sw.js' && f !== '_headers' && !f.endsWith('-preview.png') && !f.endsWith('.md')).sort();
      // instalação leve: só o essencial para abrir (página, código, fontes, ícones). As
      // imagens entram no cache conforme o jogo pede (baixar os ~900 arquivos de uma vez
      // na instalação deixava a abertura no iPhone muito lenta e falhava fácil).
      const list = all.filter((f) => f === 'index.html' || f === 'manifest.json' || /^assets\/[^/]+\.(js|css)$/.test(f) || f.startsWith('fonts/') || f.startsWith('icons/'));
      const hash = createHash('sha1');
      for (const f of all) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace(/const VERSION = '[^']*';/, `const VERSION = '${hash.digest('hex').slice(0, 10)}';`)
        .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(['./', ...list.map((f) => `./${f}`)], null, 2)};`);
      writeFileSync(swPath, sw);
    },
  };
}

/** Identificador da versão (commit), exibido no HUD para conferir se o PWA atualizou. */
function buildId(): string {
  const env = process.env.CF_PAGES_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  // caminhos relativos: funciona na raiz (Netlify) e em subpasta (GitHub Pages)
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
  },
  plugins: [precacheManifest()],
});
