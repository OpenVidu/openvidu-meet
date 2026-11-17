#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { parse as parseYaml } from 'yaml';

// Tells whether a change is ready, with the logic CI uses: the suites the diff affects come from
// scripts/ci/changed-suites.mjs and each suite runs the commands its CI job runs.
//   --base <ref>  diff against <ref> (default: merge base of HEAD and origin/main)
//   --all         every check, regardless of the diff (format still covers the changed files only)
//   --only a,b    only these checks (ids, suite names, or `static`); a suite named here runs even if the diff misses it
//   --list        print what would run and why, run nothing
//   --fix         write the files the format check would fail
// Full logs go to test-results/verify/. Exit code 1 when any step failed.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, 'test-results', 'verify');
const MAX_EXCERPT_LINES = 30;
const MAX_LINE_LENGTH = 200;
const BACKEND = ['pnpm', '--filter', '@openvidu-meet/backend', 'run'];
const WEBCOMPONENT = ['pnpm', '--filter', '@openvidu-meet/webcomponent', 'run'];

const STATIC_CHECKS = ['format', 'openspec', 'openapi', 'agents'];

const TYPINGS = ['./meet.sh', 'build-typings', '--skip-install'];
const meet = (command) => ['./meet.sh', command, '--skip-install', '--skip-typings'];

const UNIT_SUITES = {
	'backend-unit': [
		{ id: 'test', cmd: meet('test-unit-backend') },
		{ id: 'types', cmd: [...BACKEND, 'test:types'] },
		{ id: 'lint', cmd: meet('lint-backend') }
	],
	'frontend-unit': [
		{ id: 'test', cmd: meet('test-unit-frontend') },
		{ id: 'lint', cmd: meet('lint-frontend') }
	],
	'wc-unit': [
		{ id: 'build', cmd: meet('build-webcomponent') },
		{ id: 'types', cmd: [...WEBCOMPONENT, 'test:types'] },
		{ id: 'test', cmd: meet('test-unit-webcomponent'), after: ['build'] },
		{ id: 'lint', cmd: meet('lint-webcomponent') }
	]
};

const NOT_RUN_HERE = {
	'backend-integration':
		'needs the local deployment (./meet.sh doctor): pnpm run test:integration-backend-<room-management|auth-security|webhooks|config-analytics|websocket|recordings>',
	'frontend-e2e':
		'needs the local deployment (./meet.sh doctor): ./meet.sh test-e2e-frontend --skip-install -- <specs>',
	'wc-e2e': 'needs the local deployment (./meet.sh doctor): ./meet.sh test-e2e-webcomponent --skip-install -- <specs>'
};

const SUITES = [...Object.keys(UNIT_SUITES), ...Object.keys(NOT_RUN_HERE)];
const KNOWN_IDS = [...STATIC_CHECKS, 'static', ...SUITES];

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
const STATUS_COLOR = { ok: 32, FAIL: 31, skip: 33, todo: 36 };

const run = (cmd, options = {}) =>
	spawnSync('bash', ['-c', 'exec "$@" 2>&1', '_', ...cmd], {
		cwd: ROOT,
		encoding: 'utf8',
		maxBuffer: 1 << 30,
		env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: process.env.CI ?? 'true' },
		...options
	});

const git = (...args) => run(['/usr/bin/env', 'git', ...args]);

const parseArgs = (argv) => {
	const options = { all: false, list: false, fix: false, base: undefined, only: undefined };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === '--all') options.all = true;
		else if (arg === '--list') options.list = true;
		else if (arg === '--fix') options.fix = true;
		else if (arg === '--base') options.base = argv[++i];
		else if (arg === '--only') options.only = (argv[++i] ?? '').split(',').map((id) => id.trim());
		else fail(`Unknown argument: ${arg}. Usage: verify.mjs [--base <ref>] [--all] [--only <ids>] [--list] [--fix]`);
	}

	if (options.only) {
		const unknown = options.only.filter((id) => !KNOWN_IDS.includes(id));

		if (unknown.length > 0) fail(`Unknown ids: ${unknown.join(', ')}. Known: ${KNOWN_IDS.join(', ')}`);

		options.only = options.only.flatMap((id) => (id === 'static' ? STATIC_CHECKS : [id]));
	}

	return options;
};

