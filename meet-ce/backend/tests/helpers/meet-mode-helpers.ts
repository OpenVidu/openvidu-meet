import { afterAll, beforeAll, describe } from '@jest/globals';
import { getMeetMode, type MeetApiMode } from '../../src/environment.js';

/**
 * Runs a block against a chosen `MEET_MODE`. The app reads the mode on every request, so a block can
 * flip it in-process. The previous value is restored rather than deleted because Jest shares
 * `process.env` between the test files of a worker, and deleting it would drop a mode the CI job set
 * for the whole run.
 */
export const describeInMeetMode = (mode: MeetApiMode, name: string, fn: () => void) => {
	describe(name, () => {
		let previousMode: string | undefined;

		beforeAll(() => {
			previousMode = process.env.MEET_MODE;
			process.env.MEET_MODE = mode;
		});

		afterAll(() => {
			if (previousMode === undefined) {
				delete process.env.MEET_MODE;
			} else {
				process.env.MEET_MODE = previousMode;
			}
		});

		fn();
	});
};

/**
 * A block exercising the deprecated `can*` spellings, which exist only in compatibility mode. It is
 * skipped when the process itself runs in `'3.9.0'`, where those spellings are rejected with a 422.
 * Removed in 3.12.0 with the compatibility mode.
 */
export const describeInCompatibilityMode = (name: string, fn: () => void) => {
	if (getMeetMode() !== 'compatibility') {
		describe.skip(name, fn);
		return;
	}

	describeInMeetMode('compatibility', name, fn);
};
