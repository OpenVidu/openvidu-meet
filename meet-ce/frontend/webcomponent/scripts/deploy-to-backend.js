/**
 * deploy-to-backend.js
 *
 * Copies the freshly built WebComponent bundle into the backend's public
 * directory so the backend can serve it at `<basePath>/v1/openvidu-meet.js`
 * (see backend `src/server.ts` + `src/utils/path.utils.ts`).
 *
 * The bundle MUST be provided by the backend: every host application imports
 * the WebComponent via a single backend URL, e.g.
 *   <script src="http://<host>:<port>/meet/v1/openvidu-meet.js"></script>
 *
 * This mirrors how the full SPA build writes straight into
 * `meet-ce/backend/public/frontend` (see frontend `angular.json` outputPath).
 *
 * Run automatically as the last step of `build:wc:bundle` (via `build:wc:post`)
 * and from the `dev` watch loop. Run manually:  node scripts/deploy-to-backend.js
 *
 * What gets deployed (both produced by concat-wc.js), in this order — the ESM
 * FIRST so that once the new loader is live, the sibling ESM it imports is
 * already in place (shrinks the cross-file version-skew window):
 *   dist/openvidu-meet-wc.esm.js → openvidu-meet.esm.bundle.min.js
 *   dist/openvidu-meet-loader.js → openvidu-meet.loader.min.js
 * (Override the backend public dir with MEET_BACKEND_PUBLIC_DIR if needed.)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Overridable so the deploy contract (renames, sidecar hashes) can be
// exercised against fabricated dirs in unit tests.
const distDir = process.env.MEET_WC_DIST_DIR ? path.resolve(process.env.MEET_WC_DIST_DIR) : path.join(root, 'dist');

const bundles = [
  { src: path.join(distDir, 'openvidu-meet-wc.esm.js'), destName: 'openvidu-meet.esm.bundle.min.js' },
  { src: path.join(distDir, 'openvidu-meet-loader.js'), destName: 'openvidu-meet.loader.min.js' },
];

// meet-ce/frontend/webcomponent/scripts → meet-ce/backend/public
const defaultBackendPublic = path.resolve(__dirname, '..', '..', '..', 'backend', 'public');
const backendPublic = process.env.MEET_BACKEND_PUBLIC_DIR
  ? path.resolve(process.env.MEET_BACKEND_PUBLIC_DIR)
  : defaultBackendPublic;
const destDir = path.join(backendPublic, 'webcomponent');

const missing = bundles.filter(({ src }) => !fs.existsSync(src));
if (missing.length > 0) {
  console.error(
    `[deploy:backend] missing bundle(s): ${missing.map(({ src }) => path.relative(root, src)).join(', ')}\n` +
      `                 Run 'pnpm run build:wc:bundle' first.`
  );
  process.exit(1);
}

// If the backend isn't present (e.g. building the WC in isolation for npm
// publishing), skip silently rather than failing the whole build.
if (!fs.existsSync(backendPublic)) {
  console.warn(
    `[deploy:backend] backend public dir not found at ${backendPublic} — skipping deploy.\n` +
      `                 Set MEET_BACKEND_PUBLIC_DIR to override.`
  );
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const { src, destName } of bundles) {
  const dest = path.join(destDir, destName);
  // Copy to a temp file in the SAME dir, then rename over the destination.
  // rename() is atomic within a filesystem, so a running backend never reads a
  // half-written bundle (which would also poison the content-hash ETag cache).
  const tmp = path.join(destDir, `.${destName}.tmp`);
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
  console.log(`[deploy:backend] copied bundle → ${dest}`);

  // Write a content-hash sidecar (`<bundle>.sha256`) so the backend answers the
  // ETag from a 64-byte read instead of re-hashing the multi-MB bundle on the
  // event loop (see getWebcomponentBundleEtag). Written AFTER the bundle rename,
  // and atomically, so its mtime is never older than the bundle it describes —
  // the backend treats an older sidecar as stale and recomputes.
  const hash = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
  const sidecarTmp = path.join(destDir, `.${destName}.sha256.tmp`);
  fs.writeFileSync(sidecarTmp, hash);
  fs.renameSync(sidecarTmp, `${dest}.sha256`);
}
