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
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('-preview.png') && !f.endsWith('.md')).sort();
      const hash = createHash('sha1');
      for (const f of list) hash.update(f).update(readFileSync(join(outDir, f)));
      const swPath = join(outDir, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace(/const VERSION = '[^']*';/, `const VERSION = '${hash.digest('hex').slice(0, 10)}';`)
        .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(['./', ...list.map((f) => `./${f}`)], null, 2)};`);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  // caminhos relativos: funciona na raiz (Netlify) e em subpasta (GitHub Pages)
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: 0,
  },
  plugins: [precacheManifest()],
});
