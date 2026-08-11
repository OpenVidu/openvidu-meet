import {
	MEET_DEPRECATED_PERMISSION_KEYS,
	MEET_PERMISSION_KEYS,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
import { decodeToken } from './token.utils';

/**
 * `decodeToken` is the single JWT decode of the frontend and therefore the single place where a
 * room-member token cached in browser storage from before the permission-key rename gets its
 * deprecated `can*` keys normalized to the current ones. If this regresses, a returning user with a
 * cached token reads every permission as `undefined` (all features silently off). The normalization
 * branch is removed in 3.12.0; the rest of this contract stays.
 */
describe('decodeToken', () => {
	const base64UrlEncode = (value: string): string =>
		btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

	/** Builds an unsigned JWT the way LiveKit tokens carry Meet metadata: as a JSON string claim. */
	const buildToken = (metadata: Record<string, unknown>, extraClaims: Record<string, unknown> = {}): string => {
		const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
		const payload = base64UrlEncode(JSON.stringify({ ...extraClaims, metadata: JSON.stringify(metadata) }));

		return `${header}.${payload}.fake-signature`;
	};

	const permissionsOf = (token: string): Record<string, boolean | undefined> =>
		decodeToken(token).metadata.permissions as unknown as Record<string, boolean | undefined>;

	it('should normalize a pre-rename token to the current permission keys', () => {
		const deprecatedPermissions: Record<string, boolean> = {};

		for (const key of MEET_DEPRECATED_PERMISSION_KEYS) {
			deprecatedPermissions[key] = true;
		}

		const permissions = permissionsOf(buildToken({ roomId: 'room-1', permissions: deprecatedPermissions }));

		for (const key of MEET_PERMISSION_KEYS) {
			expect(permissions[key]).withContext(key).toBe(true);
		}

		for (const key of MEET_DEPRECATED_PERMISSION_KEYS) {
			expect(key in permissions)
				.withContext(key)
				.toBeFalse();
		}
	});

	it('should expand the split recording flag into its three current keys', () => {
		const deprecatedPermissions: Record<string, boolean> = {};

		for (const key of MEET_DEPRECATED_PERMISSION_KEYS) {
			deprecatedPermissions[key] = true;
		}

		deprecatedPermissions['canRetrieveRecordings'] = false;

		const permissions = permissionsOf(buildToken({ roomId: 'room-1', permissions: deprecatedPermissions }));

		expect(permissions['recordingList']).toBeFalse();
		expect(permissions['recordingPlay']).toBeFalse();
		expect(permissions['recordingDownload']).toBeFalse();
		// The rest of the set is untouched by the split flag.
		expect(permissions['recordingControl']).toBeTrue();
		expect(permissions['recordingDelete']).toBeTrue();
	});

	it('should pass a current-keyed token through unchanged', () => {
		const currentPermissions: Record<string, boolean> = {};

		for (const key of MEET_PERMISSION_KEYS) {
			currentPermissions[key] = key !== 'recordingDownload';
		}

		const permissions = permissionsOf(buildToken({ roomId: 'room-1', permissions: currentPermissions }));

		expect(permissions as Partial<MeetRoomMemberPermissions>).toEqual(
			currentPermissions as Partial<MeetRoomMemberPermissions>
		);
	});

	it('should leave metadata without permissions untouched', () => {
		const decoded = decodeToken(buildToken({ roomId: 'room-1' }));

		expect(decoded.metadata.roomId).toBe('room-1');
		expect(decoded.metadata.permissions).toBeUndefined();
	});

	it('should preserve the other JWT claims and metadata fields', () => {
		const decoded = decodeToken(
			buildToken(
				{ roomId: 'room-1', memberId: 'member-1', permissions: { canReadChat: true } },
				{ sub: 'lk-identity', iss: 'meet' }
			)
		);

		expect(decoded.sub).toBe('lk-identity');
		expect(decoded.iss).toBe('meet');
		expect(decoded.metadata.roomId).toBe('room-1');
		expect((decoded.metadata as unknown as Record<string, unknown>)['memberId']).toBe('member-1');
		expect((decoded.metadata.permissions as unknown as Record<string, boolean>)['chatRead']).toBeTrue();
	});
});
