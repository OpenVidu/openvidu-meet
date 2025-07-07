/**
 * All available commands that can be sent to the WebComponent.
 */
export enum WebComponentCommand {
    /**
     * Initializes the WebComponent with the given configuration.
     * This command is sent from the webcomponent to the iframe for intialice the domain.
     * @private
     */
    INITIALIZE = 'INITIALIZE',
    /**
     * Ends the current meeting for all participants.
     * This command is only available for the moderator.
     */
    END_MEETING = 'END_MEETING',
    /**
     * Disconnects the local participant from the current room.
     */
    LEAVE_ROOM = 'LEAVE_ROOM',
    /**
     * Kicks a participant from the meeting.
     * This command is only available for the moderator.
     */
    KICK_PARTICIPANT = 'KICK_PARTICIPANT'
}

/**
 * Type definitions for command payloads.
 * Each property corresponds to a command in {@link WebComponentCommand}.
 * @category Communication
 */
export interface WebComponentCommandPayloads {
    /**
     * Payload for the INITIALIZE command.
     * @private
     */
    [WebComponentCommand.INITIALIZE]: {
        domain: string;
    };
    [WebComponentCommand.END_MEETING]: void;
    [WebComponentCommand.LEAVE_ROOM]: void;
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
export type WenComponentCommandPayloadFor<T extends WebComponentCommand> = T extends keyof WebComponentCommandPayloads
    ? WebComponentCommandPayloads[T]
    : never;
