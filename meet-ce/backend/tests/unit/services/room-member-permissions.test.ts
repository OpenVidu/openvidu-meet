import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberRole, MeetRoomMemberUIBadge, TrackSource } from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
import ms from 'ms';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import type { ParticipantMeetingMetadata } from '../../../src/helpers/participant.helper.js';
import { errorParticipantNotFound } from '../../../src/models/error.model.js';
import { RoomRepository } from '../../../src/repositories/room.repository.js';
import { MutexService } from '../../../src/services/mutex.service.js';
import { ParticipantTokenRevocationService } from '../../../src/services/participant-token-revocation.service.js';
import { RedisService } from '../../../src/services/redis.service.js';
import { RoomMemberService } from '../../../src/services/room-member.service.js';
import { TokenService } from '../../../src/services/token.service.js';

/**
 * What a member may do is the OR of the permissions of the access route they came through and the
 * ones their membership grants, over a default that grants nothing. Both halves are decided here
 * and nowhere else, so a merge that turned into an AND, or a default that stopped denying, would
 * only surface in whichever endpoints the integration security suites happen to probe.
 */
class TestableRoomMemberService extends RoomMemberService {
	merge(first?: MeetRoomMemberPermissions, second?: MeetRoomMemberPermissions): MeetRoomMemberPermissions {
		return this.mergePermissions(first, second);
	}
}

const service = new TestableRoomMemberService(
	...(Array.from({ length: 11 }, () => ({})) as unknown as ConstructorParameters<typeof RoomMemberService>)
);

const none = service.getNoPermissions();

