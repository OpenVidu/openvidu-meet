import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetParticipantModerationAction,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge
} from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { FrontendEventService } from '../../../src/services/frontend-event.service.js';
import type { LiveKitService } from '../../../src/services/livekit.service.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { RoomMemberService } from '../../../src/services/room-member.service.js';
import type { RoomService } from '../../../src/services/room.service.js';
import type { TokenService } from '../../../src/services/token.service.js';

/**
 * S2 (MEET-API-CONTRACT-AUDIT-FINDINGS.md): a participant that joined with a token Meet did not
 * issue carries no Meet metadata, so parsing it threw and reached the caller as a 500.
 */

const ROOM_ID = 'room-abc';
const IDENTITY = 'lk-bot';

const permissions = (value: boolean) =>
	Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, value])) as unknown as MeetRoomMemberPermissions;

const roles = {
	[MeetRoomMemberRole.MODERATOR]: { permissions: permissions(true) },
	[MeetRoomMemberRole.SPEAKER]: { permissions: permissions(false) }
} as unknown as MeetRoomRoles;

const meetMetadata = JSON.stringify({
	iat: Date.now(),
	roomId: ROOM_ID,
	permissions: permissions(false),
	badge: MeetRoomMemberUIBadge.OTHER
});

describe('RoomMemberService.updateParticipantRole - S2: a participant Meet did not admit', () => {
	let metadataInLiveKit: string;
	let livekitService: {
		getParticipant: jest.Mock<(roomId: string, identity: string) => Promise<ParticipantInfo>>;
		updateParticipant: jest.Mock<
			(roomId: string, identity: string, metadata: string, permission?: unknown) => Promise<ParticipantInfo>
		>;
	};
	let roomMemberService: RoomMemberService;

	const promote = () =>
		roomMemberService.updateParticipantRole(ROOM_ID, IDENTITY, MeetParticipantModerationAction.UPGRADE);

	beforeEach(() => {
		metadataInLiveKit = meetMetadata;
		livekitService = {
			getParticipant: jest.fn(
				async () => ({ identity: IDENTITY, metadata: metadataInLiveKit }) as ParticipantInfo
			),
			updateParticipant: jest.fn(
				async (_roomId, identity, metadata) => ({ identity, metadata }) as ParticipantInfo
			)
		};

		roomMemberService = new RoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} } as unknown as LoggerService,
				{},
				{ getMeetRoom: async () => ({ roles }) } as unknown as RoomService,
				{},
				{},
				{ sendParticipantRoleUpdatedSignal: async () => {} } as unknown as FrontendEventService,
				livekitService as unknown as LiveKitService,
				// The metadata is validated against the real token schema, in MeetParticipantHelper.
				{} as unknown as TokenService,
				{},
				{},
				{ startAutoRecordingIfNeeded: async () => {} }
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	it('answers 409 naming the participant instead of an unexpected error', async () => {
		metadataInLiveKit = JSON.stringify({ agent: 'transcriber' });

		await expect(promote()).rejects.toMatchObject({
			statusCode: 409,
			message: `Participant '${IDENTITY}' in room '${ROOM_ID}' cannot be moderated because they did not join through OpenVidu Meet`
		});
	});

	it('answers 409 for a participant with no metadata at all', async () => {
		metadataInLiveKit = '';

		await expect(promote()).rejects.toMatchObject({ statusCode: 409 });
	});

	it('never touches the participant in the media server', async () => {
		metadataInLiveKit = 'not json at all';

		await expect(promote()).rejects.toMatchObject({ statusCode: 409 });
		expect(livekitService.updateParticipant).not.toHaveBeenCalled();
	});

	it('still promotes a participant that joined through Meet', async () => {
		await promote();

		expect(livekitService.updateParticipant).toHaveBeenCalledTimes(1);
		expect(JSON.parse(livekitService.updateParticipant.mock.calls[0]![2])).toMatchObject({
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		});
	});
});
