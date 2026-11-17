#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
	DEFAULTS,
	listBackends,
	probePort,
	processCommandLine,
	processEnvironment,
	repoRoot,
	STACK_FIRST_PORT,
	TESTAPP_DEFAULT_PORTS,
	webhookPorts
} from './local-env.mjs';

// A named, isolated set of backend resources (HTTP port, Mongo database, Redis DB, S3 subbucket) on the shared
// Docker stack, recorded in a registry shared by every checkout so no session reuses or deletes another's data.
//   up <name> [--primary] [--testapp]  start this checkout's backend on the stack (--primary takes :6080 when it is
//                                      free; --testapp also starts the testapp and its webhook bridge on ports of
//                                      their own and points the stack's Meet webhook at them)
//   run <name> -- <command>            run a command (jest, playwright) with the stack environment; a suite where a
//                                      meeting starts needs `up` first, because only a listening backend receives
//                                      LiveKit's webhooks
//   env <name>                         print the stack environment as KEY=value lines
//   list                               registered stacks and the running backends no stack owns
//   down <name>                        stop the stack's processes and delete its data and registry entry

const REGISTRY = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'openvidu-meet/stacks');
const API_KEY = 'meet-api-key';
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;
const TESTAPP_FIRST_PORT = 5090;
const LOCAL = {
	mongoUri: 'mongodb://mongoadmin:mongoadmin@localhost:27017/?directConnection=true',
	redis: { host: 'localhost', port: 6379, password: 'redispassword', lazyConnect: true },
	s3: {
		endpoint: 'http://localhost:9000',
		region: 'us-east-1',
		forcePathStyle: true,
		credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' }
	},
	bucket: 'openvidu-appdata'
};

class StackError extends Error {}

const binary = (name) => {
	const path = join(repoRoot, 'node_modules/.bin', name);

	if (!existsSync(path)) throw new StackError(`${path} not found: run ./meet.sh install`);

	return path;
};

const SERVICES = [
	{
		name: 'backend',
		pidKey: 'pid',
		portKey: 'port',
		logSuffix: '',
		cwd: 'meet-ce/backend',
		command: () => binary('tsx'),
		args: () => ['./src/server.ts'],
		env: { NODE_ENV: 'ci' },
		readyPath: '/meet/api/v1/rooms?maxItems=1'
	},
	{
		name: 'bridge',
		pidKey: 'bridgePid',
		portKey: 'bridgePort',
		logSuffix: '.bridge',
		cwd: 'testapp',
		command: () => process.execPath,
		args: () => ['scripts/webhook-bridge.js'],
		env: {},
		readyPath: '/webhook/health'
	},
	{
		name: 'testapp',
		pidKey: 'testappPid',
		portKey: 'testappPort',
		logSuffix: '.testapp',
		cwd: 'testapp',
		command: () => binary('ng'),
		args: (entry) => ['serve', '--port', String(entry.testappPort), '--no-prebundle'],
		env: { NG_CLI_ANALYTICS: 'false' },
		readyPath: '/webhook/health'
	}
];

const [BACKEND, , TESTAPP] = SERVICES;

const servicesOf = (entry) => SERVICES.filter(({ portKey }) => entry[portKey]);

const entryPath = (name) => join(REGISTRY, `${name}.json`);
const logPath = (name, { logSuffix }) => join(REGISTRY, `${name}${logSuffix}.log`);
const readEntry = (name) =>
	existsSync(entryPath(name)) ? JSON.parse(readFileSync(entryPath(name), 'utf8')) : undefined;
const writeEntry = (entry, flag = 'w') =>
	writeFileSync(entryPath(entry.name), JSON.stringify(entry, null, '\t') + '\n', { flag });

const readEntries = () =>
	existsSync(REGISTRY)
		? readdirSync(REGISTRY)
				.filter((file) => file.endsWith('.json'))
				.map((file) => JSON.parse(readFileSync(join(REGISTRY, file), 'utf8')))
		: [];

const withRegistryLock = async (action) => {
	const lock = join(REGISTRY, '.lock');
	const giveUpAt = Date.now() + 15000;

	mkdirSync(REGISTRY, { recursive: true });

	for (;;) {
		try {
			writeFileSync(lock, String(process.pid), { flag: 'wx' });
			break;
		} catch (error) {
			if (error.code !== 'EEXIST') throw error;

			if (Date.now() - statSync(lock).mtimeMs > 30000) {
				rmSync(lock, { force: true });
			} else if (Date.now() > giveUpAt) {
				throw new StackError(`registry lock ${lock} is held by another session`);
			} else {
				await sleep(50);
			}
		}
	}

	try {
		return await action();
	} finally {
		rmSync(lock, { force: true });
	}
};