describe('RoomMemberService.getNoPermissions', () => {
	it('denies every permission there is', () => {
		expect(Object.keys(none).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
		expect(Object.entries(none).filter(([, granted]) => granted !== false)).toEqual([]);
	});
});

describe('RoomMemberService.mergePermissions', () => {
	it('grants what either source grants', () => {
		const merged = service.merge({ ...none, chatWrite: true }, { ...none, recordingPlay: true });

		expect(merged).toEqual({ ...none, chatWrite: true, recordingPlay: true });
	});

	it('denies what neither source grants', () => {
		expect(service.merge({ ...none, chatWrite: true }, { ...none, chatWrite: true })).toEqual({
			...none,
			chatWrite: true
		});
	});

	it('keeps the only source it is given', () => {
		const onlySource = { ...none, meetingJoin: true, meetingRead: true };

		expect(service.merge(onlySource, undefined)).toEqual(onlySource);
		expect(service.merge(undefined, onlySource)).toEqual(onlySource);
	});

	it('grants nothing when there is no source at all', () => {
		expect(service.merge(undefined, undefined)).toEqual(none);
	});
});

describe('RoomMemberService.updateRoomMember on a member in the meeting', () => {
	const ROOM_ID = 'room-abc';
	const MEMBER_ID = 'guest-abc';
	const all = service.getAllPermissions();
	const speaker: MeetRoomMemberPermissions = {
		...none,
		meetingJoin: true,
		mediaPublishVideo: true,
		mediaPublishAudio: true,
		chatRead: true,
		chatWrite: true
	};
	const roles = {
		[MeetRoomMemberRole.MODERATOR]: { permissions: all },
		[MeetRoomMemberRole.SPEAKER]: { permissions: speaker }
	} as unknown as MeetRoomRoles;

	let metadataInLiveKit: ParticipantMeetingMetadata;
	let getParticipant: jest.Mock<() => Promise<ParticipantInfo>>;
	let updateParticipant: jest.Mock<
		(
			roomId: string,
			identity: string,
			update: { metadata: string; permission: ParticipantInfo['permission'] }
		) => Promise<void>
	>;
	let sendParticipantPermissionsUpdatedSignal: jest.Mock<(roomId: string, identity: string) => Promise<void>>;
	let tokensRevokedAt: number | undefined;
	let memberService: RoomMemberService;

	const appliedUpdate = () => {
		const [, , { metadata, permission }] = updateParticipant.mock.calls[0]!;
		return { metadata: JSON.parse(metadata) as ParticipantMeetingMetadata, permission: permission! };
	};

	beforeEach(() => {
		metadataInLiveKit = {
			iat: 1,
			roomId: ROOM_ID,
			memberId: MEMBER_ID,
			permissions: speaker,
			badge: MeetRoomMemberUIBadge.OTHER
		};
		getParticipant = jest.fn(
			async () =>
				({
					identity: MEMBER_ID,
					name: 'Guest',
					metadata: JSON.stringify(metadataInLiveKit),
					permission: { canSubscribe: true }
				}) as unknown as ParticipantInfo
		);
		updateParticipant = jest.fn(async () => {});
		sendParticipantPermissionsUpdatedSignal = jest.fn(async () => {});
		tokensRevokedAt = undefined;

		memberService = new RoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} },
				{
					findByRoomAndMemberId: async () => ({
						baseRole: MeetRoomMemberRole.SPEAKER,
						customPermissions: {},
						effectivePermissions: speaker
					}),
					updatePartial: async () => ({})
				},
				{ getMeetRoom: async () => ({ roles, config: { chat: { enabled: true } } }) },
				{},
				{},
				{ sendParticipantPermissionsUpdatedSignal },
				{ getParticipant, updateParticipant },
				{},
				{},
				{},
				{},
				{},
				{
					isRevoked: async (
						_roomId: string,
						_identity: string,
						{ issuedAfterRevocation }: ParticipantMeetingMetadata
					) => tokensRevokedAt !== undefined && issuedAfterRevocation !== tokensRevokedAt,
					getTokenIssue: async () => ({ iat: Date.now() })
				},
				{ withRetryLock: (_key: string, _ttl: number, update: () => Promise<unknown>) => update() }
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('takes the camera out of their live grant without waiting for their client', async () => {
		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		const { metadata, permission } = appliedUpdate();
		expect(permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);
		expect(metadata.permissions).toEqual({ ...speaker, mediaPublishVideo: false });
		expect(sendParticipantPermissionsUpdatedSignal).toHaveBeenCalledWith(ROOM_ID, MEMBER_ID);
	});

	it('keeps a promoted member a moderator, with the new permissions as the ones a demotion restores', async () => {
		metadataInLiveKit = {
			...metadataInLiveKit,
			permissions: all,
			originalPermissions: speaker,
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		};

		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		const { metadata, permission } = appliedUpdate();
		expect(metadata).toMatchObject({
			permissions: all,
			originalPermissions: { ...speaker, mediaPublishVideo: false },
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		});
		expect(permission.canPublishSources).toContain(TrackSource.CAMERA);
	});

	// The media server hands the client a token built from the pushed metadata, which is what it reconnects with.
	it('stamps the metadata it pushes with the time of the push, so a reconnection with it is current', async () => {
		jest.spyOn(Date, 'now').mockReturnValue(5_000);

		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		expect(appliedUpdate().metadata.iat).toBe(5_000);
	});

	it('drops a promotion carried by a session that reconnected with a token issued before a demotion', async () => {
		metadataInLiveKit = {
			...metadataInLiveKit,
			permissions: all,
			originalPermissions: speaker,
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		};
		tokensRevokedAt = metadataInLiveKit.iat + 1;

		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		const { metadata, permission } = appliedUpdate();
		expect(metadata).toMatchObject({
			permissions: { ...speaker, mediaPublishVideo: false },
			badge: MeetRoomMemberUIBadge.OTHER
		});
		expect(metadata.isPromotedModerator).toBeUndefined();
		expect(permission.canPublishSources).toEqual([TrackSource.MICROPHONE]);
	});

	it('leaves the meeting alone when the effective permissions do not change', async () => {
		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { chatWrite: true } });

		expect(updateParticipant).not.toHaveBeenCalled();
		expect(sendParticipantPermissionsUpdatedSignal).not.toHaveBeenCalled();
	});

	it('leaves a member who is not in the meeting alone', async () => {
		getParticipant.mockRejectedValue(errorParticipantNotFound(MEMBER_ID, ROOM_ID));

		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		expect(updateParticipant).not.toHaveBeenCalled();
		expect(sendParticipantPermissionsUpdatedSignal).not.toHaveBeenCalled();
	});
});

