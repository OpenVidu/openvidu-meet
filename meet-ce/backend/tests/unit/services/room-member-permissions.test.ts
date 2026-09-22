import { describe, expect, it } from '@jest/globals';
import type { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
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
