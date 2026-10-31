import type { BroadcastPlatform } from '../models/broadcast.model';

const isHostOf = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);

// Kick ingests through Amazon IVS like Twitch does, on one fixed host that a Twitch rule would also
// match, so it is checked first.
const PLATFORM_RULES: [BroadcastPlatform, (host: string) => boolean][] = [
	['youtube', (host) => isHostOf(host, 'youtube.com')],
	['facebook', (host) => isHostOf(host, 'facebook.com')],
	['instagram', (host) => host === 'live-upload.instagram.com'],
	['x', (host) => isHostOf(host, 'pscp.tv')],
	['vimeo', (host) => isHostOf(host, 'vimeo.com')],
	['kick', (host) => host === 'fa723fc1b171.global-contribute.live-video.net'],
	['twitch', (host) => isHostOf(host, 'twitch.tv') || host.endsWith('.contribute.live-video.net')]
];

export function extractBroadcastHost(url: string): string {
	try {
		return new URL(url.trim()).hostname;
	} catch {
		return '';
	}
}

export function detectBroadcastPlatform(url: string): BroadcastPlatform {
	const host = extractBroadcastHost(url).toLowerCase();
	return PLATFORM_RULES.find(([, matches]) => matches(host))?.[0] ?? 'other';
}
