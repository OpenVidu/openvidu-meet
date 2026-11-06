#!/usr/bin/env node
import { readFileSync } from 'node:fs';

// Prints `<suite>=true|false` for each CI suite, and `storage=true|false` for the storage services (their
// recordings tests then run on every storage provider), from the changed files read on stdin (one per line).
//   --all             every suite, without reading stdin
//   --only a,b        no suite outside this list
//   --without-backend the e2e suites ignore changes that only touch the backend
// Patterns follow GitHub's `paths` filters: evaluated in order, `!` excludes, a later pattern re-includes.

// Only the SPA routes reach the console, so the web component bundle never contains it.
const CONSOLE_DOMAIN = '!meet-ce/frontend/projects/shared-meet-components/src/lib/domains/console/**';

const SUITES = {
	'backend-unit': [
		'meet-ce/backend/**',
		// Suites this job does not run, and the helpers only they use.
		'!meet-ce/backend/tests/integration/**',
		'!meet-ce/backend/tests/helpers/**',
		'!meet-ce/backend/tests/interfaces/**',
		'meet-ce/typings/**',
		'pnpm-lock.yaml',
		'meet.sh',
		'!**/*.md',
		'!meet-ce/backend/nodemon*.json'
	],
	'frontend-unit': [
		'meet-ce/frontend/**',
		'!meet-ce/frontend/webcomponent/**',
		'!meet-ce/frontend/e2e/**',
		'meet-ce/typings/**',
		'meet.sh',
		'!**/*.md'
	],
	'wc-unit': [
		'meet-ce/frontend/webcomponent/**',
		'!meet-ce/frontend/webcomponent/tests/e2e/**',
		'meet-ce/frontend/projects/shared-meet-components/**',
		CONSOLE_DOMAIN,
		'!meet-ce/frontend/projects/**/*.spec.ts',
		'meet-ce/typings/**',
		'meet.sh',
		'!**/*.md'
	],
	'backend-integration': [
		'meet-ce/backend/src/**',
		'meet-ce/backend/package.json',
		'meet-ce/backend/tests/integration/**',
		'meet-ce/backend/tests/helpers/**',
		'meet-ce/backend/tests/interfaces/**',
		'meet-ce/typings/**',
		// The embedded API belongs to the frontend, except the leave reasons the webhooks carry.
		'!meet-ce/typings/src/embedded/**',
		'meet-ce/typings/src/embedded/events.ts',
		'pnpm-lock.yaml',
		'!**/*.md'
	],
	'frontend-e2e': [
		'meet-ce/frontend/**',
		'!meet-ce/frontend/webcomponent/**',
		'!meet-ce/frontend/projects/**/*.spec.ts',
		'meet-ce/typings/**',
		'meet.sh',
		'!**/*.md'
	],
	'wc-e2e': [
		'meet-ce/frontend/webcomponent/**',
		'!meet-ce/frontend/webcomponent/tests/unit/**',
		'meet-ce/frontend/projects/shared-meet-components/**',
		CONSOLE_DOMAIN,
		'!meet-ce/frontend/projects/**/*.spec.ts',
		'meet-ce/typings/**',
		'testapp/**',
		'meet.sh',
		'!**/*.md'
	]
};

// The e2e suites run against the built server, so a change to it selects them too.
const E2E_SERVER = [
	'meet-ce/backend/**',
	// Nothing under tests/ is shipped in the server these suites run against.
	'!meet-ce/backend/tests/**',
	'!meet-ce/backend/nodemon*.json',
	'!**/*.md'
];
const E2E_SUITES = ['frontend-e2e', 'wc-e2e'];

const CI_FILES = ['.github/workflows/ci.yaml', 'scripts/ci/changed-suites.mjs'];

const STORAGE = ['meet-ce/backend/src/services/storage/**'];

const toRegExp = (glob) =>
	new RegExp(
		'^' +
			glob
				.split(/(\*\*\/|\*\*|\*|\?)/)
				.map((part) => {
					switch (part) {
						case '**/':
							return '(?:.*/)?';
						case '**':
							return '.*';
						case '*':
							return '[^/]*';
						case '?':
							return '[^/]';
						default:
							return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
					}
				})
				.join('') +
			'$'
	);

const matches = (file, patterns) =>
	patterns.reduce((matched, pattern) => {
		const excluded = pattern.startsWith('!');
		const hit = toRegExp(excluded ? pattern.slice(1) : pattern).test(file);
		return hit ? !excluded : matched;
	}, false);

const args = process.argv.slice(2);
const all = args.includes('--all');
const withBackend = !args.includes('--without-backend');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args[onlyIndex + 1].split(',').map((suite) => suite.trim()) : Object.keys(SUITES);
const unknown = only.filter((suite) => !(suite in SUITES));

if (unknown.length > 0) {
	console.error(`Unknown suites: ${unknown.join(', ')}. Known: ${Object.keys(SUITES).join(', ')}`);
	process.exit(1);
}

const files = all
	? []
	: readFileSync(0, 'utf8')
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

for (const [suite, patterns] of Object.entries(SUITES)) {
	const backendSelects = withBackend && E2E_SUITES.includes(suite);
	const affected =
		all ||
		files.some(
			(file) => matches(file, [...patterns, ...CI_FILES]) || (backendSelects && matches(file, E2E_SERVER))
		);
	console.log(`${suite}=${affected && only.includes(suite)}`);
}

console.log(`storage=${all || files.some((file) => matches(file, STORAGE))}`);
