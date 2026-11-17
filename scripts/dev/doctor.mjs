#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { Resolver } from 'node:dns/promises';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { findProDependencyDrift } from './pro-deps.mjs';
import {
	deploymentDir,
	DEFAULTS,
	listBackends,
	livekitConfigPath,
	portListener,
	probePort,
	processCwd,
	repoRoot,
	run,
	runningContainers,
	STACK_WEBHOOK_PORTS,
	TESTAPP_DEFAULT_PORTS,
	webhookPorts
} from './local-env.mjs';

// One line per check: `ok`, `warn` or `FAIL`, the check name and a detail; a `fix:` line follows a warn or FAIL.
// Read-only. Exit code 1 only when a check FAILs. `--json` prints the results as JSON instead.

const ok = (name, detail) => ({ status: 'ok', name, detail });
const warn = (name, detail, fix) => ({ status: 'warn', name, detail, fix });
const fail = (name, detail, fix) => ({ status: 'FAIL', name, detail, fix });

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const pathOf = (...parts) => join(repoRoot, ...parts);
const major = (version) => version.replace(/^[^\d]*/, '').split('.')[0];
const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory();

const IGNORED_DIRECTORIES = new Set(['node_modules', '.angular', 'dist', '.git']);

const newestMtime = (directory, include = () => true) => {
	let newest = 0;
	const pending = [directory];

	while (pending.length > 0) {
		for (const entry of readdirSync(pending.pop(), { withFileTypes: true })) {
			const path = join(entry.parentPath, entry.name);

			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(path);
			} else if (include(entry.name)) {
				newest = Math.max(newest, statSync(path).mtimeMs);
			}
		}
	}

	return newest;
};

const ceWorkspacePackages = () =>
	[...read(pathOf('pnpm-workspace.yaml')).matchAll(/^ {2}- (\S+)$/gm)]
		.map(([, path]) => path)
		.filter((path) => !path.startsWith('meet-pro/') && existsSync(pathOf(path, 'package.json')));

const installedPackage = (fromDirectory, name) => {
	for (let directory = fromDirectory; directory.startsWith(repoRoot); directory = join(directory, '..')) {
		const manifest = join(directory, 'node_modules', name, 'package.json');

		if (existsSync(manifest)) return { manifest, version: readJson(manifest).version };
	}

	return undefined;
};

const checkToolVersions = () => {
	const nodePin = read(pathOf('meet-ce/docker/Dockerfile')).match(/node:(\d+\.\d+\.\d+)/)?.[1];
	const pnpmPin = readJson(pathOf('package.json')).packageManager?.match(/pnpm@(\S+)/)?.[1];
	const nodeVersion = process.versions.node;
	const pnpmVersion = run('pnpm', ['--version'])?.trim();
	const results = [];

	if (nodePin && major(nodePin) !== major(nodeVersion)) {
		results.push(fail('node', `v${nodeVersion}, CI and the Docker image use ${nodePin}`, `nvm install ${nodePin}`));
	} else {
		results.push(ok('node', `v${nodeVersion} (pin ${nodePin})`));
	}

	if (!pnpmVersion) {
		results.push(
			fail(
				'pnpm',
				`not found, pinned ${pnpmPin}`,
				`corepack enable && corepack prepare pnpm@${pnpmPin} --activate`
			)
		);
	} else if (pnpmVersion !== pnpmPin) {
		const fixNote = `corepack prepare pnpm@${pnpmPin} --activate`;

		results.push(
			(major(pnpmVersion) !== major(pnpmPin) ? fail : warn)('pnpm', `${pnpmVersion}, pinned ${pnpmPin}`, fixNote)
		);
	} else {
		results.push(ok('pnpm', `${pnpmVersion}`));
	}

	return results;
};

