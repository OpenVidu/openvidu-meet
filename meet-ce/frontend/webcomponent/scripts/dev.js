/**
 * dev.js
 *
 * Development script that:
 *   1. Starts `ng build --watch --configuration=wc` (Angular WC build in watch mode)
 *   2. Waits for the first successful build (dist/wc/browser/main.js to appear)
 *   3. Runs post-build scripts (concat-wc.js + deploy-to-backend.js)
 *   4. Starts the testapp on port 4200 via `ng serve`
 *   5. Watches the WC bundle: after every rebuild it re-runs the post-build chain
 *      so the fresh bundle is deployed into the testapp. The Angular dev server
 *      reloads the page when the deployed bundle changes.
 *
 * Usage (from webcomponent/):
 *   pnpm run dev
 *
 * URL:
 *   http://localhost:4200  ← testapp (ng serve)
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
// The testapp was moved to the repo root (../../../testapp from webcomponent/).
const testappDir = path.resolve(rootDir, '..', '..', '..', 'testapp');
const mainJs = path.join(rootDir, 'dist', 'wc', 'browser', 'main.js');

// Ports
const TESTAPP_PORT = 4200;

// ─── Resolve binaries ────────────────────────────────────────────────────────

// Resolve a binary by walking up from `startDir` through node_modules/.bin/
const resolveBin = (name, startDir) => {
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
};

// Resolve Angular CLI binaries (may be hoisted to workspace root by pnpm)
const ngBin = resolveBin('ng', rootDir);
const testappNgBin = (() => {
  try {
    return resolveBin('ng', testappDir);
  } catch {
    return ngBin;
  }
})();

// ─── Post-build chain ────────────────────────────────────────────────────────

const runPostBuild = () => {
  console.log('\n[dev] Running post-build chain...');

  const steps = [
    { label: 'concat-wc.js', cmd: 'node', args: [path.join(rootDir, 'scripts', 'concat-wc.js')], cwd: rootDir },
    { label: 'deploy-to-backend.js', cmd: 'node', args: [path.join(rootDir, 'scripts', 'deploy-to-backend.js')], cwd: rootDir },
  ];

  for (const step of steps) {
    // WC_DEV tells concat-wc.js to skip re-minifying the heavy ESM on every
    // rebuild (~1-2 s/save); production builds run without it and stay minified.
    const result = spawnSync(step.cmd, step.args, {
      cwd: step.cwd,
      stdio: 'inherit',
      env: { ...process.env, WC_DEV: '1' },
    });
    if (result.status !== 0) {
      console.error(`[dev] ${step.label} exited with code ${result.status}`);
      return false;
    }
  }

  console.log('[dev] Post-build complete.\n');
  return true;
};

// ─── Watch dist output ───────────────────────────────────────────────────────

let debounceTimer = null;
let lastMtime = 0;
let testappProcess = null;

const schedulePostBuild = () => {
  if (!fs.existsSync(mainJs)) return;
  try {
    const mtime = fs.statSync(mainJs).mtimeMs;
    if (mtime === lastMtime) return;
    lastMtime = mtime;

    clearTimeout(debounceTimer);
    // Small debounce: Angular writes several files; wait until writes settle
    debounceTimer = setTimeout(() => runPostBuild(), 500);
  } catch {
    // ignore transient stat errors during Angular's rebuild churn
  }
};

const startWatchingDist = () => {
  // Watch the directory instead of the file: fs.watch on a specific file
  // loses the watcher if Angular deletes+recreates it on every rebuild.
  const distDir = path.dirname(mainJs);
  fs.watch(distDir, { persistent: true }, (_event, filename) => {
    if (filename === 'main.js') schedulePostBuild();
  });
  console.log('[dev] Watching dist/wc/browser/ for main.js changes...\n');
};

// ─── Wait for first build, then boot testapp ─────────────────────────────────

const waitForFirstBuild = (callback) => {
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
};

const startTestapp = () => {
  console.log(`[dev] Starting testapp on http://localhost:${TESTAPP_PORT}...\n`);
  testappProcess = spawn(testappNgBin, ['serve', '--port', String(TESTAPP_PORT)], {
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
};

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
  startWatchingDist();
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

const cleanup = () => {
  clearTimeout(debounceTimer);
  if (wcBuild) wcBuild.kill('SIGTERM');
  if (testappProcess) testappProcess.kill('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
