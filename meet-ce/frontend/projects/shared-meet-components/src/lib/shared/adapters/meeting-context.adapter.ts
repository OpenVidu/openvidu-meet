import { InjectionToken } from '@angular/core';

/**
 * Adapter interface for meeting context operations.
 * This allows shared guards to interact with meeting context without directly depending on domain services.
 */
export interface MeetingContextAdapter {
	/**
	 * Sets the room ID for the current meeting context
	 */
	setRoomId(roomId: string): void;

	/**
	 * Sets the room secret for the current meeting context
	 */
	setRoomSecret(secret: string, persistInStorage?: boolean): void;

	/**
	 * Sets the E2EE encryption key for the current meeting
	 */
	setE2eeKey(key: string): void;
}

/**
 * Injection token for the MeetingContextAdapter
 */
export const MEETING_CONTEXT_ADAPTER = new InjectionToken<MeetingContextAdapter>('MEETING_CONTEXT_ADAPTER');
