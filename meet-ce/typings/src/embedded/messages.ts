import { EmbeddedCommand, EmbeddedCommandPayloadFor } from './commands.js';
import { EmbeddedEvent, EmbeddedEventPayloadFor } from './events.js';

/**
 * Represents all possible messages exchanged between the host application and WebComponent.
 * @category Communication
 */
export type EmbeddedMessage =
	| EmbeddedInboundCommandMessage<EmbeddedCommand>
	| EmbeddedOutboundEventMessage<EmbeddedEvent>;

/**
 * Message sent from the host application to the WebComponent.
 * Contains a command with an optional type-safe payload.
 * @category Communication
 */
export interface EmbeddedInboundCommandMessage<T extends EmbeddedCommand = EmbeddedCommand> {
	/** The command to execute in the WebComponent */
	command: T;
	/** Optional payload with additional data for the command */
	payload?: EmbeddedCommandPayloadFor<T>;
}

/**
 * Message sent from the WebComponent to the host application.
 * Contains an event type with an optional type-safe payload.
 * @category Communication
 */
export interface EmbeddedOutboundEventMessage<T extends EmbeddedEvent = EmbeddedEvent> {
	/** The type of event being emitted */
	event: T;
	/** Optional payload with additional data about the event */
	payload?: EmbeddedEventPayloadFor<T>;
}

/**
 * Helper function to create a properly typed command message.
 * @param command The command to send
 * @param payload The payload for the command
 * @returns A properly formatted command message
 * @category Utilities
 * @private
 */
export function createEmbeddedCommandMessage<T extends EmbeddedCommand>(
	command: T,
	payload?: EmbeddedCommandPayloadFor<T>
): EmbeddedInboundCommandMessage<T> {
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
export function createEmbeddedEventMessage<T extends EmbeddedEvent>(
	event: T,
	payload?: EmbeddedEventPayloadFor<T>
): EmbeddedOutboundEventMessage<T> {
	return { event, payload };
}
