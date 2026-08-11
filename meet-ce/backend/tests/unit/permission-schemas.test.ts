import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import {
	MeetPermissionsSchema,
	PartialMeetPermissionsSchema
} from '../../src/models/zod-schemas/room-member.schema.js';

const fullLegacyInput = {
	canRecord: true,
	canRetrieveRecordings: true,
	canDeleteRecordings: false,
	canJoinMeeting: true,
	canShareAccessLinks: false,
	canMakeModerator: false,
	canKickParticipants: false,
	canEndMeeting: false,
	canPublishVideo: true,
	canPublishAudio: true,
	canShareScreen: true,
	canReadChat: true,
	canWriteChat: true,
	canChangeVirtualBackground: true
};

/**
 * D2 contract of the dual permission schemas: any mix of key sets is accepted, contradictions fail
 * validation, completeness only applies to the full schema, and the parsed output is always
 * canonical. Removed in 3.12.0 together with the aliases.
 */
describe('MeetPermissionsSchema (full, dual naming)', () => {
	it('should accept a full legacy input and normalize it to the 16 canonical keys', () => {
		const result = MeetPermissionsSchema.safeParse(fullLegacyInput);
		expect(result.success).toBe(true);

		const parsed = result.data!;
		expect(Object.keys(parsed).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
		expect(parsed.recordingControl).toBe(true);
		// The split legacy flag granted the whole group.
		expect(parsed.recordingList).toBe(true);
		expect(parsed.recordingPlay).toBe(true);
		expect(parsed.recordingDownload).toBe(true);
		expect(parsed.recordingDelete).toBe(false);
	});

	it('should accept a consistent mix and let the canonical key refine its group', () => {
		const result = MeetPermissionsSchema.safeParse({ ...fullLegacyInput, recordingDownload: true });
		expect(result.success).toBe(true);
		expect(result.data!.recordingDownload).toBe(true);
	});

	it('should reject a contradicting alias pair, citing the legacy key', () => {
		const result = MeetPermissionsSchema.safeParse({
			...fullLegacyInput,
			canRecord: false,
			recordingControl: true
		});
		expect(result.success).toBe(false);
		expect(result.error!.issues.some((issue) => issue.path.includes('canRecord'))).toBe(true);
	});

	it('should reject an incomplete permission set, pointing at the missing canonical key', () => {
		const { canReadChat: _dropped, ...incomplete } = fullLegacyInput;
		const result = MeetPermissionsSchema.safeParse(incomplete);
		expect(result.success).toBe(false);
		expect(result.error!.issues.some((issue) => issue.path.includes('chatRead'))).toBe(true);
	});

	it('should reject a non-boolean value under either spelling', () => {
		expect(MeetPermissionsSchema.safeParse({ ...fullLegacyInput, canRecord: 'yes' }).success).toBe(false);
		expect(MeetPermissionsSchema.safeParse({ ...fullLegacyInput, recordingControl: 'yes' }).success).toBe(false);
	});
});

describe('PartialMeetPermissionsSchema (partial, dual naming)', () => {
	it('should accept a partial legacy input and normalize the keys it carries', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ canRecord: true, canWriteChat: false });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ recordingControl: true, chatWrite: false });
	});

	it('should expand a partial split flag to its whole group', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ canRetrieveRecordings: true });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ recordingList: true, recordingPlay: true, recordingDownload: true });
	});

	it('should not require completeness', () => {
		const result = PartialMeetPermissionsSchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.data).toEqual({});
	});

	it('should reject contradictions just like the full schema', () => {
		const result = PartialMeetPermissionsSchema.safeParse({
			canRetrieveRecordings: true,
			recordingDownload: false
		});
		expect(result.success).toBe(false);
	});

	it('should drop unknown keys silently', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ somethingElse: true, chatRead: true });
		expect(result.success).toBe(true);
		expect(result.data).toEqual({ chatRead: true });
	});
});
