import { InjectionToken } from '@angular/core';

/**
 * Adapter interface for room member context, providing necessary methods to access room member information.
 * This allows shared services to interact with room member context without directly depending on domain services.
 */
export interface RoomMemberContextAdapter {
	/**
	 * Retrieves the current room member token.
	 */
	getRoomMemberToken(): string;
}

/**
 * Injection token for the RoomMemberContextAdapter
 */
export const ROOM_MEMBER_CONTEXT_ADAPTER = new InjectionToken<RoomMemberContextAdapter>('ROOM_MEMBER_CONTEXT_ADAPTER');
