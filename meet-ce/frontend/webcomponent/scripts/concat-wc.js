const path = require('path');
const { execSync } = require('child_process');

const browserDir = path.resolve(__dirname, '..', 'dist', 'wc', 'browser');
const entry = path.join(browserDir, 'main.js');
// The heavy Angular app, emitted as ESM: the loader `import()`s it on first use,
// and direct-import hosts can load it too. Needs CORS (added on the backend
// route). See src/main.loader.ts + deploy-to-backend.js + server.ts.
const outEsm = path.resolve(__dirname, '..', 'dist', 'openvidu-meet-wc.esm.js');
// Tiny lazy loader served at the stable url; it `import()`s the ESM
// above on first use. Built straight from TS source (no Angular), so it is a
// few KB. See src/main.loader.ts + server.ts.
const wcRoot = path.resolve(__dirname, '..');
const loaderEntry = path.join(wcRoot, 'src', 'main.loader.ts');
const outLoader = path.resolve(__dirname, '..', 'dist', 'openvidu-meet-loader.js');

const fs = require('fs');

if (!fs.existsSync(entry)) {
  console.error('[concat-wc] dist/wc/browser/main.js not found. Run the Angular build first.');
  process.exit(1);
}

// Find esbuild — prefer workspace root so we don't need it as an explicit dep
const findEsbuild = () => {
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', 'esbuild'),
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', 'esbuild'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'esbuild'),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
};

const esbuildPath = findEsbuild();
if (!esbuildPath) {
  console.error('[concat-wc] esbuild not found. Run pnpm install at the workspace root.');
  process.exit(1);
}

const esbuild = require(esbuildPath);

const build = async () => {
  await Promise.all([
    // ESM: a single self-contained module importable via `import()` (the loader
    // loads it). NOTE: this is one bundled file, NOT code-split — esbuild inlines
    // Angular's dynamic-import chunks here. `minify` re-minifies the merged output
    // globally (Angular minifies each chunk in isolation), which shrinks it a
    // further ~19% vs. leaving it un-minified. Skipped when WC_DEV is set (the
    // `dev` watch loop): re-minifying the ~4.5 MB ESM on every save costs ~1-2 s
    // and buys nothing locally.
    esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      minify: !process.env.WC_DEV,
      // Resolve sibling chunk files from the same browser dir
      absWorkingDir: browserDir,
      // Allow top-level await (used by Angular)
      supported: { 'top-level-await': true },
      logLevel: 'warning',
      outfile: outEsm,
    }),
    // Loader: tiny IIFE built from TS source. Its runtime `import(<esm url>)` is
    // left as a native dynamic import (the url is only known at runtime).
    esbuild.build({
      entryPoints: [loaderEntry],
      bundle: true,
      format: 'iife',
      minify: true,
      absWorkingDir: wcRoot,
      outfile: outLoader,
      logLevel: 'warning',
    }),
  ]);

  const rel = (p) => path.relative(path.resolve(__dirname, '..'), p);
  console.log('[concat-wc] wrote', rel(outEsm));
  console.log('[concat-wc] wrote', rel(outLoader));

  // Copy runtime assets (sounds, backgrounds, images, layouts, livekit worker)
  // from the WC build output to dist/assets/ so they are distributed alongside
  // the WC bundle.
  const assetsSrc = path.join(browserDir, 'assets');
  const assetsDst = path.resolve(__dirname, '..', 'dist', 'assets');

  if (fs.existsSync(assetsSrc)) {
    fs.cpSync(assetsSrc, assetsDst, { recursive: true, force: true });
    console.log('[concat-wc] copied assets →', path.relative(path.resolve(__dirname, '..'), assetsDst));
  }
};

(async () => {
  try {
    await build();
  } catch (err) {
    console.error('[concat-wc] esbuild failed:', err.message);
    process.exit(1);
  }
})();
