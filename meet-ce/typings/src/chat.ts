/**
 * Identity of the hidden participant the server joins to a meeting that saves its chat. A browser
 * adds it to the destinations of a chat message so the server stores it. No participant who joins
 * through OpenVidu Meet can hold it: their identities never contain a dot.
 */
export const MEET_CHAT_SAVER_IDENTITY = 'meet.chatSaver';

/**
 * Attributes OpenVidu Meet sets on the text stream of a chat message.
 */
export enum MeetChatStreamAttribute {
	/**
	 * Identifier the sender's client gives the message (a UUID), kept across resends so the server
	 * stores the message once.
	 */
	MESSAGE_ID = 'meet.messageId',
	/**
	 * Set to `true` on a message its sender delivers again to a participant who joined, or was
	 * granted `chatRead`, while the server had not yet confirmed storing it.
	 */
	FORWARDED = 'meet.forwarded'
}