const withRedis = async (action) => {
	const { default: Redis } = await import('ioredis');
	const redis = new Redis(LOCAL.redis);

	redis.on('error', () => {});

	try {
		await redis.connect();

		return await action(redis);
	} catch (error) {
		throw error instanceof StackError
			? error
			: new StackError(`Redis is not usable on localhost:6379: ${error.message}`);
	} finally {
		redis.disconnect();
	}
};

const withMongo = async (action) => {
	const { MongoClient } = await import('mongodb');
	const client = new MongoClient(LOCAL.mongoUri, { serverSelectionTimeoutMS: 5000 });

	try {
		return await action(client);
	} catch (error) {
		throw error instanceof StackError
			? error
			: new StackError(`MongoDB is not usable on localhost:27017: ${error.message}`);
	} finally {
		await client.close();
	}
};

const withS3 = async (action) => {
	const { S3Client } = await import('@aws-sdk/client-s3');
	const client = new S3Client(LOCAL.s3);

	try {
		return await action(client);
	} catch (error) {
		throw error instanceof StackError
			? error
			: new StackError(`MinIO is not usable on localhost:9000: ${error.message}`);
	} finally {
		client.destroy();
	}
};

const usedDatabases = (redis) =>
	redis.info('keyspace').then((info) => new Set([...info.matchAll(/^db(\d+):/gm)].map(([, index]) => index)));

const freeRedisDb = async (taken) =>
	withRedis(async (redis) => {
		const configured = await redis.config('GET', 'databases').catch(() => undefined);
		const databases = Number(configured?.[1] ?? 16);
		const used = await usedDatabases(redis);
		const free = Array.from({ length: databases - 1 }, (_, index) => String(index + 1)).find(
			(db) => !taken.has(db) && !used.has(db)
		);

		if (!free) {
			throw new StackError(
				`no free Redis DB among 1 to ${databases - 1}: each is registered, used by a running backend or not empty. Run 'stack list' and 'stack down' a stack you own`
			);
		}

		return free;
	});

const freePort = async (taken, first) => {
	for (let port = first; ; port++) {
		if (!taken.has(port) && !(await probePort(port))) return port;
	}
};

const primaryPort = async (taken) => {
	if (taken.has(Number(DEFAULTS.port)) || (await probePort(DEFAULTS.port))) {
		throw new StackError(`--primary: port ${DEFAULTS.port} is not free`);
	}

	return Number(DEFAULTS.port);
};

const assertUnusedData = async (entry) => {
	const databases = await withMongo((client) => client.db().admin().listDatabases({ nameOnly: true }));

	if (databases.databases.some(({ name }) => name === entry.mongoDb)) {
		throw new StackError(`Mongo database ${entry.mongoDb} already exists and no stack owns it: pick another name`);
	}

	const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
	const listing = await withS3((s3) =>
		s3.send(new ListObjectsV2Command({ Bucket: LOCAL.bucket, Prefix: `${entry.s3Subbucket}/`, MaxKeys: 1 }))
	);

	if (listing.KeyCount > 0) {
		throw new StackError(
			`S3 prefix ${entry.s3Subbucket}/ already holds objects and no stack owns it: pick another name`
		);
	}
};

const createEntry = async (name, entries, primary) => {
	const takenPorts = new Set([...entries.map(({ port }) => port), ...listBackends().map(({ port }) => Number(port))]);
	const takenRedisDbs = new Set([
		DEFAULTS.redisDb,
		...entries.map(({ redisDb }) => redisDb),
		...listBackends().map(({ redisDb }) => redisDb)
	]);
	const entry = {
		name,
		port: primary ? await primaryPort(takenPorts) : await freePort(takenPorts, STACK_FIRST_PORT),
		mongoDb: `${DEFAULTS.mongoDb}-${name}`,
		redisDb: await freeRedisDb(takenRedisDbs),
		s3Subbucket: `${DEFAULTS.s3Subbucket}-${name}`,
		pid: null,
		checkout: null,
		createdAt: new Date().toISOString()
	};

	await assertUnusedData(entry);
	writeEntry(entry, 'wx');

	return entry;
};

const addTestappPorts = async (entry, entries) => {
	const taken = new Set([
		...TESTAPP_DEFAULT_PORTS,
		...entries.flatMap(({ testappPort, bridgePort }) => [testappPort, bridgePort])
	]);
	const testappPort = await freePort(taken, TESTAPP_FIRST_PORT);
	const withPorts = { ...entry, testappPort, bridgePort: await freePort(taken.add(testappPort), testappPort + 1) };

	writeEntry(withPorts);

	return withPorts;
};

