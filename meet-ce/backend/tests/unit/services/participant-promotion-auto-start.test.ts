import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import type { ParticipantInfo, Room } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { FrontendEventService } from '../../../src/services/frontend-event.service.js';
import type { LiveKitService } from '../../../src/services/livekit.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import type { RecordingService } from '../../../src/services/recording.service.js';
import { RoomMemberService } from '../../../src/services/room-member.service.js';
import type { RoomService } from '../../../src/services/room.service.js';
import type { TokenService } from '../../../src/services/token.service.js';

/**
 * B10 (MEET-BRANCH-AUDIT-FINDINGS.md): the auto-start was evaluated only from the
 * `participant_joined` webhook, so a `when_moderator_joins` room held a promoted moderator without
 * recording until an unrelated join re-evaluated the threshold — or forever, if none came.
 */

const ROOM_ID = 'room-abc';
const MEETING_ID = 'RM_meeting_1';
const IDENTITY = 'participant-1';

const permissions = (value: boolean) =>
	Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, value])) as unknown as MeetRoomMemberPermissions;

const roles = {
	[MeetRoomMemberRole.MODERATOR]: { permissions: permissions(true) },
	[MeetRoomMemberRole.SPEAKER]: { permissions: permissions(false) }
} as unknown as MeetRoomRoles;

const speakerMetadata = JSON.stringify({
	iat: Date.now(),
	roomId: ROOM_ID,
	permissions: permissions(false),
	badge: MeetRoomMemberUIBadge.OTHER
});

const promotedModeratorMetadata = JSON.stringify({
	iat: Date.now(),
	roomId: ROOM_ID,
	permissions: permissions(true),
	originalPermissions: permissions(false),
	badge: MeetRoomMemberUIBadge.MODERATOR,
	isPromotedModerator: true
});

const flushDetachedWork = () => new Promise((resolve) => setImmediate(resolve));

describe('RoomMemberService.updateParticipantRole — B10: a promotion re-evaluates the recording auto-start', () => {
	let metadataInLiveKit: string;
	let livekitService: {
		getParticipant: jest.Mock<(roomId: string, identity: string) => Promise<ParticipantInfo>>;
		updateParticipant: jest.Mock<
			(roomId: string, identity: string, metadata: string, permission?: unknown) => Promise<ParticipantInfo>
		>;
		getRoom: jest.Mock<(roomId: string) => Promise<Room>>;
	};
	let recordingService: {
		startAutoRecordingIfNeeded: jest.Mock<(room: Room, candidate: ParticipantInfo) => Promise<void>>;
	};
	let roomMemberService: RoomMemberService;

	const autoStartCandidate = () => recordingService.startAutoRecordingIfNeeded.mock.calls[0]?.[1];

	beforeEach(() => {
		metadataInLiveKit = speakerMetadata;
		livekitService = {
			// Deliberately stale after the update: LiveKit reads lag the write, so the candidate
			// must come from updateParticipant's acknowledgement, never from a re-read.
			getParticipant: jest.fn(
				async () => ({ identity: IDENTITY, metadata: metadataInLiveKit }) as ParticipantInfo
			),
			updateParticipant: jest.fn(
				async (_roomId, identity, metadata) => ({ identity, metadata }) as ParticipantInfo
			),
			getRoom: jest.fn(async () => ({ name: ROOM_ID, sid: MEETING_ID }) as Room)
		};
		recordingService = { startAutoRecordingIfNeeded: jest.fn(async () => {}) };

		roomMemberService = new RoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} } as unknown as LoggerService,
				{},
				{ getMeetRoom: async () => ({ roles }) } as unknown as RoomService,
				{},
				{},
				{ sendParticipantRoleUpdatedSignal: async () => {} } as unknown as FrontendEventService,
				livekitService as unknown as LiveKitService,
				{
					parseRoomMemberTokenMetadata: (metadata: string) => JSON.parse(metadata)
				} as unknown as TokenService,
				{},
				{},
				recordingService as unknown as RecordingService
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	it('re-evaluates the threshold with the promoted participant, moderator badge already applied', async () => {
		await roomMemberService.updateParticipantRole(ROOM_ID, IDENTITY, MeetParticipantModerationAction.UPGRADE);
		await flushDetachedWork();

		expect(recordingService.startAutoRecordingIfNeeded).toHaveBeenCalledTimes(1);
		expect(recordingService.startAutoRecordingIfNeeded.mock.calls[0]?.[0]).toMatchObject({
			name: ROOM_ID,
			sid: MEETING_ID
		});
		expect(JSON.parse(autoStartCandidate()!.metadata)).toMatchObject({
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		});
	});

	it('leaves a demotion alone: it can only lower the count', async () => {
		metadataInLiveKit = promotedModeratorMetadata;

		await roomMemberService.updateParticipantRole(ROOM_ID, IDENTITY, MeetParticipantModerationAction.DOWNGRADE);
		await flushDetachedWork();

		expect(recordingService.startAutoRecordingIfNeeded).not.toHaveBeenCalled();
	});

	// Starting a recording is a LiveKit round trip the promotion must not wait on.
	it('does not hold the promotion response while the recording starts', async () => {
		let releaseAutoStart!: () => void;
		recordingService.startAutoRecordingIfNeeded.mockReturnValue(
			new Promise<void>((resolve) => {
				releaseAutoStart = resolve;
			})
		);

		await roomMemberService.updateParticipantRole(ROOM_ID, IDENTITY, MeetParticipantModerationAction.UPGRADE);
		await flushDetachedWork();

		expect(recordingService.startAutoRecordingIfNeeded).toHaveBeenCalledTimes(1);
		releaseAutoStart();
	});

	it('keeps the promotion when the auto-start check fails', async () => {
		livekitService.getRoom.mockRejectedValue(new Error('LiveKit is unreachable'));

		await expect(
			roomMemberService.updateParticipantRole(ROOM_ID, IDENTITY, MeetParticipantModerationAction.UPGRADE)
		).resolves.toBeUndefined();
		await flushDetachedWork();

		expect(livekitService.updateParticipant).toHaveBeenCalledTimes(1);
		expect(recordingService.startAutoRecordingIfNeeded).not.toHaveBeenCalled();
	});
});
