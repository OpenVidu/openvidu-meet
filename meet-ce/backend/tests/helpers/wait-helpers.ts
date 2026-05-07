import { MeetRecordingStatus, MeetRoomStatus } from '@openvidu-meet/typings';
import { container } from '../../src/config/dependency-injector.config.js';
import { RecordingRepository } from '../../src/repositories/recording.repository.js';
import { RoomMemberRepository } from '../../src/repositories/room-member.repository.js';
import { RoomRepository } from '../../src/repositories/room.repository.js';
import { LiveKitService } from '../../src/services/livekit.service.js';

// ─── CONFIGURATION ───────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_ROOM_TIMEOUT_MS = 15_000;
const DEFAULT_RECORDING_TIMEOUT_MS = 30_000;
const DEFAULT_PARTICIPANT_TIMEOUT_MS = 15_000;

// ─── GENERIC POLLING ─────────────────────────────────────────────────────────

/**
 * Generic active-wait utility.
 *
 * Repeatedly invokes `condition` every `intervalMs` milliseconds until it
 * returns `true` or `timeoutMs` milliseconds have elapsed.
 * Throws a descriptive error if the condition is never satisfied.
 */
const pollUntil = async (
	condition: () => Promise<boolean>,
	options: {
		intervalMs?: number;
		timeoutMs?: number;
		errorMessage?: string;
	} = {}
): Promise<void> => {
	const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_ROOM_TIMEOUT_MS;
	const errorMessage = options.errorMessage ?? 'pollUntil: condition was not met within the timeout';

	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (await condition()) return;

		await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
	}

	throw new Error(`${errorMessage} (timeout: ${timeoutMs}ms)`);
};

// ─── ROOM WAIT HELPERS ────────────────────────────────────────────────────────

/**
 * Waits until a room and its related data are fully removed.
 *
 * This helper is intended for flows where the expected backend side effect is
 * deletion of the room document plus associated room recordings and members.
 *
 * Polls repositories directly to observe persisted backend state with no HTTP
 * indirection.
 *
 * @param roomId    - Room identifier to poll.
 * @param timeoutMs - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForRoomToDelete = async (roomId: string, timeoutMs = DEFAULT_ROOM_TIMEOUT_MS): Promise<void> => {
	const roomRepository = container.get(RoomRepository);
	const recordingRepository = container.get(RecordingRepository);
	const roomMemberRepository = container.get(RoomMemberRepository);

	await pollUntil(
		async () => {
			const [room, recordings, roomMembers] = await Promise.all([
				roomRepository.findByRoomId(roomId, ['roomId']),
				recordingRepository.find({
					roomId,
					fields: ['recordingId'],
					maxItems: 1
				}),
				roomMemberRepository.findByRoomId(roomId, {
					fields: ['roomId'],
					maxItems: 1
				})
			]);

			return !room && recordings.recordings.length === 0 && roomMembers.members.length === 0;
		},
		{
			timeoutMs,
			errorMessage: `Room '${roomId}' and its related recordings/members were not fully deleted`
		}
	);
};

/**
 * Waits until every room in `roomIds` has been deleted.
 *
 * All rooms are polled concurrently.
 *
 * @param roomIds   - Array of room identifiers to poll.
 * @param timeoutMs - Maximum wait time per room in milliseconds (default: 15 000).
 */
export const waitForAllRoomsToDelete = async (
	roomIds: string[],
	timeoutMs = DEFAULT_ROOM_TIMEOUT_MS
): Promise<void> => {
	await Promise.all(roomIds.map((id) => waitForRoomToDelete(id, timeoutMs)));
};

// ─── PARTICIPANT WAIT HELPERS ─────────────────────────────────────────────────

