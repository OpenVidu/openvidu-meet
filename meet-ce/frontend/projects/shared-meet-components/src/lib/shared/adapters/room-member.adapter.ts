import { InjectionToken } from '@angular/core';

/**
 * Adapter interface for room member operations.
 * This allows shared guards to interact with room member context without directly depending on domain services.
 */
export interface RoomMemberAdapter {
	/**
	 * Sets the participant name for the current room member
	 */
	setParticipantName(name: string): void;
}

/**
 * Injection token for the RoomMemberAdapter
 */
export const ROOM_MEMBER_ADAPTER = new InjectionToken<RoomMemberAdapter>('ROOM_MEMBER_ADAPTER');
