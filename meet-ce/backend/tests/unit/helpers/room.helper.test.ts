import { describe, expect, it } from '@jest/globals';
import type { MeetRoom, MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import type { Room } from 'livekit-server-sdk';
import { MeetRoomMemberHelper } from '../../../src/helpers/room-member.helper.js';
import { MeetRoomHelper } from '../../../src/helpers/room.helper.js';

describe('MeetRoomHelper.meetingRemainingMs', () => {
	// LiveKit reports the room creation time in seconds
	const creationTimeSeconds = 1_700_000_000;
	const creationTimeMs = creationTimeSeconds * 1000;
	const room = (metadata?: string) => ({ creationTime: creationTimeSeconds, metadata }) as unknown as Room;

	describe('with the deadline in the room metadata', () => {
		const withEndDate = (endDate: number) =>
			room(JSON.stringify({ createdBy: 'openvidu-meet', endDate, roomOptions: {} }));

		it('should report the time left before the deadline', () => {
			const endDate = creationTimeMs + 60 * 60_000;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, creationTimeMs)).toBe(60 * 60_000);
			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, endDate - 5 * 60_000)).toBe(5 * 60_000);
		});

		it('should report zero exactly at the deadline', () => {
			const endDate = creationTimeMs + 60 * 60_000;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, endDate)).toBe(0);
		});

		it('should ignore the limit counted from the creation time', () => {
			// The clock starts when Meet creates the room, seconds before LiveKit stamps its own
			// creation time, so the two deadlines are close but not identical: the shared one wins.
			const endDate = creationTimeMs + 60 * 60_000 + 1_500;

			expect(MeetRoomHelper.meetingRemainingMs(withEndDate(endDate), 60, creationTimeMs)).toBe(
				60 * 60_000 + 1_500
			);
		});
	});

	describe('without a deadline in the room metadata', () => {
		it('should fall back to the limit counted from the creation time', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs)).toBe(60 * 60_000);
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs + 55 * 60_000)).toBe(5 * 60_000);
		});

		it('should report zero exactly at the deadline', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 60, creationTimeMs + 60 * 60_000)).toBe(0);
		});

		it('should report a negative value past the deadline', () => {
			expect(MeetRoomHelper.meetingRemainingMs(room(), 1, creationTimeMs + 2 * 60_000)).toBe(-60_000);
		});

		it('should fall back for a room LiveKit auto-created without metadata', () => {
			const autoCreated = room('');

			expect(MeetRoomHelper.meetingRemainingMs(autoCreated, 60, creationTimeMs)).toBe(60 * 60_000);
		});
	});
});

describe('MeetRoomHelper.sanitizeRoomId', () => {
	it('keeps only letters, digits, hyphens and underscores', () => {
		expect(MeetRoomHelper.sanitizeRoomId('a b/c_d-1!')).toBe('abc_d-1');
	});
});

