/**
 * The phase of the meeting view lifecycle.
 *
 * Transitions:
 *   loading    → prejoin      (when showPrejoin = true)
 *   loading    → connecting   (when showPrejoin = false)
 *   prejoin    → connecting   (user clicks join)
 *   connecting → live         (token minted and connected to the room)
 *   live       → disconnected (user leaves)
 *   any        → error        (unrecoverable error)
 */
export type MeetingViewPhase = 'loading' | 'prejoin' | 'connecting' | 'live' | 'disconnected' | 'error';
