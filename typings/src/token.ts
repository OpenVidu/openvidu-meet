/**
 * Options for creating a participant token.
 */
export interface TokenOptions {
	/**
	 * The unique identifier for the room.
	 */
	roomId: string;

	/**
	 * The name of the participant.
	 */
	participantName: string;

	/**
	 * A secret key for room access.
	 */
	secret: string;
}
