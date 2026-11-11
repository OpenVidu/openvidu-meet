/**
 * The phase of the meeting view lifecycle.
 *
 * Transitions:
 *   loading    → prejoin      (when showPrejoin = true)
 *   loading    → connecting   (when showPrejoin = false)
 *   prejoin    → connecting   (user clicks join)
 *   connecting → waiting      (the participant has to wait to be let in)
 *   waiting    → connecting   (let in: the token of this join arrived)
 *   connecting → live         (token minted and connected to the room)
 *   live       → disconnected (user leaves)
 *   any        → error        (unrecoverable error)
 */
export type MeetingViewPhase = 'loading' | 'prejoin' | 'connecting' | 'waiting' | 'live' | 'disconnected' | 'error';

/** The join could not reach Meet: the view shows its connection error. */
export class MeetingConnectionError extends Error {}
