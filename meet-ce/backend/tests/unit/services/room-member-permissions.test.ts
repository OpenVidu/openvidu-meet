import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom, MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import {
	MEET_PERMISSION_KEYS,
	MeetWaitingRoomParticipantType,
	MeetWaitingRoomStatus,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	MeetRoomStatus,
	TrackSource
} from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
import ms from 'ms';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../../../src/config/internal-config.js';
import type { ParticipantMeetingMetadata } from '../../../src/helpers/participant.helper.js';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import { errorParticipantNotFound } from '../../../src/models/error.model.js';
import type {
	WaitingRoomEntry,
	WaitingRoomReturnResult,
	WaitingRoomTicketChange,
	WaitingRoomWait
} from '../../../src/models/waiting-room.model.js';
import { RoomRepository } from '../../../src/repositories/room.repository.js';
import { WaitingRoomAdmissionPolicy } from '../../../src/services/waiting-room/waiting-room-admission.policy.js';
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

	apply(
		roomId: string,
		identity: string,
		room: Pick<MeetRoom, 'roles' | 'config'>,
		buildMetadata: (current: ParticipantMeetingMetadata) => ParticipantMeetingMetadata,
		refusedIssuedBefore?: number
	) {
		return this.applyPermissionsToLiveParticipant(roomId, identity, room, buildMetadata, refusedIssuedBefore);
	}
}

const service = new TestableRoomMemberService(
	...(Array.from({ length: 11 }, () => ({})) as unknown as ConstructorParameters<typeof RoomMemberService>)
);

const none = MeetRoomMemberHelper.noPermissions();

