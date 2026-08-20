/**
 * All available commands that can be sent to the embedded OpenVidu Meet application.
 *
 * Canonical names follow the `moduleAction` scheme (module first, then an imperative verb), so a
 * module's commands sort and autocomplete together. The former action-first names are kept as
 * `@deprecated` aliases that forward to the canonical command, and are removed in **3.12.0**.
 * They are excluded from the generated documentation so new integrations only see canonical names.
 */
export enum EmbeddedCommandName {
	/**
	 * Disconnects the local participant from the current meeting.
	 */
	MEETING_LEAVE = 'meetingLeave',
	/**
	 * Ends the current meeting for all participants.
	 * @moderator
	 */
	MEETING_END = 'meetingEnd',
	/**
	 * Kicks a participant from the meeting.
	 * @moderator
	 */
	PARTICIPANT_KICK = 'participantKick',
	/**
	 * Toggles the local participant's microphone, or sets it when `enabled` is provided.
	 * @prejoin Works from the prejoin screen onwards, before the meeting is joined.
	 */
	MEDIA_TOGGLE_AUDIO = 'mediaToggleAudio',
	/**
	 * Toggles the local participant's camera, or sets it when `enabled` is provided.
	 * @prejoin Works from the prejoin screen onwards, before the meeting is joined.
	 */
	MEDIA_TOGGLE_VIDEO = 'mediaToggleVideo',
	/**
	 * Toggles the local participant's screen share, or sets it when `enabled` is provided.
	 */
	MEDIA_TOGGLE_SCREEN_SHARE = 'mediaToggleScreenShare',
	/**
	 * Ends the current meeting for all participants.
	 * @moderator
	 * @deprecated Renamed to `meetingEnd` ({@link EmbeddedCommandName.MEETING_END}). Removed in 3.12.0.
	 */
	END_MEETING = 'endMeeting',
	/**
	 * Disconnects the local participant from the current meeting.
	 * @deprecated Renamed to `meetingLeave` ({@link EmbeddedCommandName.MEETING_LEAVE}). Removed in 3.12.0.
	 */
	LEAVE_ROOM = 'leaveRoom',
	/**
	 * Kicks a participant from the meeting.
	 * @moderator
	 * @deprecated Renamed to `participantKick` ({@link EmbeddedCommandName.PARTICIPANT_KICK}). Removed in 3.12.0.
	 */
	KICK_PARTICIPANT = 'kickParticipant'
}

/**
 * Type definitions for command payloads.
 * Each property corresponds to a command in {@link EmbeddedCommandName}.
 *
 * A deprecated alias always carries the **same** payload as its canonical command, expressed as an
 * indexed access so the two can never drift apart.
 * @category Communication
 */
