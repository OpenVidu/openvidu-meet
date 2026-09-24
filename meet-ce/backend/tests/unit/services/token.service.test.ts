import { describe, expect, it } from '@jest/globals';
import { MEET_PERMISSION_KEYS, MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import type { MeetRoomMemberTokenMetadata } from '@openvidu-meet/typings';
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

		it('refuses a claim that is JSON but not the metadata of an access token', () => {
			expect(() => service.parseTokenMetadata(JSON.stringify({ iat: 'yesterday' }))).toThrow(
				'Invalid token metadata format'
			);
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
