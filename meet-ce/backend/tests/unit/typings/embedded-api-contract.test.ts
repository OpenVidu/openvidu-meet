import { describe, expect, it } from '@jest/globals';
import {
	deprecatedEmbeddedEventAliasOf,
	EMBEDDED_COMMAND_ALIASES,
	EMBEDDED_EVENT_ALIASES,
	EmbeddedCommandName,
	EmbeddedEventName,
	resolveEmbeddedCommandName
} from '@openvidu-meet/typings';

/**
 * Wire contract of the embedding API. These strings cross the process boundary: they are DOM event
 * types, custom-element method names and `postMessage` payloads in third-party host applications.
 * Changing one silently breaks every host out there, so the values are frozen here on purpose —
 * a failure means the change is a breaking change, not that the test needs updating.
 *
 * Everything is asserted at runtime: nothing type-checks `tests/**`, so compile-time assertions
 * would not actually run.
 */
const COMMANDS_SHIPPED_IN_3_8_0 = ['endMeeting', 'leaveRoom', 'kickParticipant'] as const;
const EVENTS_SHIPPED_IN_3_8_0 = ['joined', 'left', 'closed'] as const;

describe('Embedded command names', () => {
	it('should expose exactly the canonical and deprecated commands', () => {
		expect(Object.values(EmbeddedCommandName).sort()).toEqual(
			['meetingLeave', 'meetingEnd', 'participantKick', 'endMeeting', 'leaveRoom', 'kickParticipant'].sort()
		);
	});

	it('should keep every command name shipped in 3.8.0 working (backwards compatibility)', () => {
		const names: string[] = Object.values(EmbeddedCommandName);

		for (const command of COMMANDS_SHIPPED_IN_3_8_0) {
			expect(names).toContain(command);
		}
	});

	it('should map every deprecated command to a canonical one', () => {
		for (const [alias, canonical] of Object.entries(EMBEDDED_COMMAND_ALIASES)) {
			expect(COMMANDS_SHIPPED_IN_3_8_0).toContain(alias);
			expect(Object.values(EmbeddedCommandName)).toContain(canonical);
			expect(COMMANDS_SHIPPED_IN_3_8_0).not.toContain(canonical);
		}

		expect(Object.keys(EMBEDDED_COMMAND_ALIASES).sort()).toEqual([...COMMANDS_SHIPPED_IN_3_8_0].sort());
	});

	it('should resolve a deprecated command to its canonical name and leave canonical ones alone', () => {
		expect(resolveEmbeddedCommandName(EmbeddedCommandName.END_MEETING)).toBe(EmbeddedCommandName.MEETING_END);
		expect(resolveEmbeddedCommandName(EmbeddedCommandName.LEAVE_ROOM)).toBe(EmbeddedCommandName.MEETING_LEAVE);
		expect(resolveEmbeddedCommandName(EmbeddedCommandName.KICK_PARTICIPANT)).toBe(
			EmbeddedCommandName.PARTICIPANT_KICK
		);
		expect(resolveEmbeddedCommandName(EmbeddedCommandName.MEETING_END)).toBe(EmbeddedCommandName.MEETING_END);
	});
});

describe('Embedded event names', () => {
	it('should expose exactly the canonical and deprecated events', () => {
		expect(Object.values(EmbeddedEventName).sort()).toEqual(
			[
				'meetingJoined',
				'meetingLeft',
				'meetingClosed',
				'participantJoined',
				'participantLeft',
				'joined',
				'left',
				'closed'
			].sort()
		);
	});

	it('should keep every event name shipped in 3.8.0 working (backwards compatibility)', () => {
		const names: string[] = Object.values(EmbeddedEventName);

		for (const event of EVENTS_SHIPPED_IN_3_8_0) {
			expect(names).toContain(event);
		}
	});

	it('should map every deprecated event to a canonical one', () => {
		for (const [alias, canonical] of Object.entries(EMBEDDED_EVENT_ALIASES)) {
			expect(EVENTS_SHIPPED_IN_3_8_0).toContain(alias);
			expect(Object.values(EmbeddedEventName)).toContain(canonical);
			expect(EVENTS_SHIPPED_IN_3_8_0).not.toContain(canonical);
		}

		expect(Object.keys(EMBEDDED_EVENT_ALIASES).sort()).toEqual([...EVENTS_SHIPPED_IN_3_8_0].sort());
	});

	it('should find the deprecated alias of every canonical event, so both can be dispatched', () => {
		expect(deprecatedEmbeddedEventAliasOf(EmbeddedEventName.MEETING_JOINED)).toBe(EmbeddedEventName.JOINED);
		expect(deprecatedEmbeddedEventAliasOf(EmbeddedEventName.MEETING_LEFT)).toBe(EmbeddedEventName.LEFT);
		expect(deprecatedEmbeddedEventAliasOf(EmbeddedEventName.MEETING_CLOSED)).toBe(EmbeddedEventName.CLOSED);
	});

	it('should report no alias for a name that is already deprecated', () => {
		expect(deprecatedEmbeddedEventAliasOf(EmbeddedEventName.JOINED)).toBeUndefined();
	});
});