export interface EmbeddedCommandPayloads {
	/**
	 * Payload for the {@link EmbeddedCommandName.MEETING_LEAVE} command.
	 */
	[EmbeddedCommandName.MEETING_LEAVE]: void;
	/**
	 * Payload for the {@link EmbeddedCommandName.MEETING_END} command.
	 */
	[EmbeddedCommandName.MEETING_END]: void;
	/**
	 * Payload for the {@link EmbeddedCommandName.PARTICIPANT_KICK} command.
	 */
	[EmbeddedCommandName.PARTICIPANT_KICK]: {
		participantIdentity: string;
	};
	/**
	 * Payload for the {@link EmbeddedCommandName.MEDIA_TOGGLE_AUDIO} command.
	 * When `enabled` is omitted, the microphone state is toggled.
	 */
	[EmbeddedCommandName.MEDIA_TOGGLE_AUDIO]: {
		enabled?: boolean;
	};
	/**
	 * Payload for the {@link EmbeddedCommandName.MEDIA_TOGGLE_VIDEO} command.
	 * When `enabled` is omitted, the camera state is toggled.
	 */
	[EmbeddedCommandName.MEDIA_TOGGLE_VIDEO]: {
		enabled?: boolean;
	};
	/**
	 * Payload for the {@link EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE} command.
	 * When `enabled` is omitted, the screen share state is toggled.
	 */
	[EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE]: {
		enabled?: boolean;
	};
	/**
	 * Payload for the {@link EmbeddedCommandName.END_MEETING} command.
	 * @deprecated Use {@link EmbeddedCommandName.MEETING_END}. Removed in 3.12.0.
	 */
	[EmbeddedCommandName.END_MEETING]: EmbeddedCommandPayloads[EmbeddedCommandName.MEETING_END];
	/**
	 * Payload for the {@link EmbeddedCommandName.LEAVE_ROOM} command.
	 * @deprecated Use {@link EmbeddedCommandName.MEETING_LEAVE}. Removed in 3.12.0.
	 */
	[EmbeddedCommandName.LEAVE_ROOM]: EmbeddedCommandPayloads[EmbeddedCommandName.MEETING_LEAVE];
	/**
	 * Payload for the {@link EmbeddedCommandName.KICK_PARTICIPANT} command.
	 * @deprecated Use {@link EmbeddedCommandName.PARTICIPANT_KICK}. Removed in 3.12.0.
	 */
	[EmbeddedCommandName.KICK_PARTICIPANT]: EmbeddedCommandPayloads[EmbeddedCommandName.PARTICIPANT_KICK];
}

/**
 * Maps every deprecated command alias to the canonical command it forwards to. Consumers that must
 * accept both spellings (the iframe bridge, the webcomponent shell) derive their handling from this
 * map instead of hardcoding pairs.
 *
 * @deprecated This map, {@link EmbeddedDeprecatedCommandName} and {@link resolveEmbeddedCommandName}
 * only exist to support the 3.8.0 aliases below and are removed together with them in **3.12.0**.
 * @category Communication
 */
export const EMBEDDED_COMMAND_ALIASES = {
	[EmbeddedCommandName.END_MEETING]: EmbeddedCommandName.MEETING_END,
	[EmbeddedCommandName.LEAVE_ROOM]: EmbeddedCommandName.MEETING_LEAVE,
	[EmbeddedCommandName.KICK_PARTICIPANT]: EmbeddedCommandName.PARTICIPANT_KICK
} as const satisfies Readonly<Partial<Record<EmbeddedCommandName, EmbeddedCommandName>>>;

/**
 * A deprecated command name that aliases a canonical one.
 * @deprecated Removed in 3.12.0, together with {@link EMBEDDED_COMMAND_ALIASES}.
 * @category Type Helpers
 */
export type EmbeddedDeprecatedCommandName = keyof typeof EMBEDDED_COMMAND_ALIASES;

/**
 * Resolves a command name to its canonical form, leaving canonical names untouched.
 * @deprecated Once the 3.8.0 aliases are removed in 3.12.0 every command is already canonical, so
 * this becomes a no-op identity function and is removed along with them.
 * @category Type Helpers
 */
export function resolveEmbeddedCommandName(command: EmbeddedCommandName): EmbeddedCommandName {
	return EMBEDDED_COMMAND_ALIASES[command as EmbeddedDeprecatedCommandName] ?? command;
}

/**
 * Gets the type-safe payload for a specific command.
 * This type allows TypeScript to infer the correct payload type based on the command.
 * @category Type Helpers
 * @private
 */
export type EmbeddedCommandPayloadFor<T extends EmbeddedCommandName> = T extends keyof EmbeddedCommandPayloads
	? EmbeddedCommandPayloads[T]
	: never;

/**
 * Command message for {@link EmbeddedCommandName.MEETING_LEAVE} (no payload).
 * @category Communication
 */
export interface EmbeddedMeetingLeaveCommand {
	command: EmbeddedCommandName.MEETING_LEAVE;
}

/**
 * Command message for {@link EmbeddedCommandName.MEETING_END} (no payload).
 * @category Communication
 */
export interface EmbeddedMeetingEndCommand {
	command: EmbeddedCommandName.MEETING_END;
}

