import { MeetRoomMember, MeetRoomMemberRole } from '@openvidu-meet/typings';

/**
 * Utility functions for RoomMember-related UI operations.
 * These are pure functions that can be shared across room-member pages and components.
 */
export class RoomMemberUiUtils {
	static readonly AVAILABLE_ROLES: MeetRoomMemberRole[] = [MeetRoomMemberRole.MODERATOR, MeetRoomMemberRole.SPEAKER];

	// ===== ROLE UTILITIES =====

	/**
	 * Gets the human-readable label for a room member role.
	 */
	static getRoleLabel(role: MeetRoomMemberRole): string {
		switch (role) {
			case MeetRoomMemberRole.MODERATOR:
				return 'Moderator';
			case MeetRoomMemberRole.SPEAKER:
				return 'Speaker';
			default:
				return role;
		}
	}

	/**
	 * Gets the Material icon name for a room member role.
	 */
	static getRoleIcon(role: MeetRoomMemberRole): string {
		switch (role) {
			case MeetRoomMemberRole.MODERATOR:
				return 'manage_accounts';
			case MeetRoomMemberRole.SPEAKER:
				return 'record_voice_over';
			default:
				return 'person';
		}
	}

    /**
     * Gets the CSS class for a room member role
     */
    static getRoleClass(role: MeetRoomMemberRole): string {
        switch (role) {
            case MeetRoomMemberRole.MODERATOR:
                return 'moderator';
            case MeetRoomMemberRole.SPEAKER:
                return 'speaker';
            default:
                return '';
        }
    }

	// ===== MEMBER UTILITIES =====

	/**
	 * Checks whether a member is a registered (non-external) member.
	 * External members have IDs prefixed with 'ext-'.
	 */
	static isRegisteredMember(member: MeetRoomMember): boolean {
		return !member.memberId.startsWith('ext-');
	}

	/**
	 * Gets the human-readable label for the member type (Registered or External).
	 */
	static getMemberTypeLabel(member: MeetRoomMember): string {
		return RoomMemberUiUtils.isRegisteredMember(member) ? 'Registered' : 'External';
	}

	/**
	 * Gets the Material icon name for the member type.
	 */
	static getMemberTypeIcon(member: MeetRoomMember): string {
		return RoomMemberUiUtils.isRegisteredMember(member) ? 'verified_user' : 'person_outline';
	}

	/**
	 * Builds up to two uppercase initials from a member's full name.
	 */
	static getMemberInitials(member: MeetRoomMember): string {
		return member.name
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((word) => word[0].toUpperCase())
			.join('');
	}
}
