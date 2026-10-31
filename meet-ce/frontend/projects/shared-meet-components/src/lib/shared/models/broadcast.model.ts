/**
 * What one destination costs the server in upload while a broadcast runs, in Mbps: the 720p preset
 * every broadcast is encoded with (3000 kbps of video plus 128 kbps of audio), sent once per
 * destination. Shown wherever destinations are chosen, so nobody takes streaming to be free.
 */
export const BROADCAST_MBPS_PER_DESTINATION = 3;

/** What streaming to that many destinations at once costs the server in upload, in Mbps. */
export const broadcastUploadMbps = (destinations: number): number => destinations * BROADCAST_MBPS_PER_DESTINATION;

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
