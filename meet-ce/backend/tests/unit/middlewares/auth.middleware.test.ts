import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MeetRoom, MeetRoomMember, MeetUser } from '@openvidu-meet/typings';
import { MeetUserRole } from '@openvidu-meet/typings';
import type { NextFunction, Request, Response } from 'express';
import { container, registerDependencies } from '../../../src/config/dependency-injector.config.js';
import {
	accessTokenValidator,
	allowAnonymous,
	apiKeyValidator,
	roomMemberTokenValidator,
	withAuth,
	type AuthValidator
} from '../../../src/middlewares/auth.middleware.js';
import { errorInsufficientPermissions } from '../../../src/models/error.model.js';
import { TokenType } from '../../../src/models/token.model.js';
import { RoomMemberRepository } from '../../../src/repositories/room-member.repository.js';
import { RoomRepository } from '../../../src/repositories/room.repository.js';
import { ApiKeyService } from '../../../src/services/api-key.service.js';
import { LoggerService } from '../../../src/services/logger.service.js';
import { RequestSessionService } from '../../../src/services/request-session.service.js';
import { TokenService } from '../../../src/services/token.service.js';
import { UserService } from '../../../src/services/user.service.js';

/**
 * Who a request is allowed to be is decided here, and the integration suites can only reach the
 * decisions their fixtures can build: they send one credential at a time, and they cannot put a
 * token and the change that invalidates it in the same millisecond. Both are exactly where this
 * middleware gets interesting, and a token minted the instant a role changes is a real race: the
 * `iat` of the token and the `*UpdatedAt` of the record are both server milliseconds.
 */

const ISSUED_AT = 1_700_000_000_000;

type ResponseMock = Response & { status: jest.Mock; json: jest.Mock };

const mockResponse = (): ResponseMock => {
	const res = {
		status: jest.fn(() => res),
		json: jest.fn(() => res)
	} as unknown as ResponseMock;

	return res;
};

const answered = (res: ResponseMock) => ({
	status: res.status.mock.calls[0]?.[0],
	body: res.json.mock.calls[0]?.[0]
});

const requestWith = (headers: Record<string, string> = {}, path = '/rooms'): Request =>
	({ headers, path, query: {} }) as unknown as Request;

let logger: LoggerService;
let apiKeyService: ApiKeyService;
let tokenService: TokenService;
let userService: UserService;
let roomRepository: RoomRepository;
let roomMemberRepository: RoomMemberRepository;
let requestSessionService: RequestSessionService;

beforeAll(() => {
	registerDependencies();
	logger = container.get(LoggerService);
	apiKeyService = container.get(ApiKeyService);
	tokenService = container.get(TokenService);
	userService = container.get(UserService);
	roomRepository = container.get(RoomRepository);
	roomMemberRepository = container.get(RoomMemberRepository);
	requestSessionService = container.get(RequestSessionService);
	jest.spyOn(logger, 'debug').mockImplementation(() => {});
});

