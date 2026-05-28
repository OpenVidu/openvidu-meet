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
 * Source:      dist/openvidu-meet-wc.js   (produced by concat-wc.js)
 * Destination: <backend>/public/webcomponent/openvidu-meet.bundle.min.js
 *              (the exact file the backend route serves; override the backend
 *               public dir with MEET_BACKEND_PUBLIC_DIR if needed)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bundle = path.join(root, 'dist', 'openvidu-meet-wc.js');

// meet-ce/frontend/webcomponent/scripts → meet-ce/backend/public
const defaultBackendPublic = path.resolve(__dirname, '..', '..', '..', 'backend', 'public');
const backendPublic = process.env.MEET_BACKEND_PUBLIC_DIR
  ? path.resolve(process.env.MEET_BACKEND_PUBLIC_DIR)
  : defaultBackendPublic;
const destDir = path.join(backendPublic, 'webcomponent');
const dest = path.join(destDir, 'openvidu-meet.bundle.min.js');

if (!fs.existsSync(bundle)) {
  console.error(
    `[deploy:backend] missing bundle: ${path.relative(root, bundle)}\n` +
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
fs.copyFileSync(bundle, dest);
console.log(`[deploy:backend] copied bundle → ${dest}`);
