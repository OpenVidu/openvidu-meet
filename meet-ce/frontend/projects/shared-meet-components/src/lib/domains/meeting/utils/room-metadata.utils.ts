import { safeJsonParse } from '../openvidu-components/utils/utils';

/**
 * Reads the instant at which a duration-limited meeting is force-ended off the LiveKit room
 * metadata, in server time. OpenVidu Meet writes it there when it creates the room (see the
 * backend's `MeetRoomHelper.toLivekitRoomMetadata`), so it reaches every participant on join and on
 * reconnect without a request of its own.
 *
 * @param metadata - The raw LiveKit room metadata.
 * @returns The deadline in milliseconds since the epoch, or `undefined` for a meeting that declares
 * none, and for metadata that is missing, malformed or carries an unusable value.
 */
export const parseMeetingEndDate = (metadata?: string): number | undefined => {
	const endDate = metadata ? safeJsonParse<{ endDate?: unknown }>(metadata)?.endDate : undefined;
	return typeof endDate === 'number' && Number.isFinite(endDate) ? endDate : undefined;
};
