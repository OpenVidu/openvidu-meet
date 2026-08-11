import { MeetRoomMemberPermissions, MeetRoomMemberTokenMetadata, normalizePermissions } from '@openvidu-meet/typings';
import { jwtDecode, JwtPayload } from 'jwt-decode';

interface LiveKitJwtClaims extends JwtPayload {
	metadata: string;
}

export interface DecodedRoomMemberToken extends Omit<LiveKitJwtClaims, 'metadata'> {
	metadata: MeetRoomMemberTokenMetadata;
}

/**
 * Decodes a room member token. This is the only JWT decode in the frontend, so it is also the single
 * point where permissions are normalized to their current keys: a token cached in browser storage
 * from before the permission-key rename still carries the deprecated `can*` names, and every
 * consumer downstream reads the current ones. The normalization branch is removed in 3.12.0.
 */
export const decodeToken = (token: string): DecodedRoomMemberToken => {
	const decodedToken = jwtDecode<LiveKitJwtClaims>(token);
	const metadata = JSON.parse(decodedToken.metadata) as MeetRoomMemberTokenMetadata;

	if (metadata.permissions) {
		metadata.permissions = normalizePermissions(metadata.permissions) as MeetRoomMemberPermissions;
	}

	return {
		...decodedToken,
		metadata
	};
};