const allocate = (name, { primary = false, testapp = false } = {}) =>
	withRegistryLock(async () => {
		const entries = readEntries();
		const existing = readEntry(name);

		if (existing && primary && existing.port !== Number(DEFAULTS.port)) {
			throw new StackError(
				`stack ${name} already holds port ${existing.port}: 'stack down ${name}' first to take ${DEFAULTS.port}`
			);
		}

		const entry = existing ?? (await createEntry(name, entries, primary));

		return testapp && !entry.testappPort ? addTestappPorts(entry, entries) : entry;
	});

const testappEnv = ({ testappPort, bridgePort }) =>
	testappPort
		? {
				MEET_TESTAPP_URL: `http://localhost:${testappPort}`,
				MEET_WEBHOOK_BRIDGE_URL: `http://localhost:${bridgePort}`,
				TESTAPP_WEBHOOK_BRIDGE_PORT: String(bridgePort)
			}
		: {};

const stackEnv = (entry) => ({
	SERVER_PORT: String(entry.port),
	MEET_MONGO_DB_NAME: entry.mongoDb,
	MEET_REDIS_DB: entry.redisDb,
	MEET_S3_SUBBUCKET: entry.s3Subbucket,
	MEET_NAME_ID: `openviduMeet-${entry.name}`,
	E2E_BASE_URL: `http://localhost:${entry.port}/meet`,
	E2E_API_KEY: API_KEY,
	MEET_API_URL: `http://localhost:${entry.port}/meet`,
	MEET_API_KEY: API_KEY,
	MEET_WEBCOMPONENT_SRC: `http://localhost:${entry.port}/meet/v1/openvidu-meet.js`,
	...testappEnv(entry)
});

const formatEnv = (entry) => Object.entries(stackEnv(entry)).map(([key, value]) => `${key}=${value}`);

const callerEnv = () =>
	Object.fromEntries(
		Object.entries(process.env).filter(([key]) => !key.startsWith('MEET_') && key !== 'SERVER_PORT')
	);

const webhookLine = (entry) =>
	webhookPorts().includes(entry.port)
		? `webhooks: LiveKit posts its webhooks to this stack (:${entry.port})`
		: `webhooks: this stack does NOT receive LiveKit webhooks (livekit.yaml lists :${webhookPorts().join(', :') || 'none'}), so meetings never start here and scenario, recording and webhook suites cannot pass: see the webhooks line of ./meet.sh doctor`;

const isRunning = (entry, service) => {
	const pid = entry[service.pidKey];
	const environment = pid ? processEnvironment(pid) : undefined;
	const args = service.args(entry).join(' ');

	return environment?.MEET_MONGO_DB_NAME === entry.mongoDb && processCommandLine(pid)?.includes(args) === true;
};

const waitUntilStopped = async (pid, timeoutMs) => {
	for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(100)) {
		if (!existsSync(`/proc/${pid}`)) return true;
	}

	return false;
};

const stop = async (entry, service) => {
	const pid = entry[service.pidKey];

	if (!pid) return `no ${service.name} recorded`;

	if (!isRunning(entry, service)) return `pid ${pid} is not this stack's ${service.name} (not touched)`;

	process.kill(-pid, 'SIGTERM');

	if (!(await waitUntilStopped(pid, 10000))) {
		process.kill(-pid, 'SIGKILL');
		await waitUntilStopped(pid, 5000);
	}

	return `stopped ${service.name} pid ${pid}`;
};

const start = (entry, service) => {
	const command = service.command();
	const log = openSync(logPath(entry.name, service), 'w');
	const child = spawn(command, service.args(entry), {
		cwd: join(repoRoot, service.cwd),
		env: { ...callerEnv(), ...stackEnv(entry), ...service.env },
		detached: true,
		stdio: ['ignore', log, log]
	});

	closeSync(log);
	child.unref();

	return child.pid;
};

const lastLogLines = (path) => readFileSync(path, 'utf8').trim().split('\n').slice(-15).join('\n');

