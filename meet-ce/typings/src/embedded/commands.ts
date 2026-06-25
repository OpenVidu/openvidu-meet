/**
 * All available commands that can be sent to the WebComponent.
 */
export enum EmbeddedCommand {
	/**
	 * Ends the current meeting for all participants.
	 * @moderator
	 */
	END_MEETING = 'endMeeting',
	/**
	 * Disconnects the local participant from the current room.
	 */
	LEAVE_ROOM = 'leaveRoom',
	/**
	 * Kicks a participant from the meeting.
	 * @moderator
	 */
	KICK_PARTICIPANT = 'kickParticipant'
}

/**
 * Type definitions for command payloads.
 * Each property corresponds to a command in {@link EmbeddedCommand}.
 * @category Communication
 */
export interface EmbeddedCommandPayloads {
	/**
	 * Payload for the {@link EmbeddedCommand.END_MEETING} command.
	 */
	[EmbeddedCommand.END_MEETING]: void;
	/**
	 * Payload for the {@link EmbeddedCommand.LEAVE_ROOM} command.
	 */
	[EmbeddedCommand.LEAVE_ROOM]: void;
	/**
	 * Payload for the {@link EmbeddedCommand.KICK_PARTICIPANT} command.
	 */
	[EmbeddedCommand.KICK_PARTICIPANT]: {
		participantIdentity: string;
	};
}

/**
 * Gets the type-safe payload for a specific command.
 * This type allows TypeScript to infer the correct payload type based on the command.
 * @category Type Helpers
 * @private
 */
export type EmbeddedCommandPayloadFor<T extends EmbeddedCommand> = T extends keyof EmbeddedCommandPayloads
	? EmbeddedCommandPayloads[T]
	: never;
