import { beforeAll, describe, expect, it } from '@jest/globals';
import { MeetReaction } from '@openvidu-meet/typings';
import type { z } from 'zod';
import { configureZodErrorMessages } from '../../../src/config/zod-config.js';
import {
	WaitingRoomDecisionReqSchema,
	WaitingRoomLeaveReqSchema,
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
			"audioActive: Invalid enum value. Expected 'false', received 'true'"
		]);
		expect(issues(MuteParticipantMediaReqSchema, { audioActive: false, videoActive: true })).toEqual([
			"videoActive: Invalid enum value. Expected 'false', received 'true'"
		]);
	});

	it('rejects a body with nothing to turn off', () => {
		expect(issues(MuteParticipantMediaReqSchema, {})).toEqual([noMedia]);
		expect(issues(MuteParticipantMediaReqSchema, { unknown: false })).toEqual([noMedia]);
		expect(issues(MuteParticipantMediaReqSchema, { audioActive: undefined })).toEqual([noMedia]);
	});

	it('rejects a value that is not a boolean', () => {
		expect(issues(MuteParticipantMediaReqSchema, { screenShareActive: 'false' })).toHaveLength(1);
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
			"raised: Invalid enum value. Expected 'false', received 'true'"
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

describe('WaitingRoomDecisionReqSchema', () => {
	it('reads an empty body as everyone waiting', () => {
		expect(WaitingRoomDecisionReqSchema.parse({})).toEqual({});
	});

	it('accepts one participant or several, each named once', () => {
		expect(WaitingRoomDecisionReqSchema.parse({ participantIdentities: ['ana'] })).toEqual({
			participantIdentities: ['ana']
		});
		expect(WaitingRoomDecisionReqSchema.parse({ participantIdentities: ['ana', 'ben'] })).toEqual({
			participantIdentities: ['ana', 'ben']
		});
	});

	it('refuses an empty list instead of reading it as everyone waiting', () => {
		expect(issues(WaitingRoomDecisionReqSchema, { participantIdentities: [] })).toEqual([
			'participantIdentities: Must name at least one participant'
		]);
	});

	it('refuses an identity named twice', () => {
		expect(issues(WaitingRoomDecisionReqSchema, { participantIdentities: ['ana', 'ana'] })).toEqual([
			'participantIdentities: Must not repeat an identity'
		]);
	});

	it('refuses more participants than a waiting room holds, and identities that are not strings', () => {
		const identities = Array.from({ length: 101 }, (_, index) => `p-${index}`);

		expect(issues(WaitingRoomDecisionReqSchema, { participantIdentities: identities })).toHaveLength(1);
		expect(issues(WaitingRoomDecisionReqSchema, { participantIdentities: [42] })).toHaveLength(1);
		expect(issues(WaitingRoomDecisionReqSchema, { participantIdentities: [''] })).toHaveLength(1);
	});
});

describe('WaitingRoomLeaveReqSchema', () => {
	it('needs the ticket of the wait', () => {
		expect(WaitingRoomLeaveReqSchema.parse({ waitingRoomTicket: 'q8d1u3Zr0m6ZxVwK9tHc2A' })).toEqual({
			waitingRoomTicket: 'q8d1u3Zr0m6ZxVwK9tHc2A'
		});
		expect(issues(WaitingRoomLeaveReqSchema, {})).toHaveLength(1);
		expect(issues(WaitingRoomLeaveReqSchema, { waitingRoomTicket: '' })).toHaveLength(1);
	});
});
