import { DEFAULT_MEETING_ENTRY_OPTIONS, JoinScreenState, joinScreenNeeded } from './meeting-entry-flow.utils';

describe('joinScreenNeeded', () => {
	const ready: JoinScreenState = { nameKnown: true, e2eeKeyMissing: false, roomClosed: false, canJoinMeeting: true };
	const skip = { ...DEFAULT_MEETING_ENTRY_OPTIONS, showJoinScreen: false };

	it('shows the join screen by default', () => {
		expect(joinScreenNeeded(DEFAULT_MEETING_ENTRY_OPTIONS, ready)).toBeTrue();
	});

	it('skips it when asked to and there is nothing to ask or tell', () => {
		expect(joinScreenNeeded(skip, ready)).toBeFalse();
	});

	it('does not depend on the device setup screen', () => {
		expect(joinScreenNeeded({ showJoinScreen: false, showDeviceSetup: false }, ready)).toBeFalse();
		expect(joinScreenNeeded({ showJoinScreen: true, showDeviceSetup: false }, ready)).toBeTrue();
	});

	it('does not show the join screen to a participant resuming a wait, who already pressed it', () => {
		expect(joinScreenNeeded(DEFAULT_MEETING_ENTRY_OPTIONS, ready, true)).toBeFalse();
	});

	it('still shows the join screen to a participant resuming a wait when something is missing', () => {
		expect(joinScreenNeeded(DEFAULT_MEETING_ENTRY_OPTIONS, { ...ready, nameKnown: false }, true)).toBeTrue();
	});

	const reasons: [string, Partial<JoinScreenState>][] = [
		['no name is known', { nameKnown: false }],
		['the encryption key is missing', { e2eeKeyMissing: true }],
		['the room is closed', { roomClosed: true }],
		['the participant cannot join the meeting', { canJoinMeeting: false }]
	];

	for (const [reason, state] of reasons) {
		it(`shows it although asked to skip it when ${reason}`, () => {
			expect(joinScreenNeeded(skip, { ...ready, ...state })).toBeTrue();
		});
	}
});