// The renewal reads what the participant holds in the meeting, which a client replaces by reconnecting with an
// earlier token, so that metadata gets the checks of a token.
describe('RoomMemberService.refreshRoomMemberToken from the participant in the meeting', () => {
	const ROOM_ID = 'room-abc';
	const IDENTITY = 'speaker-1';
	const JOINED_AT = 1_000;
	const DEMOTED_AT = 2_000;
	const speaker: MeetRoomMemberPermissions = { ...none, meetingJoin: true, chatWrite: true };
	const redisStore = new Map<string, string>();
	let liveMetadata: ParticipantMeetingMetadata;
	let generateRoomMemberToken: jest.Mock<(options: { tokenMetadata: ParticipantMeetingMetadata }) => Promise<string>>;
	let memberService: RoomMemberService;

	beforeAll(() => {
		registerDependencies();
		container
			.rebind(RedisService)
			.toConstantValue({ get: async (key: string) => redisStore.get(key) ?? null } as unknown as RedisService);
		container.rebind(MutexService).toConstantValue({} as MutexService);
	});

	beforeEach(() => {
		const tokenService = container.get(TokenService);
		jest.spyOn(tokenService, 'verifyToken').mockResolvedValue({
			sub: IDENTITY,
			name: 'Ana',
			metadata: '{}'
		} as never);
		jest.spyOn(tokenService, 'parseRoomMemberTokenMetadata').mockReturnValue({
			iat: JOINED_AT,
			roomId: ROOM_ID
		} as never);
		jest.spyOn(container.get(RoomRepository), 'findByRoomId').mockResolvedValue({
			roomId: ROOM_ID,
			rolesUpdatedAt: 0,
			config: { chat: { enabled: true } }
		} as never);
		redisStore.set(`ov_meet:participant_tokens_revoked_at:${ROOM_ID}:${IDENTITY}`, String(DEMOTED_AT));
		generateRoomMemberToken = jest.fn(async () => 'renewed-token');

		memberService = new RoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} },
				{},
				{},
				{},
				{},
				{},
				{
					getParticipant: async () =>
						({ identity: IDENTITY, name: 'Ana', metadata: JSON.stringify(liveMetadata) }) as ParticipantInfo
				},
				{ generateRoomMemberToken },
				{},
				{},
				{},
				{},
				container.get(ParticipantTokenRevocationService),
				{ withRetryLock: (_key: string, _ttl: number, update: () => Promise<unknown>) => update() }
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('refuses to renew from a session that reconnected with the token it held before its demotion', async () => {
		liveMetadata = {
			iat: JOINED_AT,
			roomId: ROOM_ID,
			permissions: service.getAllPermissions(),
			originalPermissions: speaker,
			badge: MeetRoomMemberUIBadge.MODERATOR,
			isPromotedModerator: true
		};

		await expect(memberService.refreshRoomMemberToken(ROOM_ID, 'previous-token')).rejects.toMatchObject({
			statusCode: 401
		});
		expect(generateRoomMemberToken).not.toHaveBeenCalled();
	});

	it('renews from the metadata the demotion pushed', async () => {
		liveMetadata = {
			iat: DEMOTED_AT,
			issuedAfterRevocation: DEMOTED_AT,
			roomId: ROOM_ID,
			permissions: speaker,
			badge: MeetRoomMemberUIBadge.OTHER
		};

		await expect(memberService.refreshRoomMemberToken(ROOM_ID, 'previous-token')).resolves.toBe('renewed-token');
		expect(generateRoomMemberToken.mock.calls[0]![0].tokenMetadata).toMatchObject({
			permissions: speaker,
			badge: MeetRoomMemberUIBadge.OTHER
		});
	});
});

// A metadata update holds the participant's lock across a read and an update of the media server.
describe('the participant metadata lock', () => {
	it('outlasts the two media server requests it covers', () => {
		const requestsMs = 2 * INTERNAL_CONFIG.LIVEKIT_REQUEST_TIMEOUT_SECONDS * 1000;

		expect(ms(INTERNAL_CONFIG.PARTICIPANT_METADATA_LOCK_TTL)).toBeGreaterThan(requestsMs);
	});
});
