import { execFileSync } from 'node:child_process';
import { readFileSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

export const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');

export const DEFAULTS = { port: '6080', mongoDb: 'openvidu-meet', redisDb: '0', s3Subbucket: 'openvidu-meet' };

export const deploymentDir = () =>
	process.env.OPENVIDU_LOCAL_DEPLOYMENT_DIR ?? join(homedir(), 'CODEURJC/openvidu-local-deployment/community');

export const TESTAPP_DEFAULT_PORTS = [5080, 5081];

export const STACK_FIRST_PORT = 6100;
export const STACK_WEBHOOK_PORTS = Array.from({ length: 6 }, (_, index) => STACK_FIRST_PORT + index);

export const livekitConfigPath = () => join(deploymentDir(), 'livekit.yaml');

export const webhookPorts = () => {
	try {
		return [
			...readFileSync(livekitConfigPath(), 'utf8').matchAll(
				/^\s*-\s*http:\/\/host\.docker\.internal:(\d+)\/livekit\/webhook\s*$/gm
			)
		].map(([, port]) => Number(port));
	} catch {
		return [];
	}
};

export const probePort = (port, host = '127.0.0.1', timeoutMs = 700) =>
	new Promise((resolvePort) => {
		const socket = net.connect({ port: Number(port), host });
		const done = (answered) => {
			socket.destroy();
			resolvePort(answered);
		};

		socket.setTimeout(timeoutMs);
		socket.once('connect', () => done(true));
		socket.once('timeout', () => done(false));
		socket.once('error', () => done(false));
	});

export const run = (command, args, options = {}) => {
	try {
		return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], ...options });
	} catch {
		return undefined;
	}
};

export const processEnvironment = (pid) => {
	try {
		return Object.fromEntries(
			readFileSync(`/proc/${pid}/environ`, 'utf8')
				.split('\0')
				.filter((entry) => entry.includes('='))
				.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)])
		);
	} catch {
		return undefined;
	}
};

const SERVER_PATH = /(\S*src\/server\.(?:ts|js))(?:\s|$)/;
const CHECKOUT_SUFFIX = /\/(?:meet-ce|meet-pro)\/backend(?:\/(?:dist\/)?src\/server\.(?:ts|js))?$/;

const checkoutOf = (pid, serverPath) => {
	try {
		const base = serverPath.startsWith('/') ? serverPath : join(processCwd(pid), serverPath);

		return resolve(base).replace(CHECKOUT_SUFFIX, '');
	} catch {
		return '?';
	}
};

export const listBackends = () => {
	const processes = (run('ps', ['-eo', 'pid=,ppid=,args=']) ?? '')
		.split('\n')
		.map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
		.filter(Boolean)
		.map(([, pid, ppid, args]) => ({ pid: Number(pid), ppid: Number(ppid), args }))
		.filter(({ args }) => basename(args.split(' ')[0]) === 'node' && SERVER_PATH.test(args));
	const parents = new Set(processes.map(({ ppid }) => ppid));

	return processes
		.filter(({ pid }) => !parents.has(pid))
		.map(({ pid, args }) => {
			const environ = processEnvironment(pid) ?? {};

			return {
				pid,
				port: environ.SERVER_PORT ?? DEFAULTS.port,
				checkout: checkoutOf(pid, args.match(SERVER_PATH)[1]),
				mongoDb: environ.MEET_MONGO_DB_NAME ?? DEFAULTS.mongoDb,
				redisDb: environ.MEET_REDIS_DB ?? DEFAULTS.redisDb,
				s3Subbucket: environ.MEET_S3_SUBBUCKET ?? DEFAULTS.s3Subbucket
			};
		})
		.sort((a, b) => Number(a.port) - Number(b.port));
};

export const runningContainers = () => {
	const output = run('docker', ['ps', '--format', '{{.Names}}']);

	return output === undefined ? undefined : new Set(output.split('\n').filter(Boolean));
};

export const processCwd = (pid) => {
	try {
		return readlinkSync(`/proc/${pid}/cwd`);
	} catch {
		return undefined;
	}
};

export const portListener = (port) => {
	const listing = run('ss', ['-Hltnp', `sport = :${port}`])?.trim();

	return listing ? { pid: Number(listing.match(/pid=(\d+)/)?.[1]) || undefined } : undefined;
};

export const processCommandLine = (pid) => {
	try {
		return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim();
	} catch {
		return undefined;
	}
};
