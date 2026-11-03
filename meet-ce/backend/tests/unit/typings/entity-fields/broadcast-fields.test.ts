import { describe, expect, it } from '@jest/globals';
import { MEET_BROADCAST_FIELDS, MeetBroadcastInfo } from '@openvidu-meet/typings';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('MeetBroadcastInfo fields list', () => {
	it('should include all MeetBroadcastInfo properties', () => {
		const assertMeetBroadcastFieldsCoverage: AssertReadonlyArrayCoversUnion<
			keyof MeetBroadcastInfo,
			typeof MEET_BROADCAST_FIELDS
		> = true;
		expect(assertMeetBroadcastFieldsCoverage).toBe(true);
	});
});
