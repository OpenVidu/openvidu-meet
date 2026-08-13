import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { getMeetMode, isCompatibilityMode, MEET_API_MODES, validateMeetMode } from '../../src/environment.js';

/**
 * MEET_MODE resolution and boot-time validation. `getMeetMode()` deliberately falls back to
 * `compatibility` on anything it does not recognize; `validateMeetMode()` exists so that fallback
 * never masks an operator typo — running in `compatibility` when the operator asked for `'3.9.0'`
 * would quietly expose the API surface they meant to turn off, so a typo must abort the boot.
 */
describe('MEET_MODE resolution (getMeetMode / isCompatibilityMode)', () => {
	afterEach(() => {
		delete process.env.MEET_MODE;
	});

	it('should default to compatibility when the variable is unset', () => {
		expect(getMeetMode()).toBe('compatibility');
		expect(isCompatibilityMode()).toBe(true);
	});

	it("should resolve '3.9.0', ignoring surrounding whitespace", () => {
		process.env.MEET_MODE = ' 3.9.0 ';

		expect(getMeetMode()).toBe('3.9.0');
		expect(isCompatibilityMode()).toBe(false);
	});

	it('should read the variable lazily, per call', () => {
		expect(getMeetMode()).toBe('compatibility');

		process.env.MEET_MODE = '3.9.0';
		expect(getMeetMode()).toBe('3.9.0');

		delete process.env.MEET_MODE;
		expect(getMeetMode()).toBe('compatibility');
	});
});

describe('validateMeetMode (boot-time guard)', () => {
	const spyProcessExit = () =>
		jest.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);

	afterEach(() => {
		delete process.env.MEET_MODE;
		jest.restoreAllMocks();
	});

	it('should accept an unset variable', () => {
		const exitSpy = spyProcessExit();

		validateMeetMode();

		expect(exitSpy).not.toHaveBeenCalled();
	});

	it.each(MEET_API_MODES)("should accept the valid mode '%s'", (mode) => {
		const exitSpy = spyProcessExit();
		process.env.MEET_MODE = mode;

		validateMeetMode();

		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('should abort the boot on a typo, naming the invalid value', () => {
		const exitSpy = spyProcessExit();
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		process.env.MEET_MODE = '3.9';

		validateMeetMode();

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid MEET_MODE '3.9'"));
	});
});
