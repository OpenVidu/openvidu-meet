import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoomMemberPermissions, MeetRoomRoles } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS, MeetRoomMemberRole, MeetRoomMemberUIBadge, TrackSource } from '@openvidu-meet/typings';
import type { ParticipantInfo } from 'livekit-server-sdk';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import type { ParticipantMeetingMetadata } from '../../../src/helpers/participant.helper.js';
import { errorParticipantNotFound } from '../../../src/models/error.model.js';
import { RoomMemberService } from '../../../src/services/room-member.service.js';

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

		memberService = new RoomMemberService(
			...([
				{ warn: () => {}, debug: () => {}, verbose: () => {} },
				{
					findByRoomAndMemberId: async () => ({
						baseRole: MeetRoomMemberRole.SPEAKER,
						customPermissions: {}
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
				{},
				{ withRetryLock: (_key: string, _ttl: number, update: () => Promise<unknown>) => update() }
			] as unknown as ConstructorParameters<typeof RoomMemberService>)
		);
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

	it('leaves a member who is not in the meeting alone', async () => {
		getParticipant.mockRejectedValue(errorParticipantNotFound(MEMBER_ID, ROOM_ID));

		await memberService.updateRoomMember(ROOM_ID, MEMBER_ID, { customPermissions: { mediaPublishVideo: false } });

		expect(updateParticipant).not.toHaveBeenCalled();
		expect(sendParticipantPermissionsUpdatedSignal).not.toHaveBeenCalled();
	});
});
