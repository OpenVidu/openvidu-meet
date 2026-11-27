import { MeetParticipantType } from '../response/participant-response.js';

/**
 * Who sent a saved chat message, as the server saw them when it stored the message.
 */
export interface MeetChatMessageParticipant {
	/**
	 * Identity the sender had in the meeting. Absent for a message no participant sent.
	 */
	identity?: string;
	/**
	 * Display name the sender had when the message was stored. Absent for a message no participant sent.
	 */
	name?: string;
	/**
	 * How the sender joined the meeting, or `system` for a message no participant sent.
	 * See {@link MeetParticipantType}.
	 */
	type: MeetParticipantType | 'system';
}

/**
 * A chat message of a meeting, saved by the server when the room's `config.chat.persist` is on.
 */
export interface MeetChatMessage {
	/**
	 * Identifier the sender's client gave the message. Unique per sender within a room.
	 */
	messageId: string;
	/**
	 * ID of the room the message was sent in.
	 */
	roomId: string;
	/**
	 * Identifier of the meeting the message was sent in.
	 */
	meetingId: string;
	/**
	 * Who the message was sent to. Every saved message was sent to the whole meeting.
	 */
	channel: 'all';
	/**
	 * Timestamp when the server stored the message (milliseconds since epoch). Saved messages are
	 * ordered by it.
	 */
	sendDate: number;
	/**
	 * Timestamp when the meeting the message was sent in started (milliseconds since epoch).
	 */
	meetingStartDate: number;
	/**
	 * Text of the message.
	 */
	text: string;
	/**
	 * Who sent the message. See {@link MeetChatMessageParticipant}.
	 */
	participant: MeetChatMessageParticipant;
}
