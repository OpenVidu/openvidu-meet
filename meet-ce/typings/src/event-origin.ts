/**
 * Who caused the state change an event notifies.
 *
 * The shared value-set for every front event that attributes its change (the `origin` payload
 * field): the affected participant themselves, a moderator acting on them, or the server applying
 * room configuration (defaults, limits, timers).
 */
export enum MeetEventOrigin {
	/** The affected participant caused the change themselves */
	PARTICIPANT = 'participant',
	/** A moderator caused the change on the affected participant */
	MODERATOR = 'moderator',
	/** The server caused the change (room defaults, limits, timers) */
	SYSTEM = 'system'
}
