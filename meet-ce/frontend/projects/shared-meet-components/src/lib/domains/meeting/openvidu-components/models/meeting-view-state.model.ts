/**
 * The phase of the meeting view lifecycle.
 *
 * Transitions:
 *   loading    → prejoin      (when showPrejoin = true)
 *   loading    → connecting   (when showPrejoin = false, token applied directly)
 *   prejoin    → connecting   (user clicks join, token applied directly)
 *   connecting → live         (connected to the room)
 *   live       → disconnected (user leaves)
 *   any        → error        (unrecoverable error)
 */
export type MeetingViewPhase = 'loading' | 'prejoin' | 'connecting' | 'live' | 'disconnected' | 'error';
