import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetReaction } from '@openvidu-meet/typings';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	LowerAllHandsReqSchema,
	MuteParticipantMediaReqSchema,
	SendParticipantReactionReqSchema,
	UpdateParticipantHandReqSchema,
	UpdateParticipantRoleReqSchema
} from '../../../src/models/zod-schemas/meeting.schema.js';

const issues = (schema: z.ZodType, input: unknown): string[] => {
	const result = schema.safeParse(input);

	if (result.success) {
		return [];
	}

	return result.error.issues.map(({ path, message }) =>
		path.length > 0 ? `${path.join('.')}: ${message}` : message
	);
};

beforeAll(() => {
	configureZodErrorMessages();
});

describe('UpdateParticipantRoleReqSchema', () => {
	it('accepts the upgrade and downgrade actions', () => {
		expect(UpdateParticipantRoleReqSchema.parse({ action: 'upgrade' })).toEqual({ action: 'upgrade' });
		expect(UpdateParticipantRoleReqSchema.parse({ action: 'downgrade' })).toEqual({ action: 'downgrade' });
	});

	it('rejects an action that does not exist and a missing action', () => {
		expect(issues(UpdateParticipantRoleReqSchema, { action: 'promote' })).toEqual([
			"action: Invalid enum value. Expected 'upgrade' | 'downgrade', received 'promote'"
		]);
		expect(issues(UpdateParticipantRoleReqSchema, {})).toEqual(['action: Required']);
	});
});

describe('MuteParticipantMediaReqSchema', () => {
	const noMedia = 'At least one of audioActive, videoActive or screenShareActive must be set to false';

	it.each(['audioActive', 'videoActive', 'screenShareActive'])('accepts turning only %s off', (key) => {
		expect(MuteParticipantMediaReqSchema.parse({ [key]: false })).toEqual({ [key]: false });
	});

	it('accepts turning several devices off at once', () => {
		const body = { audioActive: false, videoActive: false, screenShareActive: false };

		expect(MuteParticipantMediaReqSchema.parse(body)).toEqual(body);
	});

	it('rejects turning a device on', () => {
		expect(issues(MuteParticipantMediaReqSchema, { audioActive: true })).toEqual([
			'audioActive: audioActive can only be the boolean false'
		]);
		expect(issues(MuteParticipantMediaReqSchema, { audioActive: false, videoActive: true })).toEqual([
			'videoActive: videoActive can only be the boolean false'
		]);
	});

	it('rejects a body with nothing to turn off', () => {
		expect(issues(MuteParticipantMediaReqSchema, {})).toEqual([noMedia]);
		expect(issues(MuteParticipantMediaReqSchema, { unknown: false })).toEqual([noMedia]);
		expect(issues(MuteParticipantMediaReqSchema, { audioActive: undefined })).toEqual([noMedia]);
	});

	it('rejects a value that is not a boolean', () => {
		expect(issues(MuteParticipantMediaReqSchema, { screenShareActive: 'false' })).toEqual([
			'screenShareActive: screenShareActive can only be the boolean false'
		]);
	});
});

describe('hand schemas', () => {
	it('UpdateParticipantHandReqSchema accepts raising and lowering', () => {
		expect(UpdateParticipantHandReqSchema.parse({ raised: true })).toEqual({ raised: true });
		expect(UpdateParticipantHandReqSchema.parse({ raised: false })).toEqual({ raised: false });
		expect(issues(UpdateParticipantHandReqSchema, {})).toEqual(['raised: Required']);
		expect(issues(UpdateParticipantHandReqSchema, { raised: 'true' })).toEqual([
			'raised: Expected boolean, received string'
		]);
	});

	it('LowerAllHandsReqSchema accepts only lowering', () => {
		expect(LowerAllHandsReqSchema.parse({ raised: false })).toEqual({ raised: false });
		expect(issues(LowerAllHandsReqSchema, { raised: true })).toEqual([
			'raised: raised can only be the boolean false'
		]);
		expect(issues(LowerAllHandsReqSchema, {})).toEqual(['raised: Required']);
	});
});

describe('SendParticipantReactionReqSchema', () => {
	it.each(Object.values(MeetReaction))('accepts the reaction %s', (reaction) => {
		expect(SendParticipantReactionReqSchema.parse({ reaction })).toEqual({ reaction });
	});

	it('rejects a reaction that does not exist and a missing reaction', () => {
		expect(issues(SendParticipantReactionReqSchema, { reaction: 'sparkles' })).toEqual([
			expect.stringMatching(/^reaction: Invalid enum value\. Expected '.*', received 'sparkles'$/)
		]);
		expect(issues(SendParticipantReactionReqSchema, {})).toEqual(['reaction: Required']);
	});
});
