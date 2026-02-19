/**
 * All available commands that can be sent to the WebComponent.
 */
export enum WebComponentCommand {
	/**
	 * Initializes the WebComponent with the given configuration.
	 * This command is sent from the webcomponent to the iframe to intialice the domain.
	 * @private
	 */
	INITIALIZE = 'initialize',
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
 * Each property corresponds to a command in {@link WebComponentCommand}.
 * @category Communication
 */
export interface WebComponentCommandPayloads {
	/**
	 * Payload for the {@link WebComponentCommand.INITIALIZE} command.
	 * @private
	 */
	[WebComponentCommand.INITIALIZE]: {
		domain: string;
	};
	/**
	 * Payload for the {@link WebComponentCommand.END_MEETING} command.
	 */
	[WebComponentCommand.END_MEETING]: void;
	/**
	 * Payload for the {@link WebComponentCommand.LEAVE_ROOM} command.
	 */
	[WebComponentCommand.LEAVE_ROOM]: void;
	/**
	 * Payload for the {@link WebComponentCommand.KICK_PARTICIPANT} command.
	 */
	[WebComponentCommand.KICK_PARTICIPANT]: {
		participantIdentity: string;
	};
}

/**
 * Gets the type-safe payload for a specific command.
 * This type allows TypeScript to infer the correct payload type based on the command.
 * @category Type Helpers
 * @private
 */
export type WebComponentCommandPayloadFor<T extends WebComponentCommand> = T extends keyof WebComponentCommandPayloads
	? WebComponentCommandPayloads[T]
	: never;
