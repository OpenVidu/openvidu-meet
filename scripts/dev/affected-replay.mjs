#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan } from './affected-tests.mjs';

// Measures `./meet.sh affected` on merged pull requests: given only the files of each one that are not
// integration or e2e tests, would it have listed the integration and e2e tests that pull request changed?
// Those are tests the change could break, so each one it does not list is a gap of scripts/dev/test-areas.mjs.
//   node scripts/dev/affected-replay.mjs [count]   (default: the last 150; needs an authenticated `gh`)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FOLDERS = {
	'backend-integration': 'meet-ce/backend/tests/integration/',
	'console-e2e': 'meet-ce/frontend/e2e/console/',
	'frontend-e2e': 'meet-ce/frontend/e2e/',
	'wc-e2e': 'meet-ce/frontend/webcomponent/tests/e2e/'
};

const suiteOf = (file) =>
	Object.keys(FOLDERS).find((suite) => file.startsWith(FOLDERS[suite]) && file.endsWith('.test.ts'));
const folderOf = (test) => (test.startsWith('api/') ? test.split('/')[1] : test.split('/')[0]);

const count = process.argv[2] ?? '150';
const listing = spawnSync('gh', ['pr', 'list', '--state', 'merged', '--limit', count, '--json', 'number,title,files'], {
	cwd: ROOT,
	encoding: 'utf8',
	maxBuffer: 1 << 28
});

if (listing.status !== 0) {
	console.error(`gh pr list failed:\n${listing.stderr}`);
	process.exit(2);
}

const missed = [];
let replayed = 0;
let listed = 0;

for (const { number, title, files } of JSON.parse(listing.stdout)) {
	const paths = files.map((file) => file.path);
	const tests = paths.filter((file) => suiteOf(file) && existsSync(join(ROOT, file)));
	const sources = paths.filter((file) => !suiteOf(file));

	if (tests.length === 0 || sources.length === 0) continue;

	const { areas, targets } = plan(sources);
	replayed++;

	for (const file of tests) {
		const suite = suiteOf(file);
		const test = file.slice(FOLDERS[suite].length);
		const found = targets[suite]?.has(test) || targets[suite]?.has(folderOf(test));

		if (found) listed++;
		else missed.push({ number, title, test: `${suite} ${test}`, areas });
	}
}

const total = listed + missed.length;

console.log(
	`${replayed} pull requests that changed integration or e2e tests: ${listed} of ${total} test files listed (${Math.round((listed / total) * 100)}%)`
);

for (const { number, title, test, areas } of missed) {
	console.log(`#${number} ${title.slice(0, 70)}\n  not listed: ${test}  (areas: ${areas.join(', ') || 'none'})`);
}