const checkInstalledDependencies = () => {
	const overridden = new Set(
		[...read(pathOf('pnpm-workspace.yaml')).matchAll(/^ {2}'?([^\s':]+(?:>[^\s':]+)?)'?:/gm)].map(
			([, name]) => name
		)
	);
	const problems = [];
	let checked = 0;

	for (const path of ['.', ...ceWorkspacePackages()]) {
		const manifest = readJson(pathOf(path, 'package.json'));
		const declared = Object.entries({ ...manifest.devDependencies, ...manifest.dependencies }).filter(
			([name, version]) => /^\d+\.\d+\.\d+/.test(version) && !overridden.has(name)
		);

		for (const [name, version] of declared) {
			const installed = installedPackage(pathOf(path), name);

			checked++;

			if (!installed) {
				problems.push(`${path}: ${name} not installed (want ${version})`);
			} else if (installed.version !== version) {
				problems.push(`${path}: ${name} ${installed.version} (want ${version})`);
			}
		}
	}

	const foreignTypings = ceWorkspacePackages()
		.map((path) => installedPackage(pathOf(path), '@openvidu-meet/typings'))
		.filter((typings) => typings && !realpathSync(typings.manifest).startsWith(realpathSync(repoRoot) + '/'))
		.map((typings) => realpathSync(typings.manifest));

	if (foreignTypings.length > 0) {
		return fail(
			'typings-link',
			`@openvidu-meet/typings resolves outside this checkout: ${foreignTypings[0]}`,
			'rebuild the dependency farm: replace the symlinked node_modules with real directories of symlinks, keep @openvidu-meet as a copy, then ./meet.sh build-typings'
		);
	}

	if (problems.length > 0) {
		const shown = problems.slice(0, 3).join('; ');
		const more = problems.length > 3 ? ` (+${problems.length - 3} more)` : '';

		return fail('dependencies', `${problems.length} mismatch(es): ${shown}${more}`, './meet.sh install');
	}

	return ok('dependencies', `${checked} pinned dependencies resolve to the declared versions`);
};

const checkProDrift = () => {
	if (!isDirectory(pathOf('meet-pro'))) return ok('pro-drift', 'no meet-pro checkout');

	const drift = findProDependencyDrift(repoRoot);

	if (drift.length === 0) return ok('pro-drift', 'meet-pro matches the meet-ce versions');

	const sameMajor = drift.filter((entry) => entry.fixable && !entry.crossesMajor);
	const example = (entries) =>
		entries
			.slice(0, 3)
			.map((entry) => `${entry.name} ${entry.pro} vs ${entry.ce}`)
			.join(', ');

	if (sameMajor.length > 0) {
		return fail(
			'pro-drift',
			`${sameMajor.length} shared dependency version(s) differ inside a major: ${example(sameMajor)}`,
			'node scripts/dev/pro-deps.mjs --fix'
		);
	}

	return warn(
		'pro-drift',
		`${drift.length} shared dependency version(s) differ across a major: ${example(drift)}`,
		'upgrade meet-pro by hand, then node scripts/dev/pro-deps.mjs'
	);
};

const checkLockfile = () => {
	const changed = (run('git', ['diff', '--name-only', 'HEAD'], { cwd: repoRoot }) ?? '').split('\n').filter(Boolean);
	const manifests = new Set([
		'package.json',
		'pnpm-workspace.yaml',
		...ceWorkspacePackages().map((path) => `${path}/package.json`)
	]);

	if (changed.includes('pnpm-lock.yaml') && !changed.some((file) => manifests.has(file))) {
		return warn(
			'lockfile',
			'pnpm-lock.yaml differs from HEAD and no CE manifest changed (a meet-pro install leaked into it)',
			'git restore pnpm-lock.yaml'
		);
	}

	return ok('lockfile', changed.includes('pnpm-lock.yaml') ? 'changed together with a manifest' : 'unchanged');
};

const checkShallow = () =>
	run('git', ['rev-parse', '--is-shallow-repository'], { cwd: repoRoot })?.trim() === 'true'
		? fail(
				'shallow',
				'the repository is shallow, so log, blame and merge-base stop early',
				'git fetch --unshallow origin'
			)
		: ok('shallow', 'full history');

const checkTypings = () => {
	const dist = pathOf('meet-ce/typings/dist');

	if (!isDirectory(dist)) return fail('typings-dist', 'meet-ce/typings/dist is missing', './meet.sh build-typings');

	const src = newestMtime(pathOf('meet-ce/typings/src'));
	const built = newestMtime(dist, (name) => name !== 'typings-ready.flag');

	return src > built
		? warn('typings-dist', 'dist is older than meet-ce/typings/src', './meet.sh build-typings')
		: ok('typings-dist', 'up to date');
};

const missingChunks = (frontendDirectory) =>
	[...new Set(read(join(frontendDirectory, 'index.html')).match(/[\w-]+\.(?:js|css)(?=["'])/g) ?? [])].filter(
		(file) => !existsSync(join(frontendDirectory, file))
	);

const checkBuiltBundle = (name, directory, sources, fix) => {
	const output = pathOf('meet-ce/backend/public', directory);

	if (!isDirectory(output)) return warn(name, `meet-ce/backend/public/${directory} is missing`, fix);

	if (directory === 'frontend' && missingChunks(output).length > 0) {
		return fail(name, `index.html references ${missingChunks(output).length} missing chunks (broken bundle)`, fix);
	}

	const built = newestMtime(output);
	const stale = sources.some(({ path, include }) => newestMtime(pathOf(path), include) > built);

	return stale
		? warn(name, `meet-ce/backend/public/${directory} is older than its sources`, fix)
		: ok(name, 'up to date');
};

const notSpec = (name) => !name.endsWith('.spec.ts');

const checkFrontendBundle = () =>
	checkBuiltBundle(
		'frontend-bundle',
		'frontend',
		[
			{ path: 'meet-ce/frontend/src', include: notSpec },
			{ path: 'meet-ce/frontend/projects/shared-meet-components', include: notSpec }
		],
		'./meet.sh build --skip-install'
	);

const checkWebcomponentBundle = () =>
	checkBuiltBundle(
		'wc-bundle',
		'webcomponent',
		[
			{ path: 'meet-ce/frontend/webcomponent/src', include: notSpec },
			{ path: 'meet-ce/frontend/projects/shared-meet-components', include: notSpec }
		],
		'./meet.sh build-webcomponent'
	);

const CONTAINERS = [
	{ name: 'mongo', required: true, breaks: 'the backend does not boot' },
	{ name: 'redis', required: true, breaks: 'the backend does not boot' },
	{ name: 'minio', required: true, breaks: 'the backend does not boot (S3 storage)' },
	{ name: 'openvidu', required: true, breaks: 'LiveKit: no meetings, no webhooks' },
	{ name: 'caddy-proxy', breaks: 'browser e2e (publishes LiveKit on 7880 and 7443)' },
	{ name: 'egress', breaks: 'recordings and broadcasts' },
	{ name: 'ingress', breaks: 'broadcast sinks' }
];

const START_OPENVIDU =
	'start-openvidu  (cd ~/CODEURJC/openvidu-local-deployment/community && ./configure_lan_private_ip_linux.sh && docker compose up)';

const checkContainers = (running) => {
	if (!running)
		return [fail('docker', 'docker is not reachable', 'start the Docker daemon, then run start-openvidu')];

	const missing = CONTAINERS.filter(({ name }) => !running.has(name));
	const results = [];

	if (missing.length === 0) {
		results.push(ok('docker', `${CONTAINERS.map(({ name }) => name).join(' ')} running`));
	} else {
		const detail = missing.map(({ name, breaks }) => `${name} down (${breaks})`).join('; ');

		results.push((missing.some(({ required }) => required) ? fail : warn)('docker', detail, START_OPENVIDU));
	}

	if (running.has('openvidu-meet')) {
		results.push(
			warn(
				'meet-container',
				'the openvidu-meet container is running: it competes for LiveKit webhooks and crash-loops after a newer schema',
				'docker stop openvidu-meet'
			)
		);
	}

	return results;
};

const hostAddresses = () =>
	Object.entries(networkInterfaces())
		.filter(([name]) => !/^(docker|br-|veth|virbr|lo$)/.test(name))
		.flatMap(([, addresses]) => addresses)
		.filter((address) => address.family === 'IPv4' && !address.internal)
		.map((address) => address.address);

const livekitAdvertisedIp = (running) => {
	if (!running?.has('openvidu')) return undefined;

	const environment =
		run('docker', ['inspect', 'openvidu', '--format', '{{range .Config.Env}}{{println .}}{{end}}']) ?? '';

	return environment.match(/^LAN_PRIVATE_IP=(\S+)$/m)?.[1];
};

const checkLanIp = (running) => {
	const pinned = read(join(deploymentDir(), '.env')).match(/^LAN_PRIVATE_IP=(\S+)$/m)?.[1];
	const advertised = livekitAdvertisedIp(running);
	const addresses = hostAddresses();
	const host = addresses.join(', ') || 'none';

	if (advertised && !addresses.includes(advertised)) {
		return fail(
			'lan-ip',
			`LiveKit advertises ${advertised}, the host has ${host}: media never connects and recordings abort`,
			START_OPENVIDU
		);
	}

	if (pinned && !addresses.includes(pinned)) {
		return warn(
			'lan-ip',
			`the deployment .env pins ${pinned}, the host has ${host}: the next compose up reverts LiveKit`,
			START_OPENVIDU
		);
	}

	return ok('lan-ip', `${advertised ?? pinned ?? 'no LAN IP pinned'} (host ${host})`);
};

const checkLocalDevDomain = async (running) => {
	const ip = livekitAdvertisedIp(running) ?? hostAddresses()[0];
	const names = ['certs.openvidu-local.dev', ...(ip ? [`${ip.replaceAll('.', '-')}.openvidu-local.dev`] : [])];
	const resolver = new Resolver({ timeout: 1500, tries: 1 });
	const failed = (
		await Promise.all(
			names.map((name) =>
				resolver.resolve4(name).then(
					() => undefined,
					() => name
				)
			)
		)
	).filter(Boolean);

	return failed.length === 0
		? ok('local-dev-dns', 'openvidu-local.dev resolves')
		: fail(
				'local-dev-dns',
				`${failed.join(', ')} do not resolve: browsers cannot reach LiveKit, every meeting join fails while the API answers`,
				'dig +trace openvidu-local.dev; docker logs caddy-proxy (look for external certificate manager errors)'
			);
};

const SERVICE_PORTS = { LiveKit: 7880, Mongo: 27017, Redis: 6379, MinIO: 9000 };

const checkServicePorts = async () => {
	const answers = await Promise.all(
		Object.entries(SERVICE_PORTS).map(async ([name, port]) => [name, port, await probePort(port)])
	);
	const down = answers.filter(([, , answered]) => !answered);

	return down.length === 0
		? ok('ports', answers.map(([name, port]) => `${name} ${port}`).join(', '))
		: fail('ports', `${down.map(([name, port]) => `${name} ${port}`).join(', ')} not answering`, START_OPENVIDU);
};

const describeBackend = (backend) =>
	`${backend.checkout === repoRoot ? 'this checkout' : backend.checkout} pid ${backend.pid}, mongo ${backend.mongoDb}, redis db ${backend.redisDb}`;

const sharedResources = (backends) =>
	backends.flatMap((backend, index) =>
		backends
			.slice(index + 1)
			.flatMap((other) => [
				backend.mongoDb === other.mongoDb && `mongo ${backend.mongoDb} (:${backend.port} and :${other.port})`,
				backend.redisDb === other.redisDb && `redis db ${backend.redisDb} (:${backend.port} and :${other.port})`
			])
			.filter(Boolean)
	);

const checkBackends = async () => {
	const backends = listBackends();
	const primary = backends.find(({ port }) => port === DEFAULTS.port);
	const results = [];

	if (primary) {
		results.push(ok('port-6080', describeBackend(primary)));
	} else if (await probePort(DEFAULTS.port)) {
		results.push(
			warn(
				'port-6080',
				'answers but is not a Meet backend process of this user',
				'find the owner with: ss -ltnp | grep :6080'
			)
		);
	} else {
		results.push(
			warn(
				'port-6080',
				'no backend: LiveKit webhooks go nowhere and meetings never become active in integration suites',
				'./meet.sh dev  (or: node scripts/dev/stack.mjs up <name> --primary)'
			)
		);
	}

	for (const backend of backends.filter((entry) => entry !== primary)) {
		results.push(ok(`backend-${backend.port}`, describeBackend(backend)));
	}

	const shared = sharedResources(backends);

	if (shared.length > 0) {
		results.push(
			warn(
				'shared-data',
				`running backends share ${shared.join('; ')}`,
				'stop one of them or give it its own stack: node scripts/dev/stack.mjs up <name>'
			)
		);
	}

	return results;
};

const checkTestappPorts = () => {
	const ownTestapp = pathOf('testapp');
	const holders = TESTAPP_DEFAULT_PORTS.flatMap((port) => {
		const listener = portListener(port);

		return listener ? [{ port, pid: listener.pid, cwd: listener.pid && processCwd(listener.pid) }] : [];
	});
	const describe = ({ port, pid, cwd }) =>
		pid
			? `:${port} ${cwd === ownTestapp ? 'this checkout' : `from ${cwd}`} pid ${pid}`
			: `:${port} held by a process of another user`;
	const foreign = holders.filter(({ cwd }) => cwd !== ownTestapp);

	if (holders.length === 0) return ok('testapp', `:${TESTAPP_DEFAULT_PORTS.join(' and :')} free`);

	if (foreign.length === 0) return ok('testapp', holders.map(describe).join(', '));

	return warn(
		'testapp',
		`${holders.map(describe).join(', ')}: a webcomponent e2e run on the default ports tests that testapp, not this checkout`,
		`./meet.sh stack up <name> --testapp (its own ports), or stop that process if it is yours: kill ${foreign.map(({ pid }) => pid ?? '?').join(' ')}`
	);
};

const checkWebhooks = (running) => {
	const ports = webhookPorts();
	const missing = STACK_WEBHOOK_PORTS.filter((port) => !ports.includes(port));
	const posts = `LiveKit posts to :${ports.join(', :') || 'no local port'}`;
	const startedAt = running?.has('openvidu')
		? Date.parse(run('docker', ['inspect', '-f', '{{.State.StartedAt}}', 'openvidu']) ?? '')
		: NaN;

	if (missing.length > 0) {
		return warn(
			'webhooks',
			`${posts}: a stack on :${missing[0]} to :${missing.at(-1)} gets none, so meetings never start there`,
			`add "- http://host.docker.internal:<port>/livekit/webhook" for ports ${STACK_WEBHOOK_PORTS[0]} to ${STACK_WEBHOOK_PORTS.at(-1)} under webhook.urls in ${livekitConfigPath()}, then ${START_OPENVIDU}`
		);
	}

	if (startedAt < statSync(livekitConfigPath()).mtimeMs) {
		return warn('webhooks', `${posts} once LiveKit restarts: it runs with an older livekit.yaml`, START_OPENVIDU);
	}

	return ok('webhooks', posts);
};

const main = async () => {
	const running = runningContainers();
	const sections = await Promise.all([
		checkToolVersions(),
		checkInstalledDependencies(),
		checkProDrift(),
		checkLockfile(),
		checkShallow(),
		checkTypings(),
		checkFrontendBundle(),
		checkWebcomponentBundle(),
		checkContainers(running),
		checkLanIp(running),
		checkLocalDevDomain(running),
		checkServicePorts(),
		checkWebhooks(running),
		checkBackends(),
		checkTestappPorts()
	]);
	const results = sections.flat();

	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(results, null, 2));
	} else {
		for (const { status, name, detail, fix } of results) {
			console.log(`${status.padEnd(4)} ${name.padEnd(15)} ${detail}`);

			if (fix) console.log(`     fix: ${fix}`);
		}
	}

	process.exit(results.some(({ status }) => status === 'FAIL') ? 1 : 0);
};

await main();