const fail = (message) => {
	console.error(message);
	process.exit(2);
};

const diffIsNeeded = (options) => !options.all && !options.only?.every((id) => SUITES.includes(id));

const resolveBase = (options) => {
	const base = options.base ?? git('merge-base', 'HEAD', 'origin/main').stdout.trim();

	if (base && git('rev-parse', '--verify', '--quiet', `${base}^{commit}`).status === 0) return base;

	if (diffIsNeeded(options)) {
		fail(
			`Cannot resolve the base${options.base ? ` "${options.base}"` : ' (merge base of HEAD and origin/main)'}. Pass --base <ref>.`
		);
	}

	return undefined;
};

const lines = (output) => output.split('\n').filter(Boolean);

const changedFiles = (base) => [
	...new Set([
		...lines(git('diff', '--name-only', '--no-renames', base).stdout),
		...lines(git('ls-files', '--others', '--exclude-standard').stdout)
	])
];

const selectedSuites = (files, all) => {
	const result = run(['node', 'scripts/ci/changed-suites.mjs', ...(all ? ['--all'] : [])], {
		input: files.join('\n')
	});

	if (result.status !== 0) fail(`changed-suites.mjs failed:\n${result.stdout}`);

	return Object.fromEntries(lines(result.stdout).map((line) => line.split('=')));
};

const isFormattable = async (file) => {
	const info = await prettier.getFileInfo(join(ROOT, file));
	return !info.ignored && info.inferredParser !== null && file !== 'pnpm-lock.yaml';
};

const isFormatted = async (file, source) => {
	const options = (await prettier.resolveConfig(join(ROOT, file), { editorconfig: true })) ?? {};
	return prettier.check(source, { ...options, filepath: join(ROOT, file) });
};

const checkFormat = async (files, base, fix) => {
	const unformatted = [];
	const skipped = [];

	for (const file of files.filter((candidate) => existsSync(join(ROOT, candidate)))) {
		if (!(await isFormattable(file)) || (await isFormatted(file, readFileSync(join(ROOT, file), 'utf8')))) continue;

		const atBase = git('show', `${base}:${file}`);
		const wasFormatted = atBase.status !== 0 || (await isFormatted(file, atBase.stdout));

		(wasFormatted ? unformatted : skipped).push(file);
	}

	if (fix) {
		for (const file of unformatted) {
			const path = join(ROOT, file);
			const options = (await prettier.resolveConfig(path, { editorconfig: true })) ?? {};
			writeFileSync(path, await prettier.format(readFileSync(path, 'utf8'), { ...options, filepath: path }));
		}
	}

	const note = skipped.length > 0 ? `unformatted at the base, not checked: ${skipped.join(' ')}` : '';

	if (unformatted.length === 0)
		return {
			ok: true,
			output: note,
			note: skipped.length > 0 ? `${skipped.length} unformatted at base ignored` : ''
		};

	if (fix)
		return { ok: true, output: `fixed: ${unformatted.join(' ')}\n${note}`, note: `fixed ${unformatted.length}` };

	return { ok: false, output: `Prettier would change (run with --fix):\n${unformatted.join('\n')}\n${note}` };
};

