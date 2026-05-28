/**
 * sync-wc.js
 *
 * Copies the generated API artifacts from the webcomponent build into the
 * testapp's src/ tree so that Angular's build can process them within the
 * project root.
 *
 * NOTE: the WC *bundle* itself is NOT copied here. It is served by the backend
 * (deployed via webcomponent/scripts/deploy-to-backend.js) and the testapp
 * loads it from a same-origin path proxied to the backend — see
 * testapp/src/index.html + proxy.conf.js.
 *
 * Run automatically via:  pnpm run start | serve | build
 * Run manually:           node scripts/sync-wc.js
 *
 * Source:  ../dist/   (produced by `pnpm run build:wc` in webcomponent)
 * Destination:
 *   src/openvidu-meet/generated/types/openvidu-meet.d.ts
 *   src/openvidu-meet/generated/wrappers/angular/openvidu-meet-angular.ts
 *   src/openvidu-meet/generated/wrappers/angular/index.ts
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const wcDist = path.resolve(root, '..', 'dist');

const copies = [
  {
    from: path.join(wcDist, 'types', 'openvidu-meet.d.ts'),
    to: path.join(root, 'src', 'openvidu-meet', 'generated', 'types', 'openvidu-meet.d.ts'),
  },
  {
    from: path.join(wcDist, 'wrappers', 'angular', 'openvidu-meet-angular.ts'),
    to: path.join(
      root,
      'src',
      'openvidu-meet',
      'generated',
      'wrappers',
      'angular',
      'openvidu-meet-angular.ts'
    ),
  },
  {
    from: path.join(wcDist, 'wrappers', 'angular', 'index.ts'),
    to: path.join(root, 'src', 'openvidu-meet', 'generated', 'wrappers', 'angular', 'index.ts'),
  },
];

let hasError = false;

for (const file of copies) {
  if (!fs.existsSync(file.from)) {
    console.error(
      `[sync:wc] missing source: ${path.relative(wcDist, file.from)}\n` +
        `         Run 'pnpm run build:wc' first.`
    );
    hasError = true;
    continue;
  }

  fs.mkdirSync(path.dirname(file.to), { recursive: true });
  fs.copyFileSync(file.from, file.to);
  console.log(`[sync:wc] copied → ${path.relative(root, file.to)}`);
}

if (hasError) process.exit(1);
