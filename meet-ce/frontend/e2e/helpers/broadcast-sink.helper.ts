import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// An RTMP server the egress can stream to: an RTMP ingress of the LiveKit deployment under test,
// created with the LiveKit CLI. The egress container reaches it through the host, and the room the
// ingress feeds is nobody's.
const LIVEKIT_ARGS = [
	'--url',
	(process.env['LIVEKIT_URL'] ?? 'http://localhost:7880').replace(/^ws/, 'http'),
	'--api-key',
	process.env['LIVEKIT_API_KEY'] ?? 'devkey',
	'--api-secret',
	process.env['LIVEKIT_API_SECRET'] ?? 'secret'
];
const createdIngressIds: string[] = [];

/** Creates a sink and returns the RTMP URL, stream key included, a room destination streams to. */
export const createRtmpSink = async (name: string): Promise<string> => {
	const requestDir = await mkdtemp(join(tmpdir(), 'meet-e2e-sink-'));
	const requestFile = join(requestDir, 'ingress.json');
	await writeFile(
		requestFile,
		JSON.stringify({
			input_type: 0,
			name,
			room_name: `broadcast-sink-${name}-${Date.now()}`,
			participant_identity: `broadcast-sink-${name}`
		})
	);

	try {
		const { stdout } = await run('lk', ['ingress', 'create', ...LIVEKIT_ARGS, requestFile]);
		const ingressId = /IngressID:\s*(\S+)/.exec(stdout)?.[1];
		const url = /URL:\s*(\S+)/.exec(stdout)?.[1];
		const streamKey = /Stream Key:\s*(\S+)/.exec(stdout)?.[1];

		if (!ingressId || !url || !streamKey) {
			throw new Error(`Unexpected 'lk ingress create' output: ${stdout}`);
		}

		createdIngressIds.push(ingressId);

		return `${url.replace('localhost', 'host.docker.internal')}/${streamKey}`;
	} finally {
		await rm(requestDir, { recursive: true, force: true });
	}
};

export const deleteRtmpSinks = async (): Promise<void> => {
	await Promise.all(
		createdIngressIds.splice(0).map((ingressId) => run('lk', ['ingress', 'delete', ...LIVEKIT_ARGS, ingressId]))
	);
};