const waitUntilAnswering = async (entry, service) => {
	const url = `http://localhost:${entry[service.portKey]}${service.readyPath}`;
	const log = logPath(entry.name, service);

	for (const deadline = Date.now() + 120000; Date.now() < deadline; await sleep(500)) {
		if (!existsSync(`/proc/${entry[service.pidKey]}`)) {
			throw new StackError(`the ${service.name} exited while starting, log ${log}:\n${lastLogLines(log)}`);
		}

		const answered = await fetch(url, {
			headers: { 'x-api-key': API_KEY },
			signal: AbortSignal.timeout(2000)
		}).then(
			(response) => response.ok,
			() => false
		);

		if (answered) return;
	}

	throw new StackError(`the ${service.name} did not answer on ${url} within 120 s, log ${log}`);
};

const callApi = async (entry, method, path, body) => {
	const response = await fetch(`http://localhost:${entry.port}/meet/api/v1${path}`, {
		method,
		headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
		body: body && JSON.stringify(body)
	});

	if (!response.ok) {
		throw new StackError(`${method} ${path} on the stack backend answered ${response.status}`);
	}

	return response.json();
};

const pointWebhookAtTestapp = async (entry) => {
	const url = `http://localhost:${entry.testappPort}/webhook`;
	const { webhooks } = await callApi(entry, 'GET', '/webhooks');
	const defaultUrl = `http://localhost:${TESTAPP_DEFAULT_PORTS[0]}/webhook`;

	for (const { webhookId } of webhooks.filter((webhook) => webhook.url === defaultUrl)) {
		await callApi(entry, 'DELETE', `/webhooks/${webhookId}`);
	}

	if (!webhooks.some((webhook) => webhook.url === url)) {
		await callApi(entry, 'POST', '/webhooks', { url, enabled: true });
	}

	return url;
};

const up = async (name, flags) => {
	const testapp = flags.includes('--testapp');
	let entry = await allocate(name, { primary: flags.includes('--primary'), testapp });
	const wanted = servicesOf(entry).filter((service) => testapp || service === BACKEND);
	const stopped = wanted.filter((service) => !isRunning(entry, service));

	if (stopped.length === 0) {
		throw new StackError(
			`stack ${name} is already running (${wanted.map((service) => `${service.name} pid ${entry[service.pidKey]}`).join(', ')}, http://localhost:${entry.port}/meet)`
		);
	}

	for (const service of stopped) {
		if (await probePort(entry[service.portKey])) {
			throw new StackError(`port ${entry[service.portKey]} (${service.name}) is already in use`);
		}
	}

	for (const service of stopped) {
		entry = { ...entry, [service.pidKey]: start(entry, service) };
	}

	entry = { ...entry, checkout: repoRoot, startedAt: new Date().toISOString() };
	writeEntry(entry);

	for (const service of stopped) {
		await waitUntilAnswering(entry, service);
	}

	const meetWebhook = testapp && (await pointWebhookAtTestapp(entry));

	console.log(formatEnv(entry).join('\n'));
	console.log(`URL=http://localhost:${entry.port}/meet`);

	for (const service of wanted) {
		console.log(`${service === BACKEND ? '' : `${service.name.toUpperCase()}_`}LOG=${logPath(name, service)}`);
	}

	console.log(webhookLine(entry));

	if (meetWebhook) console.log(`meet webhooks: this stack posts them to ${meetWebhook}`);
};

const describeServices = (entry) =>
	servicesOf(entry)
		.map(
			(service) =>
				`${service.name} ${isRunning(entry, service) ? 'running' : 'stopped'} :${entry[service.portKey]}`
		)
		.join(', ');

const runCommand = async (name, command) => {
	if (command.length === 0) throw new StackError('usage: stack run <name> -- <command...>');

	const entry = await allocate(name);
	const backendRunning = isRunning(entry, BACKEND);

	console.error(
		`stack ${name}: ${describeServices(entry)}, mongo ${entry.mongoDb}, redis db ${entry.redisDb}, s3 ${entry.s3Subbucket}/${backendRunning ? '' : ` ('stack up ${name}' first when a meeting has to start: the backend receives the LiveKit webhooks)`}`
	);

	// The backend webhook integration tests empty the webhook registry, which is database state.
	if (backendRunning && isRunning(entry, TESTAPP)) await pointWebhookAtTestapp(entry);

	const child = spawn(command[0], command.slice(1), {
		env: { ...callerEnv(), ...stackEnv(entry) },
		stdio: 'inherit'
	});

	return new Promise((resolveCode) => {
		child.on('error', (error) => {
			console.error(`stack: cannot run ${command[0]}: ${error.message}`);
			resolveCode(127);
		});
		child.on('exit', (code, signal) => resolveCode(code ?? 128 + (signal === 'SIGINT' ? 2 : 15)));
	});
};

