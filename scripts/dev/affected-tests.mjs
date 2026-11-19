#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AREAS, BACKEND_FOLDER_SCRIPTS, NO_TESTS_OF_THEIR_OWN } from './test-areas.mjs';

// Says which integration and e2e tests a change needs to run locally: the suites CI would select
// (scripts/ci/changed-suites.mjs), narrowed to the tests of the areas the change touches (test-areas.mjs).
//   --base <ref>  diff against <ref> (default: merge base of HEAD and origin/main), plus untracked files
//   --stdin       read the changed files from stdin (one per line) instead of the diff
//   --check       fail when a test folder, spec file or OpenSpec capability is not in the map
// CI keeps running whole suites; this is only what is worth running on a laptop.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND_TESTS = 'meet-ce/backend/tests/integration';
const FRONTEND_TESTS = 'meet-ce/frontend/e2e';
const CONSOLE_TESTS = `${FRONTEND_TESTS}/console`;
const WC_TESTS = 'meet-ce/frontend/webcomponent/tests/e2e';
const MAX_UNPLACED = 5;

const SUITES = {
	'backend-integration': { title: 'backend integration' },
	'frontend-e2e': { title: 'frontend e2e', whole: 'test-e2e-frontend' },
	'console-e2e': { title: 'console e2e', whole: 'test-e2e-console' },
	'wc-e2e': { title: 'webcomponent e2e', whole: 'test-e2e-webcomponent' }
};

const lines = (text) => text.split('\n').filter(Boolean);
const fail = (message) => {
	console.error(message);
	process.exit(2);
};

const run = (command, args, input) =>
	spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, input });

const git = (...args) => run('/usr/bin/env', ['git', ...args]);

const parseArgs = (argv) => {
	const options = { base: undefined, stdin: false, check: false };

	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--base') options.base = argv[++i];
		else if (argv[i] === '--stdin') options.stdin = true;
		else if (argv[i] === '--check') options.check = true;
		else fail(`Unknown argument: ${argv[i]}. Usage: affected-tests.mjs [--base <ref>] [--stdin] [--check]`);
	}

	return options;
};

