import { IngressClient, IngressInput } from 'livekit-server-sdk';
import { MEET_ENV } from '../../src/environment.js';

// An RTMP server the egress can stream to. The deployment under test ships a LiveKit RTMP ingress,
// which the egress container reaches through the host; the room the ingress feeds is nobody's.
const ingressClient = new IngressClient(
	MEET_ENV.LIVEKIT_URL_PRIVATE.replace(/^ws/, 'http'),
	MEET_ENV.LIVEKIT_API_KEY,
	MEET_ENV.LIVEKIT_API_SECRET
);
const sinkIngressIds = new Set<string>();

export const createRtmpSink = async (name: string): Promise<string> => {
	const ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
		name,
		roomName: `broadcast-sink-${name}-${Date.now()}`,
		participantIdentity: `broadcast-sink-${name}`
	});
	sinkIngressIds.add(ingress.ingressId);
	return `${ingress.url.replace('localhost', 'host.docker.internal')}/${ingress.streamKey}`;
};

export const deleteRtmpSinks = async (): Promise<void> => {
	await Promise.all([...sinkIngressIds].map((ingressId) => ingressClient.deleteIngress(ingressId)));
	sinkIngressIds.clear();
};
