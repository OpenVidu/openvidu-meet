import { Provider } from '@angular/core';
import { ROOM_MEMBER_ADAPTER } from '../../../shared/adapters';
import { RoomMemberService } from '../services/room-member.service';

/**
 * Provides the RoomMemberAdapter using the existing RoomMemberService.
 * This allows shared guards to use the adapter interface without depending on domain services.
 */
export const ROOM_MEMBER_ADAPTER_PROVIDER: Provider = {
	provide: ROOM_MEMBER_ADAPTER,
	useExisting: RoomMemberService
};
