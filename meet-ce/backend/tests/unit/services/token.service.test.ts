import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see meeting-mute.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { TokenType } from '../../../src/models/token.model.js';
import type { LoggerService } from '../../../src/services/logger.service.js';
import { TokenService } from '../../../src/services/token.service.js';

/**
 * The metadata claim is where a token says who its bearer is and what they may do, so reading it
 * back is the step between a signature this server trusts and a decision it acts on. A claim it
 * cannot read has to be refused as loudly as a forged signature: the only token that reaches this
 * is one whose metadata was written by something other than this server.
 */
describe('TokenService metadata parsing', () => {
	const service = new TokenService({ debug: () => {} } as unknown as LoggerService);

	const roomMemberMetadata: MeetRoomMemberTokenMetadata = {
		iat: 1_700_000_000_000,
		roomId: 'room-1',
		memberId: 'member-1',
		permissions: Object.fromEntries(MEET_PERMISSION_KEYS.map((key) => [key, true])) as never,
		badge: MeetRoomMemberUIBadge.MODERATOR
	};

	describe('parseTokenMetadata', () => {
		it('reads back the metadata an access token carries', () => {
			const metadata = { iat: 1_700_000_000_000, tokenType: TokenType.ACCESS };

			expect(service.parseTokenMetadata(JSON.stringify(metadata))).toEqual(metadata);
		});

		it('refuses a claim that is not JSON at all', () => {
			expect(() => service.parseTokenMetadata('not-json')).toThrow('Invalid token metadata format');
		});

		it('reads back the metadata of a token issued before login sessions existed', () => {
			const metadata = { iat: 1_700_000_000_000, tokenType: TokenType.REFRESH };

			expect(service.parseTokenMetadata(JSON.stringify(metadata))).toEqual(metadata);
		});

		it('refuses a claim that is JSON but not the metadata of an access token', () => {
			expect(() => service.parseTokenMetadata(JSON.stringify({ iat: 'yesterday' }))).toThrow(
				'Invalid token metadata format'
			);
		});
	});

	describe('login sessions', () => {
		const user = { userId: 'user-1', name: 'Ana' } as MeetUser;
		const metadataOf = (token: string) =>
			service.parseTokenMetadata(service.getClaimsIgnoringExpiration(token).metadata ?? '');

		it('gives every token of one login its session, and every refresh token an id of its own', async () => {
			const sid = service.createSessionId();
			const [accessToken, temporaryToken, firstRefreshToken, secondRefreshToken] = await Promise.all([
				service.generateAccessToken(user, sid),
				service.generateAccessToken(user, sid, true),
				service.generateRefreshToken(user, sid),
				service.generateRefreshToken(user, sid)
			]);

			expect(
				[accessToken, temporaryToken, firstRefreshToken, secondRefreshToken].map(
					(token) => metadataOf(token).sid
				)
			).toEqual([sid, sid, sid, sid]);
			expect(metadataOf(firstRefreshToken).rid).toEqual(expect.any(String));
			expect(metadataOf(firstRefreshToken).rid).not.toBe(metadataOf(secondRefreshToken).rid);
			expect(metadataOf(accessToken).rid).toBeUndefined();
			expect(service.createSessionId()).not.toBe(sid);
		});
	});

	describe('parseRoomMemberTokenMetadata', () => {
		it('reads back the metadata a room member token carries', () => {
			expect(service.parseRoomMemberTokenMetadata(JSON.stringify(roomMemberMetadata))).toEqual(
				roomMemberMetadata
			);
		});

		it('refuses a claim that is not JSON at all', () => {
			expect(() => service.parseRoomMemberTokenMetadata('not-json')).toThrow(
				'Invalid room member token metadata format'
			);
		});

		it('refuses a claim whose permissions are missing', () => {
			const { permissions, ...withoutPermissions } = roomMemberMetadata;

			expect(() => service.parseRoomMemberTokenMetadata(JSON.stringify(withoutPermissions))).toThrow(
				'Invalid room member token metadata format'
			);
			expect(permissions).toBeDefined();
		});
	});
});
