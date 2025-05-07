import { CommandPayloadFor, WebComponentCommand } from './command.model';
import { EventPayloadFor, WebComponentEvent } from './event.model';

/**
 * Represents all possible messages exchanged between the host application and WebComponent.
 * @category Communication
 */
export type WebComponentMessage = InboundCommandMessage<WebComponentCommand> | OutboundEventMessage<WebComponentEvent>;

/**
 * Message sent from the host application to the WebComponent.
 * Contains a command with an optional type-safe payload.
 * @category Communication
 */
export interface InboundCommandMessage<T extends WebComponentCommand = WebComponentCommand> {
	/** The command to execute in the WebComponent */
	command: T;
	/** Optional payload with additional data for the command */
	payload?: CommandPayloadFor<T>;
}

/**
 * Message sent from the WebComponent to the host application.
 * Contains an event type with an optional type-safe payload.
 * @category Communication
 */
export interface OutboundEventMessage<T extends WebComponentEvent = WebComponentEvent> {
	/** The type of event being emitted */
	event: T;
	/** Optional payload with additional data about the event */
	payload?: EventPayloadFor<T>;
}

/**
 * Helper function to create a properly typed command message.
 * @param command The command to send
 * @param payload The payload for the command
 * @returns A properly formatted command message
 * @category Utilities
 * @private
 */
export function createCommandMessage<T extends WebComponentCommand>(
	command: T,
	payload?: CommandPayloadFor<T>
): InboundCommandMessage<T> {
	return { command, payload };
}

/**
 * Helper function to create a properly typed event message.
 * @param event The event type
 * @param payload The payload for the event
 * @returns A properly formatted event message
 * @category Utilities
 * @private
 */
export function createEventMessage<T extends WebComponentEvent>(
	event: T,
	payload?: EventPayloadFor<T>
): OutboundEventMessage<T> {
	return { event, payload };
}