const list = () => {
	const entries = readEntries();
	const backends = listBackends();
	const owned = (backend) =>
		entries.some((entry) => entry.mongoDb === backend.mongoDb && String(entry.port) === backend.port);
	const lines = entries.map(
		(entry) =>
			`${entry.name}  ${describeServices(entry)}  mongo ${entry.mongoDb}  redis ${entry.redisDb}  s3 ${entry.s3Subbucket}/  ${entry.checkout ?? '-'}`
	);

	for (const backend of backends.filter((entry) => !owned(entry))) {
		lines.push(
			`unmanaged  backend running :${backend.port}  mongo ${backend.mongoDb}  redis ${backend.redisDb}  s3 ${backend.s3Subbucket}/  ${backend.checkout} pid ${backend.pid}`
		);
	}

	console.log(lines.length > 0 ? lines.join('\n') : 'no stacks and no running backends');
};

const assertDownIsSafe = (entry, { ownBackendStopped }) => {
	const refusals = [
		entry.mongoDb === DEFAULTS.mongoDb && `Mongo database ${entry.mongoDb}`,
		entry.redisDb === DEFAULTS.redisDb && `Redis DB ${entry.redisDb}`,
		entry.s3Subbucket === DEFAULTS.s3Subbucket && `S3 subbucket ${entry.s3Subbucket}`
	].filter(Boolean);

	if (refusals.length > 0) {
		throw new StackError(`stack ${entry.name} lists the default ${refusals.join(', ')}: refusing to delete it`);
	}

	const sharing = listBackends().filter(
		(backend) =>
			(ownBackendStopped || String(backend.port) !== String(entry.port)) &&
			(backend.mongoDb === entry.mongoDb || backend.redisDb === entry.redisDb)
	);

	if (sharing.length > 0) {
		throw new StackError(
			`running backend pid ${sharing[0].pid} (:${sharing[0].port}) uses the data of stack ${entry.name}: refusing to delete it`
		);
	}
};

const deleteS3Prefix = (prefix) =>
	withS3(async (s3) => {
		const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
		let deleted = 0;

		for (;;) {
			const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket: LOCAL.bucket, Prefix: prefix }));

			if (Contents.length === 0) return deleted;

			await s3.send(
				new DeleteObjectsCommand({
					Bucket: LOCAL.bucket,
					Delete: { Objects: Contents.map(({ Key }) => ({ Key })) }
				})
			);
			deleted += Contents.length;
		}
	});

const down = async (name) => {
	const entry = readEntry(name);

	if (!entry) throw new StackError(`unknown stack ${name} (see 'stack list')`);

	assertDownIsSafe(entry, { ownBackendStopped: false });

	for (const service of servicesOf(entry).reverse()) {
		console.log(await stop(entry, service));
	}

	assertDownIsSafe(entry, { ownBackendStopped: true });

	await withMongo((client) => client.db(entry.mongoDb).dropDatabase());
	console.log(`dropped Mongo database ${entry.mongoDb}`);

	await withRedis(async (redis) => {
		await redis.select(Number(entry.redisDb));
		await redis.flushdb();
	});
	console.log(`emptied Redis DB ${entry.redisDb}`);
	console.log(`deleted ${await deleteS3Prefix(`${entry.s3Subbucket}/`)} S3 objects under ${entry.s3Subbucket}/`);

	rmSync(entryPath(name), { force: true });

	for (const service of SERVICES) {
		rmSync(logPath(name, service), { force: true });
	}

	console.log(`removed stack ${name}`);
};

const main = async () => {
	const [command, name, ...rest] = process.argv.slice(2);
	const needsName = ['up', 'run', 'env', 'down'].includes(command);

	if (!['up', 'run', 'env', 'list', 'down'].includes(command)) {
		throw new StackError(
			'usage: stack up <name> [--primary] [--testapp] | run <name> -- <command...> | env <name> | list | down <name>'
		);
	}

	if (needsName && !NAME_PATTERN.test(name ?? '')) {
		throw new StackError(
			`invalid stack name '${name ?? ''}': lowercase letters, digits and dashes, 1 to 30 characters`
		);
	}

	if (command === 'up') return up(name, rest);

	if (command === 'run') return runCommand(name, rest[0] === '--' ? rest.slice(1) : []);

	if (command === 'env') return console.log(formatEnv(await allocate(name)).join('\n'));

	if (command === 'list') return list();

	return down(name);
};

try {
	process.exit((await main()) ?? 0);
} catch (error) {
	if (!(error instanceof StackError)) throw error;

	console.error(`stack: ${error.message}`);
	process.exit(1);
}
