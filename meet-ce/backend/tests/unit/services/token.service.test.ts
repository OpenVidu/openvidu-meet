import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { MeetRoomMemberTokenMetadata, MeetUser } from '@openvidu-meet/typings';
import ms from 'ms';
import { MEET_ENV } from '../../../src/environment.js';
import { TokenType } from '../../../src/models/token.model.js';
import { TokenService } from '../../../src/services/token.service.js';

/**
 * The metadata claim is where a token says who its bearer is and what they may do, so reading it
 * back is the step between a signature this server trusts and a decision it acts on. A claim it
 * cannot read has to be refused as loudly as a forged signature: the only token that reaches this
 * is one whose metadata was written by something other than this server.
 */
describe('TokenService metadata parsing', () => {
	const service = new TokenService(
		...([{ debug: () => {} }] as unknown as ConstructorParameters<typeof TokenService>)
	);

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
		const metadataOfClaims = (claims: { metadata?: string }) => service.parseTokenMetadata(claims.metadata ?? '');

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

		it('types each token and gives it the lifetime of its kind', async () => {
			const sid = service.createSessionId();
			const claimsOf = async (token: Promise<string>) => service.getClaimsIgnoringExpiration(await token);
			const lifetime = (claims: { exp?: number; nbf?: number }) => (claims.exp ?? 0) - (claims.nbf ?? 0);

			const access = await claimsOf(service.generateAccessToken(user, sid));
			const temporary = await claimsOf(service.generateAccessToken(user, sid, true));
			const refresh = await claimsOf(service.generateRefreshToken(user, sid));

			expect([access, temporary, refresh].map((claims) => metadataOfClaims(claims).tokenType)).toEqual([
				TokenType.ACCESS,
				TokenType.TEMPORARY,
				TokenType.REFRESH
			]);
			expect([access, temporary, refresh].map(lifetime)).toEqual([
				ms(MEET_ENV.ACCESS_TOKEN_EXPIRATION) / 1000,
				ms(MEET_ENV.PASSWORD_CHANGE_TOKEN_EXPIRATION) / 1000,
				ms(MEET_ENV.REFRESH_TOKEN_EXPIRATION) / 1000
			]);
			expect(access).toMatchObject({ sub: 'user-1', name: 'Ana' });
			expect(access.video).toBeUndefined();
		});

		it('gives a room member token the media grants it was issued with', async () => {
			const grants = { room: 'room-1', roomJoin: true, canPublish: false, canSubscribe: true };
			const token = await service.generateRoomMemberToken({
				tokenMetadata: roomMemberMetadata,
				livekitPermissions: grants,
				participantName: 'Ana',
				participantIdentity: 'speaker-1'
			});

			const claims = service.getClaimsIgnoringExpiration(token);
			expect(claims).toMatchObject({ sub: 'speaker-1', name: 'Ana', video: grants });
			expect(service.parseRoomMemberTokenMetadata(claims.metadata ?? '')).toEqual(roomMemberMetadata);
			expect((claims.exp ?? 0) - (claims.nbf ?? 0)).toBe(ms(MEET_ENV.ROOM_MEMBER_TOKEN_EXPIRATION) / 1000);
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
