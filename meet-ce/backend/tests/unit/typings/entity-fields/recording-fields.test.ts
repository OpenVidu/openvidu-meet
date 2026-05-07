import { describe, expect, it } from '@jest/globals';
import { MEET_RECORDING_FIELDS, MeetRecordingInfo } from '@openvidu-meet/typings';
import { AssertReadonlyArrayCoversUnion } from '../type-assertions.utils.js';

describe('MeetRecordingInfo fields list', () => {
	it('should include all MeetRecordingInfo properties', () => {
		const assertMeetRecordingFieldsCoverage: AssertReadonlyArrayCoversUnion<
			keyof MeetRecordingInfo,
			typeof MEET_RECORDING_FIELDS
		> = true;
		expect(assertMeetRecordingFieldsCoverage).toBe(true);
	});
});