/**
 * Waits until all participants have disconnected from the given LiveKit rooms.
 *
 * Queries `LiveKitService.roomHasParticipants()` directly — the authoritative
 * source of truth for participant presence — so no HTTP auth overhead is
 * incurred.
 *
 * Resolves immediately if `roomIds` is empty.
 *
 * @param roomIds   - Room identifiers to check for remaining participants.
 * @param timeoutMs - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForParticipantsToDisconnect = async (
	roomIds: string[],
	timeoutMs = DEFAULT_PARTICIPANT_TIMEOUT_MS
): Promise<void> => {
	if (roomIds.length === 0) return;

	const livekitService = container.get(LiveKitService);

	await pollUntil(
		async () => {
			const checks = await Promise.all(roomIds.map((id) => livekitService.roomHasParticipants(id)));
			console.log(`Checked participant presence in rooms [${roomIds.join(', ')}]:`, checks);
			return checks.every((hasParticipants) => !hasParticipants);
		},
		{
			timeoutMs,
			errorMessage: `Participants in rooms [${roomIds.join(', ')}] did not disconnect`
		}
	);
};

/**
 * Waits until a room reaches the {@link MeetRoomStatus.CLOSED} state.
 *
 * The room must still exist in the repository; deletion does not satisfy this
 * condition.
 *
 * @param roomId    - Room identifier to poll.
 * @param timeoutMs - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForRoomToClose = async (roomId: string, timeoutMs = DEFAULT_ROOM_TIMEOUT_MS): Promise<void> => {
	const roomRepository = container.get(RoomRepository);

	await pollUntil(
		async () => {
			const room = await roomRepository.findByRoomId(roomId);
			return !!room && room.status === MeetRoomStatus.CLOSED;
		},
		{ timeoutMs, errorMessage: `Room '${roomId}' was not closed` }
	);
};

/**
 * Waits until a participant is present in the given LiveKit room.
 *
 * Uses `LiveKitService.participantExists()` as the source of truth for
 * participant presence.
 *
 * @param roomId              - Room identifier to query.
 * @param participantIdentity - Participant identity expected to appear.
 * @param timeoutMs           - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForParticipantToConnect = async (
	roomId: string,
	participantIdentity: string,
	timeoutMs = DEFAULT_PARTICIPANT_TIMEOUT_MS
): Promise<void> => {
	const livekitService = container.get(LiveKitService);

	await pollUntil(
		async () => {
			return await livekitService.participantExists(roomId, participantIdentity);
		},
		{
			timeoutMs,
			errorMessage: `No participants connected to room '${roomId}'`
		}
	);
};

/**
 * Waits until a participant's metadata matches the expected serialized value.
 *
 * The helper fetches the participant directly from LiveKit and compares its
 * `metadata` field with `JSON.stringify(metadata)`.
 *
 * @param roomId              - Room identifier to query.
 * @param participantIdentity - Participant identity expected to update.
 * @param metadata            - Metadata object expected to be stored.
 * @param timeoutMs           - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForParticipantToUpdateMetadata = async (
	roomId: string,
	participantIdentity: string,
	metadata: Record<string, unknown>,
	timeoutMs = DEFAULT_PARTICIPANT_TIMEOUT_MS
): Promise<void> => {
	const livekitService = container.get(LiveKitService);

	await pollUntil(
		async () => {
			const participant = await livekitService.getParticipant(roomId, participantIdentity);

			if (!participant) return false;

			return participant.metadata === JSON.stringify(metadata);
		},
		{
			timeoutMs,
			errorMessage: `Participant '${participantIdentity}' in room '${roomId}' did not update metadata to ${JSON.stringify(
				metadata
			)}`
		}
	);
};

// ─── RECORDING WAIT HELPERS ───────────────────────────────────────────────────

/**
 * Waits until a recording's `egress_ended` LiveKit webhook has been fully
 * processed by the backend handler.
 *
 * The condition is satisfied when the recording no longer exists in the database
 * or its status is no longer {@link MeetRecordingStatus.ACTIVE}.
 *
 * Polls `RecordingRepository` directly to observe the exact side-effect written
 * by the webhook handler.
 *
 * @param recordingId - Recording identifier to poll.
 * @param timeoutMs   - Maximum wait time in milliseconds (default: 30 000).
 */
export const waitForRecordingToStop = async (
	recordingId: string,
	timeoutMs = DEFAULT_RECORDING_TIMEOUT_MS
): Promise<void> => {
	const recordingRepository = container.get(RecordingRepository);

	await pollUntil(
		async () => {
			const recording = await recordingRepository.findByRecordingId(recordingId);

			// Recording deleted → handler finished.
			if (!recording) return true;

			return [MeetRecordingStatus.COMPLETE, MeetRecordingStatus.FAILED, MeetRecordingStatus.ABORTED].includes(
				recording.status
			);
		},
		{ timeoutMs, errorMessage: `Recording '${recordingId}' did not stop` }
	);
};

/**
 * Waits until a meeting has ended from both the backend and LiveKit point of view.
 *
 * The condition is satisfied when either the room no longer exists in the
 * repository, or LiveKit no longer reports the room while the stored room state
 * is no longer {@link MeetRoomStatus.ACTIVE_MEETING}.
 *
 * @param roomId    - Room identifier to poll.
 * @param timeoutMs - Maximum wait time in milliseconds (default: 15 000).
 */
export const waitForMeetingToEnd = async (roomId: string, timeoutMs = DEFAULT_ROOM_TIMEOUT_MS): Promise<void> => {
	const roomRepository = container.get(RoomRepository);
	const livekitService = container.get(LiveKitService);

	await pollUntil(
		async () => {
			const lkRoomExists = await livekitService.roomExists(roomId); // Ensure we have the latest room state from LiveKit
			const room = await roomRepository.findByRoomId(roomId);

			if (!room) return true;

			return !lkRoomExists && room.status !== MeetRoomStatus.ACTIVE_MEETING;
		},
		{ timeoutMs, errorMessage: `Meeting in room '${roomId}' did not end` }
	);
};

/**
 * Waits until all recordings in `recordingIds` have stopped.
 * All recordings are polled concurrently.
 *
 * @param recordingIds - Array of recording identifiers to poll.
 * @param timeoutMs    - Maximum wait time per recording in milliseconds (default: 30 000).
 */
export const waitForAllRecordingsToStop = async (
	recordingIds: string[],
	timeoutMs = DEFAULT_RECORDING_TIMEOUT_MS
): Promise<void> => {
	await Promise.all(recordingIds.map((id) => waitForRecordingToStop(id, timeoutMs)));
};
