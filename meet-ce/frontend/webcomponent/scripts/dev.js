/**
 * dev.js
 *
 * Development script that:
 *   1. Starts `ng build --watch --configuration=wc` (Angular WC build in watch mode)
 *   2. Waits for the first successful build (dist/wc/browser/main.js to appear)
 *   3. Runs post-build scripts (concat-wc.js + generate-api.js + sync-wc.js)
 *   4. Starts the testapp on an internal port (4299) via `ng serve`
 *   5. Starts browser-sync as a proxy on port 4200, watching the WC bundle.
 *      After every rebuild browser-sync triggers a full browser reload.
 *
 * Usage (from webcomponent-new/):
 *   pnpm run dev
 *
 * URLs:
 *   http://localhost:4200  ← entry point (browser-sync proxy, live reload)
 *   http://localhost:4299  ← ng serve (internal)
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const testappDir = path.join(rootDir, 'testapp');
const mainJs = path.join(rootDir, 'dist', 'wc', 'browser', 'main.js');
const wcBundle = path.join(testappDir, 'public', 'openvidu-meet-wc.js');

// Ports
const TESTAPP_INTERNAL_PORT = 4299;
const BS_PORT = 4200;

// ─── Resolve modules / binaries ──────────────────────────────────────────────

// Resolve a binary by walking up from `startDir` through node_modules/.bin/
function resolveBin(name, startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[dev] Could not find '${name}' binary. Run pnpm install at the workspace root.`);
    }
    dir = parent;
  }
}

// Resolve a Node module by walking up from `startDir` through node_modules/
function resolveModule(name, startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[dev] Could not find module '${name}'. Run pnpm install at the workspace root.`);
    }
    dir = parent;
  }
}

// Resolve Angular CLI binaries (may be hoisted to workspace root by pnpm)
const ngBin = resolveBin('ng', rootDir);
const testappNgBin = (() => {
  try { return resolveBin('ng', testappDir); } catch { return ngBin; }
})();

// ─── Post-build chain ────────────────────────────────────────────────────────

let bsInstance = null;

function runPostBuild() {
  console.log('\n[dev] Running post-build chain...');

  const steps = [
    { label: 'concat-wc.js', cmd: 'node', args: [path.join(rootDir, 'scripts', 'concat-wc.js')], cwd: rootDir },
    { label: 'generate-api.js', cmd: 'node', args: [path.join(rootDir, 'scripts', 'generate-api.js')], cwd: rootDir },
    { label: 'sync-wc.js', cmd: 'node', args: [path.join(testappDir, 'scripts', 'sync-wc.js')], cwd: testappDir },
  ];

  for (const step of steps) {
    const result = spawnSync(step.cmd, step.args, { cwd: step.cwd, stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`[dev] ${step.label} exited with code ${result.status}`);
      return false;
    }
  }

  // Trigger full browser reload via browser-sync
  if (bsInstance) {
    bsInstance.reload();
    console.log('[dev] browser-sync: full reload triggered.\n');
  } else {
    console.log('[dev] Post-build complete.\n');
  }
  return true;
}

// ─── Watch dist output ───────────────────────────────────────────────────────

let debounceTimer = null;
let lastMtime = 0;
let testappProcess = null;

function schedulePostBuild() {
  if (!fs.existsSync(mainJs)) return;
  try {
    const mtime = fs.statSync(mainJs).mtimeMs;
    if (mtime === lastMtime) return;
    lastMtime = mtime;

    clearTimeout(debounceTimer);
    // Small debounce: Angular writes several files; wait until writes settle
    debounceTimer = setTimeout(() => {
      runPostBuild();
    }, 500);
  } catch (_) {}
}

function startWatchingDist() {
  // Watch the directory instead of the file: fs.watch on a specific file
  // loses the watcher if Angular deletes+recreates it on every rebuild.
  const distDir = path.dirname(mainJs);
  fs.watch(distDir, { persistent: true }, (event, filename) => {
    if (filename === 'main.js') schedulePostBuild();
  });
  console.log('[dev] Watching dist/wc/browser/ for main.js changes...\n');
}

// ─── Wait for first build, then boot testapp ─────────────────────────────────

function waitForFirstBuild(callback) {
  if (fs.existsSync(mainJs)) {
    callback();
    return;
  }
  console.log('[dev] Waiting for initial WC build...');
  const interval = setInterval(() => {
    if (fs.existsSync(mainJs)) {
      clearInterval(interval);
      callback();
    }
  }, 1000);
}

function startTestapp() {
  console.log(`[dev] Starting testapp on internal port ${TESTAPP_INTERNAL_PORT}...\n`);
  testappProcess = spawn(testappNgBin, ['serve', '--port', String(TESTAPP_INTERNAL_PORT)], {
    cwd: testappDir,
    stdio: 'inherit',
  });

  testappProcess.on('error', (err) => {
    console.error('[dev] testapp ng serve error:', err.message);
  });

  testappProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[dev] testapp ng serve exited with code ${code}`);
    }
  });
}

// ─── browser-sync proxy ───────────────────────────────────────────────────────

function startBrowserSync() {
  const bsPath = resolveModule('browser-sync', rootDir);
  const browserSync = require(bsPath);

  bsInstance = browserSync.create('openvidu-meet-wc-dev');

  // Wait a bit for ng serve to be ready before proxying
  const initDelay = 8000;
  console.log(`[dev] browser-sync will start in ${initDelay / 1000}s (waiting for ng serve)...`);

  setTimeout(() => {
    bsInstance.init(
      {
        proxy: `http://localhost:${TESTAPP_INTERNAL_PORT}`,
        port: BS_PORT,
        open: false,
        reloadDelay: 300,
        reloadDebounce: 500,
        notify: false,
        logLevel: 'info',
        logPrefix: 'browser-sync',
        ui: false,
        // Prevent the browser from caching the WC bundle (no hash in filename)
        middleware: [
          function noCacheWcBundle(req, res, next) {
            if (req.url && req.url.includes('openvidu-meet-wc.js')) {
              res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
            }
            next();
          },
        ],
      },
      (err) => {
        if (err) {
          console.error('[dev] browser-sync init error:', err);
          return;
        }
        const time = new Date().toLocaleTimeString();
        console.log(`[dev] browser-sync ready at http://localhost:${BS_PORT} (${time})`);
      }
    );
  }, initDelay);
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('[dev] Starting Angular WC watch build...\n');
const wcBuild = spawn(ngBin, ['build', '--watch', '--configuration=wc'], {
  cwd: rootDir,
  stdio: 'inherit',
});

wcBuild.on('error', (err) => {
  console.error('[dev] ng build error:', err.message);
  process.exit(1);
});

waitForFirstBuild(() => {
  const ok = runPostBuild();
  if (!ok) {
    console.error('[dev] Initial post-build failed. Fix errors and re-run.');
    process.exit(1);
  }
  startTestapp();
  startBrowserSync();
  startWatchingDist();
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function cleanup() {
  clearTimeout(debounceTimer);
  if (bsInstance) { try { bsInstance.exit(); } catch (_) {} }
  if (wcBuild) wcBuild.kill('SIGTERM');
  if (testappProcess) testappProcess.kill('SIGTERM');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
