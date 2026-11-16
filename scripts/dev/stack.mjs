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
	webhookPorts
} from './local-env.mjs';

// A named, isolated set of backend resources (HTTP port, Mongo database, Redis DB, S3 subbucket) on the shared
// Docker stack, recorded in a registry shared by every checkout so no session reuses or deletes another's data.
//   up <name> [--primary]    start this checkout's backend on the stack (--primary takes :6080 when it is free)
//   run <name> -- <command>  run a command (jest, playwright) with the stack environment; a suite where a meeting
//                            starts needs `up` first, because only a listening backend receives LiveKit's webhooks
//   env <name>               print the stack environment as KEY=value lines
//   list                     registered stacks and the running backends no stack owns
//   down <name>              stop the backend and delete the stack's data and registry entry

const REGISTRY = join(process.env.XDG_STATE_HOME ?? join(homedir(), '.local/state'), 'openvidu-meet/stacks');
const API_KEY = 'meet-api-key';
const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;
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

const entryPath = (name) => join(REGISTRY, `${name}.json`);
const logPath = (name) => join(REGISTRY, `${name}.log`);
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

const freePort = async (taken, primary) => {
	if (primary) {
		if (taken.has(Number(DEFAULTS.port)) || (await probePort(DEFAULTS.port))) {
			throw new StackError(`--primary: port ${DEFAULTS.port} is not free`);
		}

		return Number(DEFAULTS.port);
	}

	for (let port = STACK_FIRST_PORT; ; port++) {
		if (!taken.has(port) && !(await probePort(port))) return port;
	}
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

const allocate = (name, { primary = false } = {}) =>
	withRegistryLock(async () => {
		const existing = readEntry(name);

		if (existing) {
			if (primary && existing.port !== Number(DEFAULTS.port)) {
				throw new StackError(
					`stack ${name} already holds port ${existing.port}: 'stack down ${name}' first to take ${DEFAULTS.port}`
				);
			}

			return existing;
		}

		const entries = readEntries();
		const takenPorts = new Set([
			...entries.map(({ port }) => port),
			...listBackends().map(({ port }) => Number(port))
		]);
		const takenRedisDbs = new Set([
			DEFAULTS.redisDb,
			...entries.map(({ redisDb }) => redisDb),
			...listBackends().map(({ redisDb }) => redisDb)
		]);
		const entry = {
			name,
			port: await freePort(takenPorts, primary),
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
	});

const stackEnv = ({ name, port, mongoDb, redisDb, s3Subbucket }) => ({
	SERVER_PORT: String(port),
	MEET_MONGO_DB_NAME: mongoDb,
	MEET_REDIS_DB: redisDb,
	MEET_S3_SUBBUCKET: s3Subbucket,
	MEET_NAME_ID: `openviduMeet-${name}`,
	E2E_BASE_URL: `http://localhost:${port}/meet`,
	E2E_API_KEY: API_KEY,
	MEET_API_URL: `http://localhost:${port}/meet`,
	MEET_API_KEY: API_KEY,
	MEET_WEBCOMPONENT_SRC: `http://localhost:${port}/meet/v1/openvidu-meet.js`
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

const isStackBackend = (entry) => {
	const environment = entry.pid ? processEnvironment(entry.pid) : undefined;

	return (
		environment !== undefined &&
		processCommandLine(entry.pid)?.includes('src/server.ts') === true &&
		environment.MEET_MONGO_DB_NAME === entry.mongoDb &&
		environment.SERVER_PORT === String(entry.port)
	);
};

const waitUntilStopped = async (pid, timeoutMs) => {
	for (const deadline = Date.now() + timeoutMs; Date.now() < deadline; await sleep(100)) {
		if (!existsSync(`/proc/${pid}`)) return true;
	}

	return false;
};

const stopBackend = async (entry) => {
	if (!entry.pid) return 'no backend recorded';

	if (!isStackBackend(entry)) return `pid ${entry.pid} is not this stack's backend (not touched)`;

	process.kill(-entry.pid, 'SIGTERM');

	if (!(await waitUntilStopped(entry.pid, 10000))) {
		process.kill(-entry.pid, 'SIGKILL');
		await waitUntilStopped(entry.pid, 5000);
	}

	return `stopped pid ${entry.pid}`;
};

const lastLogLines = (name) => readFileSync(logPath(name), 'utf8').trim().split('\n').slice(-15).join('\n');

const waitUntilAnswering = async (entry) => {
	const url = `http://localhost:${entry.port}/meet/api/v1/rooms?maxItems=1`;

	for (const deadline = Date.now() + 120000; Date.now() < deadline; await sleep(500)) {
		if (!existsSync(`/proc/${entry.pid}`)) {
			throw new StackError(
				`the backend exited while starting, log ${logPath(entry.name)}:\n${lastLogLines(entry.name)}`
			);
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

	throw new StackError(`the backend did not answer on ${url} within 120 s, log ${logPath(entry.name)}`);
};

const up = async (name, flags) => {
	let entry = await allocate(name, { primary: flags.includes('--primary') });

	if (isStackBackend(entry)) {
		throw new StackError(
			`stack ${name} is already running (pid ${entry.pid}, http://localhost:${entry.port}/meet)`
		);
	}

	const tsx = join(repoRoot, 'node_modules/.bin/tsx');

	if (!existsSync(tsx)) throw new StackError(`${tsx} not found: run ./meet.sh install`);

	if (await probePort(entry.port)) throw new StackError(`port ${entry.port} is already in use`);

	const log = openSync(logPath(name), 'w');
	const backend = spawn(tsx, ['./src/server.ts'], {
		cwd: join(repoRoot, 'meet-ce/backend'),
		env: { ...callerEnv(), ...stackEnv(entry), NODE_ENV: 'ci' },
		detached: true,
		stdio: ['ignore', log, log]
	});

	closeSync(log);
	backend.unref();
	entry = { ...entry, pid: backend.pid, checkout: repoRoot, startedAt: new Date().toISOString() };
	writeEntry(entry);
	await waitUntilAnswering(entry);

	console.log(formatEnv(entry).join('\n'));
	console.log(`URL=http://localhost:${entry.port}/meet`);
	console.log(`LOG=${logPath(name)}`);
	console.log(webhookLine(entry));
};

const runCommand = async (name, command) => {
	if (command.length === 0) throw new StackError('usage: stack run <name> -- <command...>');

	const entry = await allocate(name);

	console.error(
		`stack ${name}: port ${entry.port}, mongo ${entry.mongoDb}, redis db ${entry.redisDb}, s3 ${entry.s3Subbucket}/, backend ${isStackBackend(entry) ? 'running' : `not running ('stack up ${name}' first when a meeting has to start: it receives the LiveKit webhooks)`}`
	);

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
			`${entry.name}  ${isStackBackend(entry) ? 'running' : 'stopped'}  :${entry.port}  mongo ${entry.mongoDb}  redis ${entry.redisDb}  s3 ${entry.s3Subbucket}/  ${entry.checkout ?? '-'}`
	);

	for (const backend of backends.filter((entry) => !owned(entry))) {
		lines.push(
			`unmanaged  running  :${backend.port}  mongo ${backend.mongoDb}  redis ${backend.redisDb}  s3 ${backend.s3Subbucket}/  ${backend.checkout} pid ${backend.pid}`
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
	console.log(await stopBackend(entry));
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
	rmSync(logPath(name), { force: true });
	console.log(`removed stack ${name}`);
};

const main = async () => {
	const [command, name, ...rest] = process.argv.slice(2);
	const needsName = ['up', 'run', 'env', 'down'].includes(command);

	if (!['up', 'run', 'env', 'list', 'down'].includes(command)) {
		throw new StackError(
			'usage: stack up <name> [--primary] | run <name> -- <command...> | env <name> | list | down <name>'
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