/**
 * Command message for {@link EmbeddedCommandName.PARTICIPANT_KICK}: the command name plus its payload,
 * derived from {@link EmbeddedCommandPayloadFor}.
 * @category Communication
 */
export interface EmbeddedParticipantKickCommand {
	command: EmbeddedCommandName.PARTICIPANT_KICK;
	payload: EmbeddedCommandPayloadFor<EmbeddedCommandName.PARTICIPANT_KICK>;
}

/**
 * Command message for {@link EmbeddedCommandName.END_MEETING} (no payload).
 * @category Communication
 * @deprecated Use {@link EmbeddedMeetingEndCommand}. Removed in 3.12.0.
 */
export interface EmbeddedEndMeetingCommand {
	command: EmbeddedCommandName.END_MEETING;
}

/**
 * Command message for {@link EmbeddedCommandName.LEAVE_ROOM} (no payload).
 * @category Communication
 * @deprecated Use {@link EmbeddedMeetingLeaveCommand}. Removed in 3.12.0.
 */
export interface EmbeddedLeaveRoomCommand {
	command: EmbeddedCommandName.LEAVE_ROOM;
}

/**
 * Command message for {@link EmbeddedCommandName.KICK_PARTICIPANT}: the command name plus its payload,
 * derived from {@link EmbeddedCommandPayloadFor}.
 * @category Communication
 * @deprecated Use {@link EmbeddedParticipantKickCommand}. Removed in 3.12.0.
 */
export interface EmbeddedKickParticipantCommand {
	command: EmbeddedCommandName.KICK_PARTICIPANT;
	payload: EmbeddedCommandPayloadFor<EmbeddedCommandName.KICK_PARTICIPANT>;
}

/**
 * Discriminated union of every command message the host can send to the embedded app; narrow on
 * `command`. In the iframe integration this is the object posted verbatim over `postMessage`.
 * Includes the deprecated aliases, which hosts written against 3.8.0 still send.
 * @category Communication
 */
/**
 * Command message for {@link EmbeddedCommandName.MEDIA_TOGGLE_AUDIO}: the command name plus its
 * optional payload (omitted payload or `enabled` = toggle), derived from
 * {@link EmbeddedCommandPayloadFor}.
 */
export interface EmbeddedMediaToggleAudioCommand {
	command: EmbeddedCommandName.MEDIA_TOGGLE_AUDIO;
	payload?: EmbeddedCommandPayloadFor<EmbeddedCommandName.MEDIA_TOGGLE_AUDIO>;
}

/**
 * Command message for {@link EmbeddedCommandName.MEDIA_TOGGLE_VIDEO}: the command name plus its
 * optional payload (omitted payload or `enabled` = toggle), derived from
 * {@link EmbeddedCommandPayloadFor}.
 */
export interface EmbeddedMediaToggleVideoCommand {
	command: EmbeddedCommandName.MEDIA_TOGGLE_VIDEO;
	payload?: EmbeddedCommandPayloadFor<EmbeddedCommandName.MEDIA_TOGGLE_VIDEO>;
}

/**
 * Command message for {@link EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE}: the command name plus
 * its optional payload (omitted payload or `enabled` = toggle), derived from
 * {@link EmbeddedCommandPayloadFor}.
 */
export interface EmbeddedMediaToggleScreenShareCommand {
	command: EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE;
	payload?: EmbeddedCommandPayloadFor<EmbeddedCommandName.MEDIA_TOGGLE_SCREEN_SHARE>;
}

export type EmbeddedCommand =
	| EmbeddedMeetingLeaveCommand
	| EmbeddedMeetingEndCommand
	| EmbeddedParticipantKickCommand
	| EmbeddedMediaToggleAudioCommand
	| EmbeddedMediaToggleVideoCommand
	| EmbeddedMediaToggleScreenShareCommand
	| EmbeddedEndMeetingCommand
	| EmbeddedLeaveRoomCommand
	| EmbeddedKickParticipantCommand;
