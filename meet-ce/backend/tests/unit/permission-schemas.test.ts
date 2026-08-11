import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS } from '@openvidu-meet/typings';
import {
	MeetPermissionsSchema,
	MeetTokenPermissionsSchema,
	PartialMeetPermissionsSchema
} from '../../src/models/zod-schemas/room-member.schema.js';

const fullDeprecatedInput = {
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

const fullCurrentInput = {
	recordingControl: true,
	recordingList: true,
	recordingPlay: true,
	recordingDownload: true,
	recordingDelete: false,
	meetingJoin: true,
	roomShareAccessLinks: false,
	participantPromote: false,
	participantKick: false,
	meetingEnd: false,
	mediaPublishVideo: true,
	mediaPublishAudio: true,
	mediaShareScreen: true,
	chatRead: true,
	chatWrite: true,
	mediaChangeVirtualBackground: true
};

/**
 * Contract of the permission schemas per MEET_MODE: in `compatibility` (the default) any mix of key
 * sets is accepted and contradictions fail validation; with `'3.9.0'` a deprecated key is rejected
 * naming its replacement. Completeness only applies to the full schemas, and the parsed output is
 * always keyed with the current names. Removed in 3.12.0 together with the compatibility mode.
 */
describe('MeetPermissionsSchema (full, compatibility mode)', () => {
	it('should accept a full deprecated input and normalize it to the 16 current keys', () => {
		const result = MeetPermissionsSchema.safeParse(fullDeprecatedInput);
		expect(result.success).toBe(true);

		const parsed = result.data!;
		expect(Object.keys(parsed).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
		expect(parsed.recordingControl).toBe(true);
		// The split deprecated flag granted the whole group.
		expect(parsed.recordingList).toBe(true);
		expect(parsed.recordingPlay).toBe(true);
		expect(parsed.recordingDownload).toBe(true);
		expect(parsed.recordingDelete).toBe(false);
	});

	it('should accept a consistent mix and let the current key refine its group', () => {
		const result = MeetPermissionsSchema.safeParse({ ...fullDeprecatedInput, recordingDownload: true });
		expect(result.success).toBe(true);
		expect(result.data!.recordingDownload).toBe(true);
	});

	it('should reject a contradicting alias pair, citing the deprecated key', () => {
		const result = MeetPermissionsSchema.safeParse({
			...fullDeprecatedInput,
			canRecord: false,
			recordingControl: true
		});
		expect(result.success).toBe(false);
		expect(result.error!.issues.some((issue) => issue.path.includes('canRecord'))).toBe(true);
	});

	it('should reject an incomplete permission set, pointing at the missing current key', () => {
		const { canReadChat: _dropped, ...incomplete } = fullDeprecatedInput;
		const result = MeetPermissionsSchema.safeParse(incomplete);
		expect(result.success).toBe(false);
		expect(result.error!.issues.some((issue) => issue.path.includes('chatRead'))).toBe(true);
	});

	it('should reject a non-boolean value under either spelling', () => {
		expect(MeetPermissionsSchema.safeParse({ ...fullDeprecatedInput, canRecord: 'yes' }).success).toBe(false);
		expect(MeetPermissionsSchema.safeParse({ ...fullDeprecatedInput, recordingControl: 'yes' }).success).toBe(
			false
		);
	});
});

describe('PartialMeetPermissionsSchema (partial, compatibility mode)', () => {
	it('should accept a partial deprecated input and normalize the keys it carries', () => {
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

describe("Permission schemas with MEET_MODE '3.9.0'", () => {
	beforeAll(() => {
		process.env.MEET_MODE = '3.9.0';
	});

	afterAll(() => {
		delete process.env.MEET_MODE;
	});

	it('should accept a full current-keyed input', () => {
		const result = MeetPermissionsSchema.safeParse(fullCurrentInput);
		expect(result.success).toBe(true);
		expect(result.data).toEqual(fullCurrentInput);
	});

	it('should reject a deprecated key naming its replacement', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ canRecord: true });
		expect(result.success).toBe(false);

		const issue = result.error!.issues.find((candidate) => candidate.path.includes('canRecord'));
		expect(issue).toBeDefined();
		expect(issue!.message).toContain('recordingControl');
	});

	it('should reject the deprecated split flag naming the whole replacement group', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ canRetrieveRecordings: true });
		expect(result.success).toBe(false);

		const issue = result.error!.issues.find((candidate) => candidate.path.includes('canRetrieveRecordings'));
		expect(issue).toBeDefined();
		expect(issue!.message).toContain('recordingList');
		expect(issue!.message).toContain('recordingPlay');
		expect(issue!.message).toContain('recordingDownload');
	});

	it('should reject a deprecated key even when its replacement is present and agrees', () => {
		const result = PartialMeetPermissionsSchema.safeParse({ canRecord: true, recordingControl: true });
		expect(result.success).toBe(false);
	});

	it('should keep normalizing deprecated keys in token metadata (tokens are not API requests)', () => {
		// A token issued before the deployment switched modes still carries the deprecated keys;
		// rejecting it would kick every ongoing meeting.
		const result = MeetTokenPermissionsSchema.safeParse(fullDeprecatedInput);
		expect(result.success).toBe(true);
		expect(result.data!.recordingControl).toBe(true);
		expect(Object.keys(result.data!).sort()).toEqual([...MEET_PERMISSION_KEYS].sort());
	});
});
