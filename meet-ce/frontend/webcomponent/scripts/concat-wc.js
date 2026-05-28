const path = require('path');
const { execSync } = require('child_process');

const browserDir = path.resolve(__dirname, '..', 'dist', 'wc', 'browser');
const entry = path.join(browserDir, 'main.js');
const out = path.resolve(__dirname, '..', 'dist', 'openvidu-meet-wc.js');

const fs = require('fs');

if (!fs.existsSync(entry)) {
  console.error('[concat-wc] dist/wc/browser/main.js not found. Run the Angular build first.');
  process.exit(1);
}

// Find esbuild — prefer workspace root so we don't need it as an explicit dep
function findEsbuild() {
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', 'esbuild'),
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', 'esbuild'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'node_modules', 'esbuild'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const esbuildPath = findEsbuild();
if (!esbuildPath) {
  console.error('[concat-wc] esbuild not found. Run pnpm install at the workspace root.');
  process.exit(1);
}

const esbuild = require(esbuildPath);

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'OpenViduMeetWC',
    outfile: out,
    // Resolve sibling chunk files from the same browser dir
    absWorkingDir: browserDir,
    // Allow top-level await (used by Angular)
    supported: { 'top-level-await': true },
    logLevel: 'warning',
  })
  .then(() => {
    console.log('[concat-wc] wrote', path.relative(path.resolve(__dirname, '..'), out));

    // Copy runtime assets (sounds, backgrounds, images, layouts, livekit worker)
    // from the WC build output to dist/assets/ so they are distributed alongside
    // the WC bundle.
    const assetsSrc = path.join(browserDir, 'assets');
    const assetsDst = path.resolve(__dirname, '..', 'dist', 'assets');

    if (fs.existsSync(assetsSrc)) {
      fs.cpSync(assetsSrc, assetsDst, { recursive: true, force: true });
      console.log('[concat-wc] copied assets →', path.relative(path.resolve(__dirname, '..'), assetsDst));
    }
  })
  .catch((err) => {
    console.error('[concat-wc] esbuild failed:', err.message);
    process.exit(1);
  });
