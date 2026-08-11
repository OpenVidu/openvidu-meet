import { describe, expect, it } from '@jest/globals';
import {
	EMBEDDED_COMMAND_ALIASES,
	EMBEDDED_EVENT_ALIASES,
	EmbeddedCommandName,
	EmbeddedEventName,
	MEET_API_MODULES,
	MEET_PERMISSION_KEYS,
	MeetWebhookEventType,
	meetApiModuleOf
} from '@openvidu-meet/typings';

/**
 * Runtime twin of `scripts/lint-api-naming.mjs` for the parts that don't need the OpenAPI files:
 * the lint gates CI through `./meet.sh lint-backend`, but these tests fail already in a plain
 * `test-unit-backend` run, closer to the editor.
 */
describe('MEET_API_MODULES registry', () => {
	it('should contain unique single-word lowercase tokens, none a prefix of another', () => {
		expect(new Set(MEET_API_MODULES).size).toBe(MEET_API_MODULES.length);

		for (const token of MEET_API_MODULES) {
			expect(token).toMatch(/^[a-z]+$/);
		}

		const prefixPairs = MEET_API_MODULES.flatMap((a) =>
			MEET_API_MODULES.filter((b) => a !== b && b.startsWith(a)).map((b) => `'${a}' prefixes '${b}'`)
		);
		expect(prefixPairs).toEqual([]);
	});
});

describe('meetApiModuleOf', () => {
	it('should resolve module-first identifiers to their token', () => {
		expect(meetApiModuleOf('meetingJoin')).toBe('meeting');
		expect(meetApiModuleOf('mediaChangeVirtualBackground')).toBe('media');
		expect(meetApiModuleOf('recordingDownload')).toBe('recording');
		expect(meetApiModuleOf('roomShareAccessLinks')).toBe('room');
	});

	it('should reject bare tokens, other casings and unregistered prefixes', () => {
		expect(meetApiModuleOf('meeting')).toBeUndefined();
		expect(meetApiModuleOf('mediation')).toBeUndefined();
		expect(meetApiModuleOf('canRecord')).toBeUndefined();
		expect(meetApiModuleOf('startRecording')).toBeUndefined();
	});

	it('should resolve every current canonical identifier', () => {
		const deprecatedNames = new Set([
			...Object.keys(EMBEDDED_COMMAND_ALIASES),
			...Object.keys(EMBEDDED_EVENT_ALIASES)
		]);
		const identifiers = [
			...MEET_PERMISSION_KEYS,
			...Object.values(EmbeddedCommandName),
			...Object.values(EmbeddedEventName),
			...Object.values(MeetWebhookEventType)
		].filter((identifier) => !deprecatedNames.has(identifier));

		const unresolved = identifiers.filter((identifier) => !meetApiModuleOf(identifier));
		expect(unresolved).toEqual([]);
	});
});