describe('withAuth', () => {
	const validator = (priority: number, isPresent: boolean, failure?: Error): AuthValidator => ({
		getPriority: () => priority,
		isPresent: () => isPresent,
		validate: jest.fn(async () => {
			if (failure) throw failure;
		})
	});

	// Every route happens to list its validators in priority order today, so this sort is the only
	// thing keeping the next route that does not from silently changing which credential wins.
	it('lets the validator with the highest priority decide, whatever order the route lists them in', async () => {
		const lower = validator(2, true, new Error('should never run'));
		const higher = validator(4, true);
		const res = mockResponse();
		const next = jest.fn() as NextFunction;

		await withAuth(lower, higher)(requestWith(), res, next);

		expect(next).toHaveBeenCalled();
		expect(lower.validate).not.toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	it('answers with the failure of the credential that decided, without falling back to the next one', async () => {
		const lower = validator(2, true);
		const higher = validator(4, true, errorInsufficientPermissions());
		const res = mockResponse();
		const next = jest.fn() as NextFunction;

		await withAuth(lower, higher)(requestWith(), res, next);

		expect(next).not.toHaveBeenCalled();
		expect(lower.validate).not.toHaveBeenCalled();
		expect(answered(res)).toEqual({
			status: 403,
			body: { error: 'Authorization Error', message: 'Insufficient permissions to access this resource' }
		});
	});

	it('skips a validator whose credential the request does not carry', async () => {
		const absent = validator(4, false, new Error('should never run'));
		const present = validator(2, true);
		const next = jest.fn() as NextFunction;

		await withAuth(absent, present)(requestWith(), mockResponse(), next);

		expect(absent.validate).not.toHaveBeenCalled();
		expect(present.validate).toHaveBeenCalled();
		expect(next).toHaveBeenCalled();
	});

	it('refuses a request that carries no credential at all', async () => {
		const res = mockResponse();
		const next = jest.fn() as NextFunction;

		await withAuth(validator(4, false), validator(2, false))(requestWith(), res, next);

		expect(next).not.toHaveBeenCalled();
		expect(answered(res)).toEqual({
			status: 401,
			body: { error: 'Authentication Error', message: 'Unauthorized' }
		});
	});

	// Mongo or Redis failing while the user, the room or the permissions are resolved must reach the
	// caller as a plain 401, not as an internal error, and must not pass for a valid credential.
	it('answers a plain 401 when authentication fails for a reason of its own, and says so in the log', async () => {
		const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
		const res = mockResponse();
		const next = jest.fn() as NextFunction;

		await withAuth(validator(4, true, new Error('mongo down')))(requestWith(), res, next);

		expect(next).not.toHaveBeenCalled();
		expect(answered(res)).toEqual({
			status: 401,
			body: { error: 'Authentication Error', message: 'Unauthorized' }
		});
		expect(error).toHaveBeenCalledWith('Unexpected error while authenticating request', expect.any(Error));
		error.mockRestore();
	});
});

describe('the validators, against a change made in the same millisecond as the token', () => {
	const user = (overrides: Partial<MeetUser> = {}): MeetUser =>
		({
			userId: 'user-1',
			name: 'Ana',
			role: MeetUserRole.ADMIN,
			roleUpdatedAt: ISSUED_AT,
			mustChangePassword: false,
			...overrides
		}) as MeetUser;

	const accessTokenRequest = (): Request => requestWith({ authorization: 'Bearer a-token' });
	const roomMemberTokenRequest = (): Request => requestWith({ 'x-room-member-token': 'Bearer a-token' });

	beforeEach(() => {
		// The spies live on container singletons, so their call history outlives a single test.
		jest.clearAllMocks();
		jest.spyOn(tokenService, 'verifyToken').mockResolvedValue({ sub: 'user-1', metadata: '{}' } as never);
		jest.spyOn(requestSessionService, 'setUser').mockImplementation(() => {});
		jest.spyOn(requestSessionService, 'setRoomMemberTokenInfo').mockImplementation(() => {});
	});

	describe('accessTokenValidator', () => {
		const validateWith = (roleUpdatedAt: number): Promise<void> => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.ACCESS
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user({ roleUpdatedAt }));

			return accessTokenValidator(MeetUserRole.ADMIN).validate(accessTokenRequest());
		};

		it('accepts a token issued in the very millisecond the role changed', async () => {
			await validateWith(ISSUED_AT);

			expect(requestSessionService.setUser).toHaveBeenCalled();
		});

		it('refuses a token issued one millisecond before the role changed', async () => {
			await expect(validateWith(ISSUED_AT + 1)).rejects.toMatchObject({ statusCode: 401 });
		});

		it('refuses a token whose user is gone', async () => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.ACCESS
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(null as never);

			await expect(accessTokenValidator(MeetUserRole.ADMIN).validate(accessTokenRequest())).rejects.toMatchObject(
				{ statusCode: 403, message: 'Invalid token subject' }
			);
		});

		it('refuses a user whose role the route does not allow', async () => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.ACCESS
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user({ role: MeetUserRole.ROOM_MEMBER }));

			await expect(accessTokenValidator(MeetUserRole.ADMIN).validate(accessTokenRequest())).rejects.toMatchObject(
				{ statusCode: 403, message: 'Insufficient permissions to access this resource' }
			);
		});

		// A user who has to change their password, and a temporary token minted for that, may reach
		// the two endpoints that change it and nothing else.
		it('holds a user who must change their password to the endpoints that let them', async () => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.ACCESS
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user({ mustChangePassword: true }));
			const validator = accessTokenValidator(MeetUserRole.ADMIN);

			await validator.validate(requestWith({ authorization: 'Bearer a-token' }, '/change-password'));
			await validator.validate(requestWith({ authorization: 'Bearer a-token' }, '/me'));

			await expect(validator.validate(accessTokenRequest())).rejects.toMatchObject({
				statusCode: 403,
				message: 'Password change required. Please change your password before accessing other resources.'
			});
		});

		it('holds a temporary token to those same endpoints', async () => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.TEMPORARY
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user());
			const validator = accessTokenValidator(MeetUserRole.ADMIN);

			await validator.validate(requestWith({ authorization: 'Bearer a-token' }, '/me'));

			await expect(validator.validate(accessTokenRequest())).rejects.toMatchObject({
				statusCode: 403,
				message: 'Password change required. Please change your password before accessing other resources.'
			});
		});

		it('refuses a refresh token used as an access token', async () => {
			jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				tokenType: TokenType.REFRESH
			} as never);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user());

			await expect(accessTokenValidator(MeetUserRole.ADMIN).validate(accessTokenRequest())).rejects.toMatchObject(
				{ statusCode: 401, message: 'Invalid token' }
			);
		});
	});

	describe('roomMemberTokenValidator', () => {
		const metadata = { iat: ISSUED_AT, roomId: 'room-1', memberId: 'member-1', userId: 'user-1' };

		const validateWith = (updates: {
			rolesUpdatedAt: number;
			permissionsUpdatedAt: number;
			roleUpdatedAt: number;
		}): Promise<void> => {
			jest.spyOn(tokenService, 'parseRoomMemberTokenMetadata').mockReturnValue(metadata as never);
			jest.spyOn(roomRepository, 'findByRoomId').mockResolvedValue({
				rolesUpdatedAt: updates.rolesUpdatedAt
			} as MeetRoom);
			jest.spyOn(roomMemberRepository, 'findByRoomAndMemberId').mockResolvedValue({
				permissionsUpdatedAt: updates.permissionsUpdatedAt
			} as MeetRoomMember);
			jest.spyOn(userService, 'getUser').mockResolvedValue(user({ roleUpdatedAt: updates.roleUpdatedAt }));

			return roomMemberTokenValidator.validate(roomMemberTokenRequest());
		};

		const sameInstant = { rolesUpdatedAt: ISSUED_AT, permissionsUpdatedAt: ISSUED_AT, roleUpdatedAt: ISSUED_AT };

		it('accepts a token issued in the very millisecond the room, the membership and the role changed', async () => {
			await validateWith(sameInstant);

			expect(requestSessionService.setRoomMemberTokenInfo).toHaveBeenCalledWith(metadata as never, 'user-1');
		});

		it("refuses a token older than the room's roles", async () => {
			await expect(validateWith({ ...sameInstant, rolesUpdatedAt: ISSUED_AT + 1 })).rejects.toMatchObject({
				statusCode: 401
			});
		});

		it("refuses a token older than the member's permissions", async () => {
			await expect(validateWith({ ...sameInstant, permissionsUpdatedAt: ISSUED_AT + 1 })).rejects.toMatchObject({
				statusCode: 401
			});
		});

		// A token minted from an anonymous access link names neither a member nor a user, so the two
		// lookups behind those must not run for it.
		it('accepts a token that names neither a member nor a user', async () => {
			jest.spyOn(tokenService, 'parseRoomMemberTokenMetadata').mockReturnValue({
				iat: ISSUED_AT,
				roomId: 'room-1'
			} as never);
			jest.spyOn(roomRepository, 'findByRoomId').mockResolvedValue({ rolesUpdatedAt: ISSUED_AT } as never);
			jest.spyOn(roomMemberRepository, 'findByRoomAndMemberId');
			jest.spyOn(userService, 'getUser');

			await roomMemberTokenValidator.validate(roomMemberTokenRequest());

			expect(roomMemberRepository.findByRoomAndMemberId).not.toHaveBeenCalled();
			expect(userService.getUser).not.toHaveBeenCalled();
		});

		it("refuses a token older than the user's role", async () => {
			await expect(validateWith({ ...sameInstant, roleUpdatedAt: ISSUED_AT + 1 })).rejects.toMatchObject({
				statusCode: 401
			});
		});
	});

	// The routes list these two in priority order today, so only the sort keeps the credential that
	// wins from following the declaration instead.
	it('lets the API key decide over an access token that arrives with it', async () => {
		const apiUser = user({ userId: 'api-user' });
		jest.spyOn(apiKeyService, 'validateApiKey').mockResolvedValue(true);
		jest.spyOn(userService, 'getUserAssociatedWithApiKey').mockResolvedValue(apiUser);
		jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
			iat: ISSUED_AT,
			tokenType: TokenType.ACCESS
		} as never);
		jest.spyOn(userService, 'getUser').mockResolvedValue(user());
		const request = requestWith({ authorization: 'Bearer a-token', 'x-api-key': 'a-key' });
		const next = jest.fn() as NextFunction;

		await withAuth(accessTokenValidator(MeetUserRole.ADMIN), apiKeyValidator)(request, mockResponse(), next);

		expect(next).toHaveBeenCalled();
		expect(requestSessionService.setUser).toHaveBeenCalledWith(apiUser);
		expect(userService.getUser).not.toHaveBeenCalled();
	});

	it('lets the room member token decide over an access token that arrives with it', async () => {
		jest.spyOn(tokenService, 'parseRoomMemberTokenMetadata').mockReturnValue({
			iat: ISSUED_AT,
			roomId: 'room-1'
		} as never);
		jest.spyOn(roomRepository, 'findByRoomId').mockResolvedValue({ rolesUpdatedAt: ISSUED_AT } as never);
		jest.spyOn(userService, 'getUser').mockResolvedValue(user());
		const request = requestWith({ authorization: 'Bearer a-token', 'x-room-member-token': 'Bearer a-token' });
		const next = jest.fn() as NextFunction;

		await withAuth(accessTokenValidator(MeetUserRole.ADMIN), roomMemberTokenValidator)(
			request,
			mockResponse(),
			next
		);

		expect(next).toHaveBeenCalled();
		expect(requestSessionService.setRoomMemberTokenInfo).toHaveBeenCalled();
	});

	it('decides a request that carries only an access token by that token', async () => {
		jest.spyOn(tokenService, 'parseTokenMetadata').mockReturnValue({
			iat: ISSUED_AT,
			tokenType: TokenType.ACCESS
		} as never);
		const signedIn = user();
		jest.spyOn(userService, 'getUser').mockResolvedValue(signedIn);
		const next = jest.fn() as NextFunction;

		await withAuth(apiKeyValidator, accessTokenValidator(MeetUserRole.ADMIN))(
			requestWith({ authorization: 'Bearer a-token' }),
			mockResponse(),
			next
		);

		expect(next).toHaveBeenCalled();
		expect(requestSessionService.setUser).toHaveBeenCalledWith(signedIn);
	});

	it('decides a request that carries only a room member token by that token', async () => {
		jest.spyOn(tokenService, 'parseRoomMemberTokenMetadata').mockReturnValue({
			iat: ISSUED_AT,
			roomId: 'room-1'
		} as never);
		jest.spyOn(roomRepository, 'findByRoomId').mockResolvedValue({ rolesUpdatedAt: ISSUED_AT } as never);
		const next = jest.fn() as NextFunction;

		await withAuth(apiKeyValidator, roomMemberTokenValidator)(
			requestWith({ 'x-room-member-token': 'Bearer a-token' }),
			mockResponse(),
			next
		);

		expect(next).toHaveBeenCalled();
		expect(requestSessionService.setRoomMemberTokenInfo).toHaveBeenCalled();
	});

	it('lets a request with no credential at all through an anonymous route', async () => {
		const next = jest.fn() as NextFunction;
		const res = mockResponse();

		await withAuth(allowAnonymous)(requestWith(), res, next);

		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	/**
	 * A deployment's API key is the credential of the integrations built against it, so a key the
	 * server does not know must be refused as such, and not pass for a missing credential.
	 */
	describe('apiKeyValidator', () => {
		it('refuses a key the server does not know', async () => {
			jest.spyOn(apiKeyService, 'validateApiKey').mockResolvedValue(false);

			await expect(apiKeyValidator.validate(requestWith({ 'x-api-key': 'invalid-key' }))).rejects.toMatchObject({
				statusCode: 401,
				message: 'Invalid API key'
			});
		});

		it('refuses a valid key with no user behind it', async () => {
			jest.spyOn(apiKeyService, 'validateApiKey').mockResolvedValue(true);
			jest.spyOn(userService, 'getUserAssociatedWithApiKey').mockResolvedValue(null as never);

			await expect(apiKeyValidator.validate(requestWith({ 'x-api-key': 'a-key' }))).rejects.toMatchObject({
				statusCode: 403
			});
		});
	});

	/**
	 * An anonymous route is not the same as an unidentified caller: a signed-in owner or admin
	 * opening a room through a shared link is still themselves, and that is what gives them their
	 * own permissions instead of the link's when the room member token is minted.
	 */
	describe('allowAnonymous', () => {
		it('carries a signed-in user into an anonymous request', async () => {
			const signedIn = user();
			jest.spyOn(userService, 'getUser').mockResolvedValue(signedIn);

			await allowAnonymous.validate(accessTokenRequest());

			expect(requestSessionService.setUser).toHaveBeenCalledWith(signedIn);
		});

		it('stays anonymous when the request carries no token', async () => {
			await allowAnonymous.validate(requestWith());

			expect(requestSessionService.setUser).not.toHaveBeenCalled();
		});

		it('stays anonymous, rather than failing, when the token riding along is stale', async () => {
			jest.spyOn(tokenService, 'verifyToken').mockRejectedValue(new Error('token expired'));

			await allowAnonymous.validate(accessTokenRequest());

			expect(requestSessionService.setUser).not.toHaveBeenCalled();
		});

		it('stays anonymous when the token names a user who no longer exists', async () => {
			jest.spyOn(userService, 'getUser').mockResolvedValue(null as never);

			await allowAnonymous.validate(accessTokenRequest());

			expect(requestSessionService.setUser).not.toHaveBeenCalled();
		});
	});
});
