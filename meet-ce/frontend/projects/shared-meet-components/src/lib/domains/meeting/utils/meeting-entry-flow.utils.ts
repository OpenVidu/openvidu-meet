/** Which entry screens a participant goes through before the meeting. */
export interface MeetingEntryOptions {
	showJoinScreen: boolean;
	/** The device setup screen, where the participant previews and picks their camera and microphone. */
	showDeviceSetup: boolean;
}

export const DEFAULT_MEETING_ENTRY_OPTIONS: MeetingEntryOptions = { showJoinScreen: true, showDeviceSetup: true };

/** What the join screen would have to ask or tell the participant. */
export interface JoinScreenState {
	nameKnown: boolean;
	e2eeKeyMissing: boolean;
	roomClosed: boolean;
	canJoinMeeting: boolean;
}

/**
 * The join screen shows when asked to, and whenever it has something to ask or tell. A participant
 * resuming a wait that a reload interrupted already pressed it: it only shows for what is missing.
 */
export function joinScreenNeeded(options: MeetingEntryOptions, state: JoinScreenState, resumingWait = false): boolean {
	return (
		(options.showJoinScreen && !resumingWait) ||
		!state.nameKnown ||
		state.e2eeKeyMissing ||
		state.roomClosed ||
		!state.canJoinMeeting
	);
}
