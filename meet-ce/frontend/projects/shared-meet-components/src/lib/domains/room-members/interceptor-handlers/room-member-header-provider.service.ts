import { Injectable, inject } from '@angular/core';
import {
	HttpHeaderContext,
	HttpHeaderProvider,
	HttpHeaderProviderService
} from '../../../shared/services/http-header-provider.service';
import { RoomMemberContextService } from '../services/room-member-context.service';

/**
 * Provider for room member token headers.
 * Adds the room member token only to requests made from room pages.
 */
@Injectable({
	providedIn: 'root'
})
export class RoomMemberHeaderProviderService implements HttpHeaderProvider {
	private readonly roomMemberContextService = inject(RoomMemberContextService);
	private readonly headerProviderService = inject(HttpHeaderProviderService);

	/**
	 * Registers this provider with the header provider service
	 */
	init(): void {
		this.headerProviderService.register(this);
	}

	/**
	 * Determines if this provider should add headers for the given context
	 */
	canProvide(context: HttpHeaderContext): boolean {
		// Only provide if:
		// 1. Room member token exists
		// 2. Current page is a room page (starts with /room/)
		return !!this.roomMemberContextService.getRoomMemberToken() && context.pageUrl.startsWith('/room/');
	}

	/**
	 * Provides the room member token header
	 */
	provideHeaders(): Record<string, string> | null {
		const roomMemberToken = this.roomMemberContextService.getRoomMemberToken();
		if (!roomMemberToken) {
			return null;
		}

		return {
			'x-room-member-token': `Bearer ${roomMemberToken}`
		};
	}
}
