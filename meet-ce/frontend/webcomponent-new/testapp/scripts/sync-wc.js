/**
 * sync-wc.js
 *
 * Copies the generated API artifacts from the webcomponent-new build into the
 * testapp's src/ tree so that Angular's build can process them within the
 * project root. Also copies the WC bundle into public/ for the dev server.
 *
 * Run automatically via:  pnpm run start | serve | build
 * Run manually:           node scripts/sync-wc.js
 *
 * Source:  ../dist/   (produced by `pnpm run build:wc` in webcomponent-new)
 * Destination:
 *   public/openvidu-meet-wc.js                               ← served as /openvidu-meet-wc.js
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
    from: path.join(wcDist, 'openvidu-meet-wc.js'),
    to: path.join(root, 'public', 'openvidu-meet-wc.js'),
  },
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
