#!/usr/bin/env node
import { spawn } from 'child_process';
import { watch } from 'fs';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import treeKill from 'tree-kill';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CE_TYPINGS_FLAG_PATH = resolve(__dirname, '../../meet-ce/typings/dist/typings-ready.flag');
const CE_TYPINGS_DIST = resolve(__dirname, '../../meet-ce/typings/dist');
const DEBOUNCE_MS = 500; // Wait 500ms after flag appears before restarting
const KILL_TIMEOUT_MS = 5000; // Max time to wait for process to die

// Get command from arguments
const command = process.argv.slice(2).join(' ');

if (!command) {
	console.error('❌ Error: No command provided');
	console.error('Usage: watch-with-typings-guard.mjs <command>');
	process.exit(1);
}

let childProcess = null;
let isTypingsReady = false;
let pendingRestart = null;
let hasStartedOnce = false;
let isKilling = false;

/**
 * Start the child process
 */
async function startProcess() {
	if (!isTypingsReady) {
		if (!hasStartedOnce) {
			console.log('Waiting for typings to be ready...');
		}
		return;
	}

	if (childProcess) {
		console.log('Restarting process...');
		await killProcess();
	}

	if (isKilling) {
		console.log('Waiting for previous process to terminate...');
		return;
	}

	console.log(`Starting: ${command}`);
	childProcess = spawn(command, {
		shell: true,
		stdio: 'inherit',
		env: { ...process.env },
		detached: false
	});

	hasStartedOnce = true;

	childProcess.on('exit', (code) => {
		if (code !== null && code !== 0 && !isKilling) {
			console.error(`❌ Process exited with code ${code}`);
		}
		childProcess = null;
		isKilling = false;
	});
}

/**
 * Kill the child process gracefully (and wait for it to die)
 */
function killProcess() {
	return new Promise((resolve) => {
		if (!childProcess || isKilling) {
			resolve();
			return;
		}

		isKilling = true;
		const pid = childProcess.pid;

		// Set a timeout in case the process doesn't die
		const timeout = setTimeout(() => {
			console.error(`⚠️  Process ${pid} didn't terminate gracefully, force killing...`);
			if (childProcess) {
				try {
					treeKill(pid, 'SIGKILL');
				} catch (err) {
					console.error('Error force killing process:', err.message);
				}
			}
			isKilling = false;
			childProcess = null;
			resolve();
		}, KILL_TIMEOUT_MS);

		// Try graceful shutdown first
		childProcess.once('exit', () => {
			clearTimeout(timeout);
			isKilling = false;
			childProcess = null;
			resolve();
		});

		try {
			// Kill the entire process tree (important for shells that spawn subprocesses)
			treeKill(pid, 'SIGTERM', (err) => {
				if (err) {
					console.error(`⚠️  Error killing process tree: ${err.message}`);
					// Fallback to direct kill
					try {
						childProcess?.kill('SIGTERM');
					} catch (e) {
						console.error('Error in fallback kill:', e.message);
					}
				}
			});
		} catch (err) {
			console.error('Error killing process:', err.message);
			clearTimeout(timeout);
			isKilling = false;
			childProcess = null;
			resolve();
		}
	});
}

/**
 * Schedule a restart with debouncing
 */
function scheduleRestart() {
	// Don't schedule if we're currently killing a process
	if (isKilling) {
		console.log('Process is being killed, will restart when done...');
		// Will retry after kill completes
		setTimeout(scheduleRestart, 100);
		return;
	}

	if (pendingRestart) {
		clearTimeout(pendingRestart);
	}

	pendingRestart = setTimeout(async () => {
		pendingRestart = null;
		await startProcess();
	}, DEBOUNCE_MS);
}

/**
 * Check if typings are ready
 */
function checkTypingsReady() {
	const wasReady = isTypingsReady;
	isTypingsReady = existsSync(CE_TYPINGS_FLAG_PATH);

	if (!wasReady && isTypingsReady) {
		console.log('✅ Typings are ready!');
		scheduleRestart();
	} else if (wasReady && !isTypingsReady) {
		console.log('Typings recompiling... (process will restart when ready)');
	}

	return isTypingsReady;
}

/**
 * Watch the flag file
 */
function watchFlag() {
	console.log(`Watching typings flag: ${CE_TYPINGS_FLAG_PATH}`);

	// Initial check
	checkTypingsReady();

	// Watch the parent directory of the flag
	const flagDir = dirname(CE_TYPINGS_FLAG_PATH);

	const watcher = watch(flagDir, { recursive: false }, (eventType, filename) => {
		if (filename === 'typings-ready.flag') {
			checkTypingsReady();
		}
	});

	watcher.on('error', (error) => {
		console.error('❌ Watcher error:', error);
	});

	return watcher;
}

/**
 * Watch typings/dist for changes (to trigger restart when ready)
 */
function watchTypingsDist() {
	console.log(`Watching typings dist: ${CE_TYPINGS_DIST}`);

	const watcher = watch(CE_TYPINGS_DIST, { recursive: true }, (eventType, filename) => {
		// Ignore the flag file itself (handled by watchFlag)
		if (filename === 'typings-ready.flag') {
			return;
		}

		// Only log changes, but don't restart yet
		// Restart will happen when flag is recreated (via checkTypingsReady)
		if (childProcess && isTypingsReady) {
			console.log(`Detected change in typings: ${filename} (will restart when compilation finishes)`);
		}
	});

	watcher.on('error', (error) => {
		console.error('❌ Watcher error:', error);
	});

	return watcher;
}

// Start watching
const flagWatcher = watchFlag();
const distWatcher = watchTypingsDist();

// Cleanup on exit
process.on('SIGINT', async () => {
	console.log('\n🛑 Stopping...');
	await killProcess();
	flagWatcher.close();
	distWatcher.close();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await killProcess();
	flagWatcher.close();
	distWatcher.close();
	process.exit(0);
});