describe('MeetRoomMemberHelper.noPermissions', () => {
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
	const all = MeetRoomMemberHelper.allPermissions();
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
		jest.spyOn(tokenService, 'generateRoomMemberToken').mockImplementation(generateRoomMemberToken as never);

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
				tokenService,
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
			permissions: MeetRoomMemberHelper.allPermissions(),
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

// The renewal of a token from the participant in the meeting (refresh mode of the token endpoint) must not turn the
// metadata of a session that connected with an earlier token into a valid one; a push of the server must still reach it.
describe('RoomMemberService.applyPermissionsToLiveParticipant on a session issued before a revocation or a room change', () => {
	const ROOM_ID = 'room-abc';
	const IDENTITY = 'speaker-1';
	const ROOM_UPDATED_AT = 2_000;
	const speaker: MeetRoomMemberPermissions = { ...none, meetingJoin: true, chatWrite: true };
	const room = {
		roles: {
			[MeetRoomMemberRole.MODERATOR]: { permissions: MeetRoomMemberHelper.allPermissions() },
			[MeetRoomMemberRole.SPEAKER]: { permissions: speaker }
		},
		config: { chat: { enabled: true } }
	} as unknown as Pick<MeetRoom, 'roles' | 'config'>;

	let liveMetadata: ParticipantMeetingMetadata;
	let revoked: boolean;
	let updateParticipant: jest.Mock<(roomId: string, identity: string, update: { metadata: string }) => Promise<void>>;
	let memberService: TestableRoomMemberService;

	const renew = (refusedIssuedBefore?: number) =>
		memberService.apply(
			ROOM_ID,
			IDENTITY,
			room,
			(current) => ({ ...current, permissions: speaker }),
			refusedIssuedBefore
		);

	beforeEach(() => {
		revoked = false;
		liveMetadata = { iat: 3_000, roomId: ROOM_ID, permissions: speaker, badge: MeetRoomMemberUIBadge.OTHER };
		updateParticipant = jest.fn(async () => {});

		memberService = new TestableRoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} },
				{},
				{},
				{},
				{},
				{},
				{
					getParticipant: async () =>
						({
							identity: IDENTITY,
							metadata: JSON.stringify(liveMetadata),
							permission: { canSubscribe: true }
						}) as unknown as ParticipantInfo,
					updateParticipant
				},
				{},
				{},
				{},
				{},
				{},
				{ isRevoked: async () => revoked, getTokenIssue: async () => ({ iat: 4_000 }) },
				{ withRetryLock: (_key: string, _ttl: number, update: () => Promise<unknown>) => update() }
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	it('refuses to renew a session revoked after its token was issued', async () => {
		revoked = true;

		await expect(renew(ROOM_UPDATED_AT)).rejects.toMatchObject({ statusCode: 401 });
		expect(updateParticipant).not.toHaveBeenCalled();
	});

	it('refuses to renew a session issued before the last update of the room', async () => {
		liveMetadata.iat = ROOM_UPDATED_AT - 1;

		await expect(renew(ROOM_UPDATED_AT)).rejects.toMatchObject({ statusCode: 401 });
		expect(updateParticipant).not.toHaveBeenCalled();
	});

	it('renews a session issued after the last update of the room and not revoked, a demoted one included', async () => {
		await renew(ROOM_UPDATED_AT);

		expect(updateParticipant).toHaveBeenCalledTimes(1);
		expect(JSON.parse(updateParticipant.mock.calls[0]![2].metadata)).toMatchObject({ iat: 4_000 });
	});

	it('still pushes a change of the member to a session the renewal would refuse', async () => {
		revoked = true;
		liveMetadata.iat = ROOM_UPDATED_AT - 1;

		await renew();

		expect(updateParticipant).toHaveBeenCalledTimes(1);
	});
});

// A metadata update holds the participant's lock across a read and an update of the media server.
describe('the participant metadata lock', () => {
	it('outlasts the two media server requests it covers', () => {
		const requestsMs = 2 * INTERNAL_CONFIG.LIVEKIT_REQUEST_TIMEOUT_SECONDS * 1000;

		expect(ms(INTERNAL_CONFIG.PARTICIPANT_METADATA_LOCK_TTL)).toBeGreaterThan(requestsMs);
	});
});

// A participant the waiting room applies to gets a ticket, not a token, and the ticket is answered by the state
// of its wait. Only an admission, used right before the token is minted, yields a token.
describe('RoomMemberService.generateRoomMemberToken in a room with the waiting room on', () => {
	const ROOM_ID = 'room-waiting-room';
	const TICKET = 'ticket-1';
	const speaker: MeetRoomMemberPermissions = { ...none, meetingJoin: true };

	class JoinStepsRoomMemberService extends RoomMemberService {
		source: { memberId?: string; permissions: MeetRoomMemberPermissions } = { permissions: speaker };

		protected override async resolvePermissionSourceFromSecret() {
			return this.source;
		}
	}

	let steps: string[];
	let waitingRoomEnabled: boolean;
	let connected: number;
	let wait: WaitingRoomWait | null;
	let consumed: WaitingRoomTicketChange;
	let returned: WaitingRoomReturnResult;
	let memberService: JoinStepsRoomMemberService;

	const entry = { waitId: 'wait-1', participantIdentity: 'ana-1' } as WaitingRoomEntry;
	const waitOf = (status: MeetWaitingRoomStatus, ended = false, principal?: string): WaitingRoomWait => ({
		waitId: 'wait-1',
		roomId: ROOM_ID,
		participant: {
			participantIdentity: 'ana-1',
			participantName: 'Ana',
			type: MeetWaitingRoomParticipantType.ANONYMOUS,
			externalId: 'ext-1',
			knockDate: 1,
			roomName: 'Room'
		},
		...(principal && { principal }),
		status,
		ended
	});
	const join = (options: { waitingRoomTicket?: string; participantName?: string } = {}, previousToken?: string) =>
		memberService.generateRoomMemberToken(
			ROOM_ID,
			{ secret: 'link', joinMeeting: true, participantName: 'Ana', ...options },
			previousToken
		);

	beforeEach(() => {
		steps = [];
		waitingRoomEnabled = true;
		connected = 0;
		wait = null;
		consumed = { entry };
		returned = { entry, line: { now: 0, from: 1, waiting: [] } };
		const room = () => ({
			roomId: ROOM_ID,
			roomName: 'Room',
			status: MeetRoomStatus.OPEN,
			roles: { moderator: { permissions: MeetRoomMemberHelper.allPermissions() } },
			config: {
				waitingRoom: { enabled: waitingRoomEnabled },
				e2ee: { enabled: false },
				chat: { enabled: true },
				maxParticipants: 2
			},
			rolesUpdatedAt: 0
		});

		memberService = new JoinStepsRoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} },
				{},
				{
					getMeetRoom: async () => room(),
					createLivekitRoom: async () => steps.push('createRoom')
				},
				{},
				{
					reserveUniqueName: async (_roomId: string, name: string) => {
						steps.push(`reserve:${name}`);
						return name;
					}
				},
				{},
				{},
				{
					generateRoomMemberToken: async (options: {
						participantIdentity: string;
						tokenMetadata: object;
					}) => {
						steps.push(`mint:${options.participantIdentity}`);
						return 'join-token';
					}
				},
				{ getAuthenticatedUser: () => undefined },
				{ countStandardParticipants: async () => connected },
				{},
				{},
				{ getTokenIssue: async () => ({}) },
				{},
				{
					knock: async (_room: object, request: { participantIdentity: string; memberId?: string }) => {
						steps.push(`knock:${request.memberId ?? 'anonymous'}`);
						return {
							waitingRoomTicket: TICKET,
							participant: { participantIdentity: request.participantIdentity }
						};
					},
					ticketOf: (waitingRoomTicket: string, participant: object) => ({ waitingRoomTicket, participant }),
					findWait: async () => wait,
					consume: async () => {
						steps.push('consume');
						return consumed;
					},
					returnToLine: async () => {
						steps.push('return');
						return returned;
					}
				},
				new WaitingRoomAdmissionPolicy()
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
	});

	it('answers a ticket to a participant without waitingRoomBypass, reserving, creating and minting nothing', async () => {
		memberService.source = { memberId: 'guest-1', permissions: speaker };

		await expect(join()).resolves.toEqual({
			waitingRoomTicket: TICKET,
			participant: { participantIdentity: 'guest-1' }
		});
		expect(steps).toEqual(['knock:guest-1']);
	});

	it('gives a holder of waitingRoomBypass a join token at once', async () => {
		memberService.source = { permissions: { ...speaker, waitingRoomBypass: true } };

		await expect(join()).resolves.toEqual({ token: 'join-token' });
		expect(steps).toEqual(['reserve:Ana', 'createRoom', expect.stringMatching(/^mint:ana-/)]);
	});

	it('still asks for a name and for meetingJoin before a participant waits', async () => {
		await expect(join({ participantName: '' })).rejects.toMatchObject({ statusCode: 400 });

		memberService.source = { permissions: none };
		await expect(join()).rejects.toMatchObject({ statusCode: 403 });
		expect(steps).toEqual([]);
	});

	it('answers the same ticket while the wait goes on, ignoring a previous token', async () => {
		wait = waitOf(MeetWaitingRoomStatus.WAITING);

		await expect(join({ waitingRoomTicket: TICKET }, 'previous-token')).resolves.toEqual({
			waitingRoomTicket: TICKET,
			participant: expect.objectContaining({ participantIdentity: 'ana-1' })
		});
		expect(steps).toEqual([]);
	});

	it('joins an admitted participant with the identity of the wait, using the admission right before minting', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED);

		await expect(join({ waitingRoomTicket: TICKET })).resolves.toEqual({ token: 'join-token' });
		expect(steps).toEqual(['reserve:Ana', 'createRoom', 'consume', 'mint:ana-1']);
	});

	it('puts an admitted participant who finds the meeting full back in line', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED);
		connected = 2;

		await expect(join({ waitingRoomTicket: TICKET })).resolves.toEqual({
			waitingRoomTicket: TICKET,
			participant: expect.objectContaining({ participantIdentity: 'ana-1' })
		});
		expect(steps).toEqual(['return']);
	});

	it.each([
		['the meeting is full and the wait ended before it went back in line', 2, 'return'],
		['the wait ended before its admission was used', 0, 'consume']
	])('answers 409 with the recorded status when %s', async (_case, connectedCount, step) => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED);
		connected = connectedCount;
		returned = { status: MeetWaitingRoomStatus.LEFT };
		consumed = { status: MeetWaitingRoomStatus.LEFT };

		await expect(join({ waitingRoomTicket: TICKET })).rejects.toMatchObject({
			statusCode: 409,
			fields: { status: MeetWaitingRoomStatus.LEFT }
		});
		expect(steps).toContain(step);
		expect(steps.filter((name) => name.startsWith('mint'))).toEqual([]);
	});

	it('answers the usual access error to an admitted participant who lost meetingJoin, leaving the wait as it is', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED);
		memberService.source = { permissions: none };

		await expect(join({ waitingRoomTicket: TICKET })).rejects.toMatchObject({ statusCode: 403 });
		expect(steps).toEqual([]);
	});

	it('refuses a ticket presented with the credential of another principal', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED, false, 'guest-1');
		memberService.source = { memberId: 'guest-2', permissions: speaker };

		await expect(join({ waitingRoomTicket: TICKET })).rejects.toMatchObject({ statusCode: 403 });
		expect(steps).toEqual([]);
	});

	it.each([
		['ended otherwise', waitOf(MeetWaitingRoomStatus.REJECTED, true), MeetWaitingRoomStatus.REJECTED],
		['unknown', null, undefined],
		['of another room', { ...waitOf(MeetWaitingRoomStatus.WAITING), roomId: 'other-room' }, undefined]
	])('answers 409 to a ticket whose wait is %s, never starting a new one', async (_case, found, status) => {
		wait = found;

		const error = await join({ waitingRoomTicket: TICKET }).catch((refusal: unknown) => refusal);

		expect(error).toMatchObject({ statusCode: 409, message: 'The wait has ended' });
		expect((error as { fields: { status?: MeetWaitingRoomStatus } }).fields.status).toBe(status);
		expect(steps).toEqual([]);
	});

	it('answers 409 with status admitted to a wait already let in while the gate still applies', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED, true);

		await expect(join({ waitingRoomTicket: TICKET })).rejects.toMatchObject({
			statusCode: 409,
			fields: { status: MeetWaitingRoomStatus.ADMITTED }
		});
		expect(steps).toEqual([]);
	});

	it('joins a wait let in by turning the waiting room off as an ordinary join with its identity', async () => {
		wait = waitOf(MeetWaitingRoomStatus.ADMITTED, true);
		waitingRoomEnabled = false;

		await expect(join({ waitingRoomTicket: TICKET })).resolves.toEqual({ token: 'join-token' });
		expect(steps).toEqual(['reserve:Ana', 'createRoom', 'mint:ana-1']);
	});
});
