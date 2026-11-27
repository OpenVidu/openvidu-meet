/**
 * @internal
 */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

/**
 * @internal
 */
export interface ChatMessage {
	isLocal: boolean;
	participantName: string;
	message: string;
	/** Identifier the sender's client gave the message, present in meetings that save their chat. */
	messageId?: string;
	/** Identity the sender had in the meeting. */
	identity?: string;
	/** Whether the sender joined with a shared link of the room. */
	anonymous?: boolean;
}

/**
 * The remote participant a chat message came from.
 * @internal
 */
export interface ChatSender {
	identity: string;
	name?: string;
	isAnonymous: boolean;
}
