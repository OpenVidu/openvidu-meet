import type { MeetRoomMemberPermissions, MeetRoomMemberTokenMetadata, MeetUser, MeetUserRole } from '@openvidu-meet/typings';
import { randomUUID } from 'crypto';
import { inject, injectable } from 'inversify';
import type { RequestContext } from '../models/request-context.model.js';
import { requestContextStorage } from '../utils/request-context.utils.js';
import { LoggerService } from './logger.service.js';

/**
 * Service that manages request-scoped session data using Node.js AsyncLocalStorage.
 *
 * This service provides isolated storage for each HTTP request without needing to pass
 * the request object around or use Inversify's request scope. It works by leveraging
 * Node.js's async_hooks module which tracks asynchronous execution contexts.
 *
 * IMPORTANT: This service is designed to work with HTTP requests, but it's also safe
 * to use in other contexts (schedulers, webhooks, background jobs). When used outside
 * an HTTP request context, all getters return undefined and setters are ignored.
 */
@injectable()
export class RequestSessionService {
	private hasLoggedWarning = false;

	constructor(@inject(LoggerService) private readonly logger: LoggerService) {}

	/**
	 * Initializes the request context. Must be called at the start of each HTTP request.
	 * This method creates an isolated storage context for the duration of the request and
	 * assigns it a correlation id so every log line emitted during the request can be tied
	 * back to it.
	 *
	 * @param callback - The function to execute within the request context
	 * @returns The result of the callback
	 */
	run<T>(callback: () => T): T {
		return requestContextStorage.run({ requestId: randomUUID() }, callback);
	}

	/**
	 * Gets the correlation id of the current request context.
	 * Returns undefined if called outside of a request context.
	 */
	getRequestId(): string | undefined {
		return this.getContext()?.requestId;
	}

	/**
	 * Gets the current request context.
	 * Returns undefined if called outside of a request context (e.g., in schedulers, background jobs).
	 * Logs a warning the first time this happens to help with debugging.
	 */
	private getContext(): RequestContext | undefined {
		const context = requestContextStorage.getStore();

		if (!context && !this.hasLoggedWarning) {
			// Expected when reached from a scheduler, webhook or background job (no HTTP request):
			// getters return undefined and setters are ignored. Logged once, at debug.
			this.logger.debug(
				'Request context accessed outside an HTTP request; getters return undefined and setters are ignored'
			);
			this.hasLoggedWarning = true;
		}

		return context;
	}

	/**
	 * Sets the authenticated user in the current request context.
	 * If called outside a request context, this operation is silently ignored.
	 */
	setUser(user: MeetUser): void {
		const context = this.getContext();

		if (context) {
			context.user = user;
		}
	}

	/**
	 * Gets the authenticated user from the current request context.
	 */
	getAuthenticatedUser(): MeetUser | undefined {
		return this.getContext()?.user;
	}

	/**
	 * Gets the authenticated user's role from the current request context.
	 */
	getAuthenticatedUserRole(): MeetUserRole | undefined {
		return this.getContext()?.user?.role;
	}

	/**
	 * Sets the room member token information in the current request context.
	 * If called outside a request context, this operation is silently ignored.
	 *
	 * @param metadata - The room member token metadata to store in the context
	 * @param participantIdentity - The participant identity (token subject) to store in the context
	 */
	setRoomMemberTokenInfo(metadata: MeetRoomMemberTokenMetadata, participantIdentity?: string): void {
		const context = this.getContext();

		if (context) {
			context.roomMember = metadata;
			context.roomMember.participantIdentity = participantIdentity;
		}
	}

	/**
	 * Gets the room ID to which the room member belongs from the current request context.
	 */
	getRoomIdFromMember(): string | undefined {
		return this.getContext()?.roomMember?.roomId;
	}

	/**
	 * Gets the room member ID from the current request context.
	 */
	getRoomMemberId(): string | undefined {
		return this.getContext()?.roomMember?.memberId;
	}

	/**
	 * Gets the participant identity from the current request context.
	 */
	getParticipantIdentity(): string | undefined {
		return this.getContext()?.roomMember?.participantIdentity;
	}

	/**
	 * Gets the room member permissions from the current request context.
	 */
	getRoomMemberPermissions(): MeetRoomMemberPermissions | undefined {
		return this.getContext()?.roomMember?.permissions;
	}
}