const changedFiles = (base) => {
	const ref = base ?? git('merge-base', 'HEAD', 'origin/main').stdout.trim();

	if (!ref || git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`).status !== 0) {
		fail(
			`Cannot resolve the base${base ? ` "${base}"` : ' (merge base of HEAD and origin/main)'}. Pass --base <ref>.`
		);
	}

	return {
		ref,
		files: [
			...new Set([
				...lines(git('diff', '--name-only', '--no-renames', ref).stdout),
				...lines(git('ls-files', '--others', '--exclude-standard').stdout)
			])
		]
	};
};

const selectedSuites = (files) => {
	const result = run('node', ['scripts/ci/changed-suites.mjs'], files.join('\n'));

	if (result.status !== 0) fail(`changed-suites.mjs failed:\n${result.stderr}`);

	return Object.fromEntries(lines(result.stdout).map((line) => line.split('=')));
};

const toRegExp = (glob) =>
	new RegExp(
		'^' +
			glob
				.split(/(\*\*\/|\*\*|\*)/)
				.map((part) => {
					if (part === '**/') return '(?:.*/)?';

					if (part === '**') return '.*';

					if (part === '*') return '[^/]*';

					return part.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
				})
				.join('') +
			'$'
	);

const areaMatchers = Object.entries(AREAS).map(([name, area]) => ({
	name,
	specs: area.specs ?? [name],
	paths: area.paths.map(toRegExp)
}));

const PRODUCT_SOURCE =
	/^(?:meet-ce\/(?:backend|typings)\/src\/|meet-ce\/frontend\/(?:src|projects|webcomponent\/src)\/|testapp\/src\/)/;
const TEST_SUPPORT = [
	BACKEND_TESTS,
	FRONTEND_TESTS,
	WC_TESTS,
	'meet-ce/backend/tests/helpers',
	'meet-ce/backend/tests/interfaces'
];
// What an area can claim: product source, and the helpers and fixtures the heavy suites share.
const needsAnArea = (file) =>
	!/\.(?:md|spec\.ts|test\.ts)$/.test(file) &&
	(PRODUCT_SOURCE.test(file) || TEST_SUPPORT.some((folder) => file.startsWith(`${folder}/`)));

const SPEC_PATH = /^openspec\/(?:specs|changes\/.+?\/specs)\/([^/]+)\//;

const touchedAreas = (files) => {
	const touched = new Map();
	const unplaced = [];
	const signal = (name, reason) => touched.set(name, [...(touched.get(name) ?? []), reason]);

	for (const file of files) {
		const capability = file.match(SPEC_PATH)?.[1];
		const hits = file.endsWith('.md')
			? []
			: areaMatchers.filter((area) => area.paths.some((path) => path.test(file)));

		for (const area of areaMatchers.filter((candidate) => candidate.specs.includes(capability)))
			signal(area.name, `spec ${capability}`);

		for (const area of hits) signal(area.name, file);

		if (hits.length === 0 && needsAnArea(file)) unplaced.push(file);
	}

	return { touched, unplaced };
};

const signalText = (reasons) => {
	const unique = [...new Set(reasons)];
	const specs = unique.filter((reason) => reason.startsWith('spec '));
	const files = unique.filter((reason) => !reason.startsWith('spec '));
	const name = files[0]?.split('/').at(-1);
	const fileText = files.length > 1 ? `${name} and ${files.length - 1} more` : name;

	return [...specs, fileText].filter(Boolean).join(', ');
};

const folderOf = (file) => (file.startsWith('api/') ? file.split('/')[1] : file.split('/')[0]);

const testIn = (folder, file) =>
	file.startsWith(`${folder}/`) && file.endsWith('.test.ts') ? file.slice(folder.length + 1) : undefined;

// A target is { whole: boolean, greps: Set<string>, reasons: string[] }, keyed by folder or file name.
const collect = (suite, files, touched) => {
	const targets = new Map();
	const add = (key, grep, reason) => {
		const target = targets.get(key) ?? { whole: false, greps: new Set(), reasons: [] };

		if (grep) target.greps.add(grep);
		else target.whole = true;

		target.reasons.push(reason);
		targets.set(key, target);
	};
	const changedTest = {
		'backend-integration': (file) => testIn(BACKEND_TESTS, file),
		'frontend-e2e': (file) => (testIn(CONSOLE_TESTS, file) ? undefined : testIn(FRONTEND_TESTS, file)),
		'console-e2e': (file) => testIn(CONSOLE_TESTS, file),
		'wc-e2e': (file) => testIn(WC_TESTS, file)
	}[suite];
	const areaKey = {
		'backend-integration': 'backend',
		'frontend-e2e': 'frontend',
		'console-e2e': 'console',
		'wc-e2e': 'wc'
	}[suite];

	for (const file of files) {
		const test = changedTest(file);

		if (test && existsSync(join(ROOT, file))) add(test, undefined, 'changed');
	}

	for (const [name, reasons] of touched) {
		for (const entry of AREAS[name][areaKey] ?? []) {
			const [key, grep] = Array.isArray(entry) ? entry : [entry, undefined];
			add(key, grep, `area ${name} (${signalText(reasons)})`);
		}
	}

	if (suite === 'backend-integration') {
		for (const key of [...targets.keys()].filter((key) => key.includes('/'))) {
			if (!targets.has(folderOf(key))) continue;

			targets.get(folderOf(key)).reasons.push(...targets.get(key).reasons.map((reason) => `${key} ${reason}`));
			targets.delete(key);
		}
	}

	return targets;
};

const quote = (word) => (/^[\w./:=@-]+$/.test(word) ? word : `'${word}'`);
const stackRun = (...command) => `./meet.sh stack run <name> -- ${command.map(quote).join(' ')}`;

const BACKEND_RUN = ['pnpm', '--filter', '@openvidu-meet/backend'];
const JEST = ['exec', 'node', '--experimental-vm-modules', '../../node_modules/jest/bin/jest.js'];

const commandsFor = (suite, targets) => {
	const keys = [...targets.keys()];

	if (suite === 'backend-integration') {
		const folders = keys.filter((key) => key in BACKEND_FOLDER_SCRIPTS);
		const tests = keys.filter((key) => !(key in BACKEND_FOLDER_SCRIPTS));

		return [
			...folders.map((folder) => stackRun(...BACKEND_RUN, 'run', BACKEND_FOLDER_SCRIPTS[folder])),
			...(tests.length > 0
				? [
						stackRun(
							...BACKEND_RUN,
							...JEST,
							'--runInBand',
							'--forceExit',
							...tests.map((test) => `tests/integration/${test}`)
						)
					]
				: [])
		];
	}

	const meet = ['./meet.sh', SUITES[suite].whole, '--skip-install'];
	const whole = keys.filter((key) => targets.get(key).whole);
	const narrowed = keys.filter((key) => !targets.get(key).whole);

	return [
		...(whole.length > 0 ? [stackRun(...meet, '--', ...whole)] : []),
		...narrowed.map((key) => stackRun(...meet, '--', key, '--grep', [...targets.get(key).greps].join('|')))
	];
};

const describeTarget = (key, target) => {
	const grep = target.whole || target.greps.size === 0 ? '' : ` --grep ${[...target.greps].join('|')}`;
	return `  ${key}${grep}  <- ${[...new Set(target.reasons)].join('; ')}`;
};

// The targets of a suite the diff does not select are undefined.
export const plan = (files, selected = selectedSuites(files)) => {
	const { touched, unplaced } = touchedAreas(files);

	return {
		areas: [...touched.keys()],
		unplaced,
		targets: Object.fromEntries(
			Object.keys(SUITES).map((suite) => [
				suite,
				selected[suite] === 'true' ? collect(suite, files, touched) : undefined
			])
		)
	};
};

const report = (files, base) => {
	const { areas, unplaced, targets: bySuite } = plan(files);
	const output = [`base ${base.slice(0, 12)}, ${files.length} changed files`];

	output.push(`areas: ${areas.length > 0 ? areas.join(', ') : 'none'}`);

	for (const [suite, { title, whole }] of Object.entries(SUITES)) {
		const targets = bySuite[suite];

		if (!targets) {
			output.push(`${title}: not selected by the diff, nothing to run`);
			continue;
		}

		if (targets.size === 0) {
			const command = whole
				? stackRun('./meet.sh', whole, '--skip-install')
				: stackRun(...BACKEND_RUN, 'run', 'test:integration-<group>');
			output.push(
				`${title}: selected by the diff, no targeted tests: the whole suite runs in CI.`,
				`  whole, if wanted: ${command}`
			);
			continue;
		}

		output.push(`${title}:`);

		for (const [key, target] of targets) output.push(describeTarget(key, target));

		for (const command of commandsFor(suite, targets)) output.push(`  ${command}`);
	}

	if (unplaced.length > 0) {
		const shown = unplaced.slice(0, MAX_UNPLACED).join(', ');
		output.push(
			`in no area, ${unplaced.length} shared files: ${shown}${unplaced.length > MAX_UNPLACED ? ', ...' : ''}`,
			'  the tests above do not cover them: the whole suites in CI do'
		);
	}

	return output.join('\n');
};

const listFiles = (directory, suffix) =>
	existsSync(join(ROOT, directory)) ? readdirSync(join(ROOT, directory)).filter((file) => file.endsWith(suffix)) : [];

const listDirectories = (directory) =>
	readdirSync(join(ROOT, directory), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

const check = () => {
	const referenced = (areaKey) =>
		new Set(
			Object.values(AREAS).flatMap((area) => (area[areaKey] ?? []).map((e) => (Array.isArray(e) ? e[0] : e)))
		);
	const backend = referenced('backend');
	const folders = [
		...listDirectories(`${BACKEND_TESTS}/api`),
		...listDirectories(BACKEND_TESTS).filter((name) => name !== 'api')
	];
	const tracked = lines(git('ls-files').stdout);
	const tests = Object.entries(AREAS).flatMap(
		([area, { backend = [], frontend = [], console: pages = [], wc = [] }]) =>
			[
				[BACKEND_TESTS, backend.filter((entry) => !(entry in BACKEND_FOLDER_SCRIPTS))],
				[FRONTEND_TESTS, frontend],
				[CONSOLE_TESTS, pages],
				[WC_TESTS, wc]
			].flatMap(([folder, entries]) =>
				entries.map((entry) => {
					const [file, grep] = [entry].flat();
					return { area, path: `${folder}/${file}`, grep };
				})
			)
	);
	const matchesNothing = ({ path, grep }) =>
		grep && existsSync(join(ROOT, path)) && !new RegExp(grep).test(readFileSync(join(ROOT, path), 'utf8'));
	const problems = [
		...Object.entries(AREAS).flatMap(([area, { paths }]) =>
			paths
				.filter((glob) => !tracked.some((file) => toRegExp(glob).test(file)))
				.map((glob) => `area ${area}: path matches no file: ${glob}`)
		),
		...tests
			.filter(({ path }) => !existsSync(join(ROOT, path)))
			.map(({ area, path }) => `area ${area}: test does not exist: ${path}`),
		...tests.filter(matchesNothing).map(({ path, grep }) => `--grep '${grep}' matches no test of ${path}`),
		...listFiles(FRONTEND_TESTS, '.test.ts')
			.filter((file) => !referenced('frontend').has(file))
			.map((file) => `frontend e2e spec not in any area: ${FRONTEND_TESTS}/${file}`),
		...listFiles(CONSOLE_TESTS, '.test.ts')
			.filter((file) => !referenced('console').has(file))
			.map((file) => `console e2e spec not in any area: ${CONSOLE_TESTS}/${file}`),
		...listFiles(WC_TESTS, '.test.ts')
			.filter((file) => !referenced('wc').has(file))
			.map((file) => `webcomponent e2e spec not in any area: ${WC_TESTS}/${file}`),
		...folders
			.filter((folder) => ![...backend].some((target) => target === folder || folderOf(target) === folder))
			.map((folder) => `backend integration folder not in any area: ${BACKEND_TESTS}/${folder}`),
		...Object.keys(BACKEND_FOLDER_SCRIPTS)
			.filter((folder) => !folders.includes(folder))
			.map((folder) => `BACKEND_FOLDER_SCRIPTS names a folder that does not exist: ${folder}`),
		...listDirectories('openspec/specs')
			.filter(
				(capability) =>
					!NO_TESTS_OF_THEIR_OWN.includes(capability) &&
					!Object.entries(AREAS).some(([name, area]) => (area.specs ?? [name]).includes(capability))
			)
			.map((capability) => `OpenSpec capability with no area (and not in NO_TESTS_OF_THEIR_OWN): ${capability}`)
	];

	if (problems.length === 0) return 0;

	console.log(`${problems.join('\n')}\nadd them to scripts/dev/test-areas.mjs`);
	return 1;
};

const main = () => {
	const options = parseArgs(process.argv.slice(2));

	if (options.check) return check();

	const { ref, files } = options.stdin
		? { ref: 'stdin', files: lines(readFileSync(0, 'utf8')) }
		: changedFiles(options.base);

	console.log(report(files, ref));
	return 0;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