const ANSI = /\x1b\[[0-9;]*m/g;
const ERROR_LINE = /error TS\d+|●|\bFAIL\b|\berror\b|Error:|✖|✕|Failed to compile/;
const NOISE = /^\s*$|^PASS\b|ELIFECYCLE|ERR_PNPM|Command failed|^\s*at .*node_modules/;

const excerpt = (output) => {
	const kept = output
		.replace(ANSI, '')
		.split('\n')
		.map((line) => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}...` : line.trimEnd()))
		.filter((line) => !NOISE.test(line));
	const first = kept.findIndex((line) => ERROR_LINE.test(line));
	const start = first > 0 ? first - 1 : Math.max(0, kept.length - MAX_EXCERPT_LINES);

	return kept.slice(start, start + MAX_EXCERPT_LINES).join('\n');
};

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

const report = (status, id, detail = '') =>
	console.log(`${paint(STATUS_COLOR[status], status.padEnd(4))} ${id.padEnd(24)} ${detail}`.trimEnd());

const results = { ok: 0, FAIL: 0, skip: 0, todo: 0 };

const execute = async (id, action) => {
	mkdirSync(LOG_DIR, { recursive: true });
	const logPath = join(LOG_DIR, `${id.replace(':', '-')}.log`);
	const started = Date.now();
	const { ok, output, note } = await action();
	const duration = seconds(Date.now() - started);

	writeFileSync(logPath, output);
	results[ok ? 'ok' : 'FAIL']++;
	report(ok ? 'ok' : 'FAIL', id, [duration, note].filter(Boolean).join('  '));

	if (!ok) console.log(`${excerpt(output)}\nlog: ${logPath.replace(`${ROOT}/`, '')}`);

	if (!ok && process.env.GITHUB_ACTIONS) console.log(`::group::${id} full log\n${output}\n::endgroup::`);

	return ok;
};

const skip = (id, reason) => {
	results.skip++;
	report('skip', id, reason);
};

const CLAUDE_DIRECTORIES = ['.claude/agents', '.claude/rules'];

const frontmatterProblem = (file) => {
	const frontmatter = readFileSync(join(ROOT, file), 'utf8').match(/^---\n([\s\S]*?)\n---\n/);

	if (!frontmatter) return 'no frontmatter';

	try {
		const fields = parseYaml(frontmatter[1]);
		const name = file.split('/').at(-1).replace(/\.md$/, '');

		if (file.startsWith('.claude/agents/') && fields?.name !== name) return `name must be "${name}"`;

		if (file.startsWith('.claude/agents/') && !fields?.description) return 'no description';

		return undefined;
	} catch (error) {
		return error.message.split('\n')[0];
	}
};

const checkClaudeFiles = async () => {
	const problems = CLAUDE_DIRECTORIES.filter((directory) => existsSync(join(ROOT, directory)))
		.flatMap((directory) => readdirSync(join(ROOT, directory)).map((file) => `${directory}/${file}`))
		.filter((file) => file.endsWith('.md'))
		.map((file) => [file, frontmatterProblem(file)])
		.filter(([, problem]) => problem);

	return {
		ok: problems.length === 0,
		output: problems.map(([file, problem]) => `${file}: error ${problem}`).join('\n')
	};
};

const commandAction = (cmd) => async () => {
	const result = run(cmd);
	return { ok: result.status === 0, output: result.stdout };
};

const staticAction = {
	format: [['', (ctx) => checkFormat(ctx.files, ctx.base, ctx.options.fix)]],
	openspec: [
		['specs', commandAction(['npx', 'openspec', 'validate', '--specs'])],
		['changes', commandAction(['npx', 'openspec', 'validate', '--changes', '--strict'])]
	],
	openapi: [['', commandAction([...BACKEND, 'lint:api'])]],
	agents: [['', checkClaudeFiles]]
};

const staticReason = (ctx) => ({
	format: ctx.files.length > 0 ? `${ctx.files.length} changed files` : undefined,
	openspec: ctx.files.some((file) => file.startsWith('openspec/')) ? 'openspec/ changed' : undefined,
	openapi: ctx.files.some((file) => file.startsWith('meet-ce/backend/openapi/')) ? 'openapi/ changed' : undefined,
	agents: ctx.files.some((file) => CLAUDE_DIRECTORIES.some((directory) => file.startsWith(`${directory}/`)))
		? '.claude/ changed'
		: undefined
});

const STATIC_SKIP_REASON = {
	format: 'no changed files',
	openspec: 'no openspec/ changes',
	openapi: 'no openapi/ changes',
	agents: 'no .claude/agents or .claude/rules changes'
};

const planStatic = (ctx) => {
	const reasons = staticReason(ctx);

	return STATIC_CHECKS.filter((id) => !ctx.options.only || ctx.options.only.includes(id)).map((id) => ({
		id,
		reason: ctx.options.all && id !== 'format' ? 'all' : reasons[id],
		missing: STATIC_SKIP_REASON[id]
	}));
};

const planSuites = (ctx) =>
	SUITES.filter((id) => !ctx.options.only || ctx.options.only.includes(id)).map((id) => ({
		id,
		reason:
			ctx.options.only?.includes(id) || ctx.options.all
				? 'requested'
				: ctx.selected[id] === 'true'
					? 'diff'
					: undefined
	}));

const runSuite = async (suite, steps, typingsBuilt) => {
	const failed = new Set(typingsBuilt ? [] : ['typings']);

	for (const step of steps) {
		const id = `${suite}:${step.id}`;
		const blocker = ['typings', ...(step.after ?? [])].find((dependency) => failed.has(dependency));

		if (blocker) {
			failed.add(step.id);
			skip(id, `${blocker} failed`);
			continue;
		}

		if (!(await execute(id, commandAction(step.cmd)))) failed.add(step.id);
	}
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const base = resolveBase(options);
	const files = base ? changedFiles(base) : [];
	const selected = selectedSuites(files, options.all);
	const ctx = { options, base, files, selected };
	const unitSuites = planSuites(ctx).filter((suite) => suite.reason && UNIT_SUITES[suite.id]);
	const started = Date.now();

	if (options.list) {
		console.log(`base ${base?.slice(0, 12) ?? 'unknown'}, ${files.length} changed files`);

		for (const check of planStatic(ctx))
			console.log(`${check.reason ? 'run ' : 'skip'} ${check.id}  ${check.reason ?? check.missing}`);

		if (unitSuites.length > 0) console.log('run  typings  once, for the unit suites');

		for (const suite of planSuites(ctx)) {
			const steps = UNIT_SUITES[suite.id]?.map((step) => step.id).join(',') ?? 'not run here';
			console.log(
				`${suite.reason ? 'run ' : 'skip'} ${suite.id}  ${suite.reason ? `${suite.reason}: ${steps}` : 'not affected by the diff'}`
			);
		}

		return 0;
	}

	rmSync(LOG_DIR, { recursive: true, force: true });

	for (const check of planStatic(ctx)) {
		if (!check.reason) skip(check.id, check.missing);
		else
			for (const [step, action] of staticAction[check.id])
				await execute(step ? `${check.id}:${step}` : check.id, () => action(ctx));
	}

	const typingsBuilt = unitSuites.length === 0 || (await execute('typings', commandAction(TYPINGS)));

	for (const suite of planSuites(ctx)) {
		if (!suite.reason) skip(suite.id, 'not affected by the diff');
		else if (UNIT_SUITES[suite.id]) await runSuite(suite.id, UNIT_SUITES[suite.id], typingsBuilt);
		else {
			results.todo++;
			const storage =
				suite.id === 'backend-integration' && selected.storage === 'true'
					? ' (storage changed: also run recordings)'
					: '';
			report('todo', suite.id, `selected, not run here: ${NOT_RUN_HERE[suite.id]}${storage}`);
		}
	}

	const result = results.FAIL > 0 ? 'FAILED' : 'PASSED';
	console.log(
		`${results.ok} ok, ${results.FAIL} failed, ${results.skip} skipped, ${results.todo} not run here: ${paint(results.FAIL > 0 ? 31 : 32, result)} in ${seconds(Date.now() - started)}`
	);

	return results.FAIL > 0 ? 1 : 0;
};

process.exitCode = await main();
