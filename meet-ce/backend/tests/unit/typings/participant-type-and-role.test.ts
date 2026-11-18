import { describe, expect, it } from '@jest/globals';
import {
	MeetParticipantType,
	MeetRoomMemberRole,
	MeetRoomMemberUIBadge,
	participantRoleOf,
	participantTypeOf
} from '@openvidu-meet/typings';

describe('participantTypeOf', () => {
	it('tells the participant type from the credential, a user first', () => {
		expect(participantTypeOf({ userId: 'alice', memberId: 'alice' })).toBe(MeetParticipantType.USER);
		expect(participantTypeOf({ memberId: 'guest-1' })).toBe(MeetParticipantType.IDENTIFIED_GUEST);
		expect(participantTypeOf({})).toBe(MeetParticipantType.ANONYMOUS);
	});
});

describe('participantRoleOf', () => {
	it('maps the OTHER badge or none to speaker and every privileged badge to moderator', () => {
		expect(participantRoleOf(undefined)).toBe(MeetRoomMemberRole.SPEAKER);
		expect(participantRoleOf(MeetRoomMemberUIBadge.OTHER)).toBe(MeetRoomMemberRole.SPEAKER);
		expect(participantRoleOf(MeetRoomMemberUIBadge.MODERATOR)).toBe(MeetRoomMemberRole.MODERATOR);
		expect(participantRoleOf(MeetRoomMemberUIBadge.ADMIN)).toBe(MeetRoomMemberRole.MODERATOR);
		expect(participantRoleOf(MeetRoomMemberUIBadge.OWNER)).toBe(MeetRoomMemberRole.MODERATOR);
	});
});