describe('MeetRoomHelper anonymous link disclosure', () => {
	const moderatorPermissions = MeetRoomMemberHelper.allPermissions();
	const speakerPermissions: MeetRoomMemberPermissions = {
		...MeetRoomMemberHelper.noPermissions(),
		recordingList: true,
		recordingPlay: true,
		recordingDownload: true,
		meetingJoin: true,
		meetingRead: true,
		participantReactionSend: true,
		mediaPublishVideo: true,
		mediaPublishAudio: true,
		mediaShareScreen: true,
		chatRead: true,
		chatWrite: true,
		mediaChangeVirtualBackground: true
	};
	const room = (): Partial<MeetRoom> => ({
		roomId: 'room-1',
		roles: {
			moderator: { permissions: moderatorPermissions },
			speaker: { permissions: speakerPermissions }
		},
		access: {
			anonymous: {
				moderator: { enabled: true, url: '/room/room-1?secret=mod' },
				speaker: { enabled: true, url: '/room/room-1?secret=spk' },
				recording: { enabled: false, url: '/room/room-1/recordings?secret=rec' }
			},
			user: { enabled: true, url: '/room/room-1' }
		}
	});
	const linksReturnedTo = (permissions: MeetRoomMemberPermissions, filteredRoom = room()) => {
		const { anonymous } = MeetRoomHelper.applyPermissionFiltering(filteredRoom, permissions).access!;
		return (['moderator', 'speaker', 'recording'] as const).filter((link) => anonymous[link].url !== undefined);
	};

	describe('grantsWithin', () => {
		it('should accept a link that grants a subset of the holder permissions', () => {
			expect(MeetRoomMemberHelper.grantsWithin(speakerPermissions, moderatorPermissions)).toBe(true);
			expect(MeetRoomMemberHelper.grantsWithin(speakerPermissions, speakerPermissions)).toBe(true);
		});

		it('should refuse a link that grants a permission the holder lacks', () => {
			expect(MeetRoomMemberHelper.grantsWithin(moderatorPermissions, speakerPermissions)).toBe(false);
			expect(
				MeetRoomMemberHelper.grantsWithin(speakerPermissions, { ...speakerPermissions, chatWrite: false })
			).toBe(false);
		});

		it('should refuse a link whose permission is missing from the holder set', () => {
			const { participantReactionSend: _omitted, ...holder } = speakerPermissions;

			expect(MeetRoomMemberHelper.grantsWithin(speakerPermissions, holder as MeetRoomMemberPermissions)).toBe(
				false
			);
		});

		it('should accept any link for a holder of every permission', () => {
			expect(MeetRoomMemberHelper.grantsWithin(moderatorPermissions, MeetRoomMemberHelper.allPermissions())).toBe(
				true
			);
		});
	});

	describe('applyPermissionFiltering', () => {
		it('should return the three links to the default moderator', () => {
			expect(linksReturnedTo(moderatorPermissions)).toEqual(['moderator', 'speaker', 'recording']);
		});

		it('should return every link to a holder of every permission', () => {
			expect(linksReturnedTo(MeetRoomMemberHelper.allPermissions())).toEqual([
				'moderator',
				'speaker',
				'recording'
			]);
		});

		it('should return no link without roomShareAccessLinks', () => {
			expect(linksReturnedTo(speakerPermissions)).toEqual([]);
			expect(linksReturnedTo({ ...moderatorPermissions, roomShareAccessLinks: false })).toEqual([]);
		});

		it('should return the speaker and recordings links, not the moderator one, to a speaker allowed to share', () => {
			expect(linksReturnedTo({ ...speakerPermissions, roomShareAccessLinks: true })).toEqual([
				'speaker',
				'recording'
			]);
		});

		it('should drop the moderator link for a moderator member denied one of its permissions', () => {
			expect(linksReturnedTo({ ...moderatorPermissions, participantKick: false })).toEqual([
				'speaker',
				'recording'
			]);
		});

		it('should drop the speaker link for a holder below the speaker role', () => {
			const holder = { ...speakerPermissions, roomShareAccessLinks: true, chatWrite: false };

			expect(linksReturnedTo(holder)).toEqual(['recording']);
		});

		it('should drop the recordings link for a holder without every recording read permission', () => {
			const holder = { ...moderatorPermissions, recordingDownload: false };

			expect(linksReturnedTo(holder)).toEqual([]);
		});

		it('should drop every link when the room carries no roles', () => {
			const { roles: _roles, ...withoutRoles } = room();

			expect(linksReturnedTo(moderatorPermissions, withoutRoles)).toEqual([]);
		});

		it('should keep every enabled flag and the user access link', () => {
			const { access } = MeetRoomHelper.applyPermissionFiltering(room(), MeetRoomMemberHelper.noPermissions());

			expect(access).toEqual({
				anonymous: { moderator: { enabled: true }, speaker: { enabled: true }, recording: { enabled: false } },
				user: { enabled: true, url: '/room/room-1' }
			});
		});

		it('should not change the room it filters', () => {
			const original = room();

			MeetRoomHelper.applyPermissionFiltering(original, MeetRoomMemberHelper.noPermissions());

			expect(original).toEqual(room());
		});

		it('should leave a room projected without access unchanged', () => {
			expect(MeetRoomHelper.applyPermissionFiltering({ roomName: 'r' }, moderatorPermissions)).toEqual({
				roomName: 'r'
			});
		});
	});

	describe('anonymousLinkPermissions', () => {
		it('should grant the role permissions through the moderator and speaker links', () => {
			const { roles } = room();

			expect(MeetRoomHelper.anonymousLinkPermissions('moderator', roles!)).toBe(moderatorPermissions);
			expect(MeetRoomHelper.anonymousLinkPermissions('speaker', roles!)).toBe(speakerPermissions);
		});

		it('should grant only the recording read permissions through the recordings link', () => {
			expect(MeetRoomHelper.anonymousLinkPermissions('recording', room().roles!)).toEqual(
				MeetRoomMemberHelper.recordingReadOnlyPermissions()
			);
		});
	});

	describe('shouldApplyPermissionFilteringForFields', () => {
		it('should filter a projection that carries access', () => {
			expect(MeetRoomHelper.shouldApplyPermissionFilteringForFields(['roomName', 'access'])).toBe(true);
		});

		it('should not filter a projection without access', () => {
			expect(MeetRoomHelper.shouldApplyPermissionFilteringForFields(['roomName', 'roles'])).toBe(false);
		});
	});
});
