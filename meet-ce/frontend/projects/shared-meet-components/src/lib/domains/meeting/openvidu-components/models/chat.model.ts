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
}
