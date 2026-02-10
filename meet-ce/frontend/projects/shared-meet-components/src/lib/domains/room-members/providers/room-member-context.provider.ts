import { Provider } from '@angular/core';
import { ROOM_MEMBER_CONTEXT_ADAPTER } from '../../../shared/adapters/room-member-context.adapter';
import { RoomMemberContextService } from '../services/room-member-context.service';

/**
 * Provides the RoomMemberContextAdapter using the existing RoomMemberContextService.
 * This allows shared guards to use the adapter interface without depending on domain services.
 */
export const ROOM_MEMBER_CONTEXT_ADAPTER_PROVIDER: Provider = {
	provide: ROOM_MEMBER_CONTEXT_ADAPTER,
	useExisting: RoomMemberContextService
};
