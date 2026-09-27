import type { ValidatorFn } from '@angular/forms';
import { MEET_BROADCAST_REDACTED_STREAM_KEY } from '@openvidu-meet/typings';

/** A streaming platform Meet shows its own icon for, told apart by the host of the RTMP URL. */
export type BroadcastPlatform = 'youtube' | 'facebook' | 'instagram' | 'x' | 'vimeo' | 'twitch' | 'kick' | 'other';

export const BROADCAST_PLATFORM_LABELS: Record<BroadcastPlatform, string> = {
	youtube: 'YouTube',
	facebook: 'Facebook',
	instagram: 'Instagram',
	x: 'X',
	vimeo: 'Vimeo',
	twitch: 'Twitch',
	kick: 'Kick',
	other: 'RTMP server'
};

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

/**
 * Whether a destination URL is served redacted: its stream key, the last non-empty path segment,
 * replaced by the placeholder.
 */
export function isRedactedStreamUrl(url: string): boolean {
	const segments = url
		.split(/[?#]/)[0]
		.split('/')
		.filter((segment) => segment !== '');
	return segments.at(-1) === MEET_BROADCAST_REDACTED_STREAM_KEY;
}

/**
 * A redacted URL only stands for the URL a destination was served with: the server has no stream
 * key to go with any other, so a changed host or path needs the full URL.
 */
export const servedUrlValidator =
	(servedUrl: () => string | undefined): ValidatorFn =>
	(control) => {
		const url = (control.value as string).trim();
		return isRedactedStreamUrl(url) && url !== servedUrl() ? { streamKeyRequired: true } : null;
	};
