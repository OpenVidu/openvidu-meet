import { safeJsonParse } from '../openvidu-components/utils/utils';

const MEETING_END_TOLERANCE_MS = 2_000;

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

/**
 * Whether the meeting has reached the end its room's duration limit gave it, `endsAt` being that
 * end in this device's clock. It is what tells a force-end from a moderator's own end, LiveKit
 * reporting the very same room deletion for both.
 *
 * The tolerance absorbs the backend ending the meeting a hair early, by its own
 * `MEETING_DURATION_END_TOLERANCE`, plus whatever clock skew survives the token's `iat` correction.
 * Inside it a moderator's end reads as the duration limit, which is the ambiguity this accepts in
 * exchange for needing no signal that would race the room's deletion.
 */
export const hasReachedMeetingEnd = (endsAt: number | undefined): boolean =>
	endsAt !== undefined && Date.now() >= endsAt - MEETING_END_TOLERANCE_MS;
