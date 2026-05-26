import type { MeetCreateAssistantResponse } from '@openvidu-meet/typings';
import { MeetAssistantCapabilityName } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetLock } from '../helpers/redis.helper.js';
import {
	errorAiAssistantAlreadyStarting,
	errorAiAssistantCannotBeStopped,
	errorConfigurationError
} from '../models/error.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { RedisService } from './redis.service.js';
import { RoomService } from './room.service.js';

@injectable()
export class AiAssistantService {
	private readonly ASSISTANT_STATE_LOCK_TTL = ms(INTERNAL_CONFIG.ASSISTANT_STATE_LOCK_TTL);
	// Defensive TTL on the participant set so a missed cleanup doesn't leak forever.
	private readonly PARTICIPANT_SET_TTL_MS = ms('24h');
	// Bounded polling for dispatch visibility when the create lock can't be acquired.
	private readonly DISPATCH_VISIBILITY_RETRIES = 3;
	private readonly DISPATCH_VISIBILITY_DELAY_MS = 250;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(RedisService) protected redisService: RedisService
	) {}

	/**
	 * Creates a live captions assistant for the specified room.
	 * If an assistant already exists for the room, it will be reused.
	 */
	async createLiveCaptionsAssistant(
		roomId: string,
		participantIdentity: string
	): Promise<MeetCreateAssistantResponse> {
		// ! For now, we are assuming that the only capability is live captions.
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;
		const lockKey = MeetLock.getAiAssistantLock(roomId, capability);

		try {
			await this.validateCreateConditions(roomId, capability);

			const executionResult = await this.mutexService.withRetryLock(
				lockKey,
				this.ASSISTANT_STATE_LOCK_TTL,
				async () => {
					const existingDispatch = await this.getActiveAiAssistant(roomId, capability);

					if (existingDispatch) {
						await this.addParticipant(roomId, participantIdentity, capability);
						return { id: existingDispatch.id, status: 'active' as const };
					}

					// Record participant intent first so a backend crash between createAgent
					// and the state write does not leave a dispatch with no tracked participants.
					await this.addParticipant(roomId, participantIdentity, capability);

					try {
						const { id: assistantId } = await this.livekitService.createAgent(
							roomId,
							INTERNAL_CONFIG.CAPTIONS_AGENT_NAME
						);

						return { id: assistantId, status: 'active' as const };
					} catch (error) {
						// Roll back the state write so a failed dispatch creation does not
						// keep the participant counted as active.
						await this.removeParticipant(roomId, participantIdentity, capability);
						throw error;
					}
				}
			);

			if (executionResult !== null) {
				return executionResult;
			}

			throw errorAiAssistantAlreadyStarting(roomId);
		} catch (error) {
			this.logger.error(`Error creating live captions assistant for room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Stops the assistant for the given participant.
	 * If no other participants are using the assistant, it will be stopped in LiveKit.
	 *
	 * The caller-supplied assistantId is intentionally ignored: it could be stale (e.g.
	 * after a rapid disable/enable cycle that produced a new dispatch). The active
	 * dispatch is always resolved through LiveKit inside the lock.
	 */
	async cancelAssistant(_assistantId: string, roomId: string, participantIdentity: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;

		try {
			await this.deactivateParticipant(roomId, participantIdentity, capability);
		} catch (error) {
			this.logger.error(`Error cancelling assistant in room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Cleans up assistant state in a room triggered by a LiveKit webhook.
	 * - If participantIdentity is provided, removes only that participant's state.
	 * - If participantIdentity is omitted, removes all participant state in the room
	 *   and stops the agent.
	 */
	async cleanupState(roomId: string, participantIdentity?: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;

		try {
			if (participantIdentity) {
				await this.deactivateParticipant(roomId, participantIdentity, capability);
			} else {
				await this.cleanupRoom(roomId, capability);
			}
		} catch (error) {
			this.logger.error(`Error occurred while cleaning up assistant state for room '${roomId}': ${error}`);
		}
	}

	/**
	 * Atomically removes a participant's active state and stops the agent if no other
	 * participants remain with the capability enabled.
	 */
	protected async deactivateParticipant(
		roomId: string,
		participantIdentity: string,
		capability: MeetAssistantCapabilityName
	): Promise<void> {
		const lockKey = MeetLock.getAiAssistantLock(roomId, capability);

		const executionResult = await this.mutexService.withRetryLock(
			lockKey,
			this.ASSISTANT_STATE_LOCK_TTL,
			async () => {
				const removed = await this.removeParticipant(roomId, participantIdentity, capability);

				if (removed === 0) {
					// Participant was not tracked as active. Nothing else to do.
					return;
				}

				const remainingCount = await this.getParticipantCountByCapability(roomId, capability);

				if (remainingCount > 0) {
					this.logger.debug(
						`Skipping agent stop for room '${roomId}'. Remaining active participants: ${remainingCount}`
					);
					return;
				}

				await this.stopCaptionsAssistantIfRunning(roomId);
			}
		);

		if (executionResult === null) {
			// Lock could not be acquired. Do NOT mutate state outside the lock — that would
			// break atomicity. Surface the failure so the caller (or the next webhook) can
			// reconcile. Webhook-driven cleanups already swallow this error.
			throw errorAiAssistantCannotBeStopped(roomId);
		}
	}

	/**
	 * Removes all participant states for a room and stops the agent.
	 * Called when a room_finished webhook is received.
	 */
	protected async cleanupRoom(roomId: string, capability: MeetAssistantCapabilityName): Promise<void> {
		const lockKey = MeetLock.getAiAssistantLock(roomId, capability);

		const executionResult = await this.mutexService.withRetryLock(
			lockKey,
			this.ASSISTANT_STATE_LOCK_TTL,
			async () => {
				await Promise.all([
					this.redisService.delete(this.getParticipantSetKey(roomId, capability)),
					this.stopCaptionsAssistantIfRunning(roomId)
				]);
			}
		);

		if (executionResult === null) {
			this.logger.error(
				`Could not acquire lock '${lockKey}' for room cleanup '${roomId}' after retries. ` +
					`Participant set has a TTL fallback, but the agent may still be running in LiveKit.`
			);
		}
	}

	protected async validateCreateConditions(roomId: string, capability: MeetAssistantCapabilityName): Promise<void> {
		if (capability === MeetAssistantCapabilityName.LIVE_CAPTIONS) {
			if (MEET_ENV.CAPTIONS_ENABLED !== 'true') {
				throw errorConfigurationError(
					'Live captions are not enabled in the server configuration. Please set CAPTIONS_ENABLED to true to enable this feature.'
				);
			}

			const room = await this.roomService.getMeetRoom(roomId);

			if (!room.config.captions.enabled) {
				throw errorConfigurationError('Live captions are not enabled in the room configuration.');
			}
		}
	}

	/**
	 * Adds the participant to the active set and refreshes the TTL on the key.
	 */
	protected async addParticipant(
		roomId: string,
		participantIdentity: string,
		capability: MeetAssistantCapabilityName
	): Promise<void> {
		await this.redisService.addToSet(
			this.getParticipantSetKey(roomId, capability),
			participantIdentity,
			this.PARTICIPANT_SET_TTL_MS
		);
	}

	/**
	 * Removes the participant from the active set.
	 * @returns 1 if the participant was previously tracked, 0 otherwise.
	 */
	protected async removeParticipant(
		roomId: string,
		participantIdentity: string,
		capability: MeetAssistantCapabilityName
	): Promise<number> {
		return this.redisService.removeFromSet(this.getParticipantSetKey(roomId, capability), participantIdentity);
	}

	protected async getParticipantCountByCapability(
		roomId: string,
		capability: MeetAssistantCapabilityName
	): Promise<number> {
		return this.redisService.getCardinality(this.getParticipantSetKey(roomId, capability));
	}

	protected getParticipantSetKey(roomId: string, capability: MeetAssistantCapabilityName): string {
		return `${RedisKeyName.AI_ASSISTANT_PARTICIPANTS}${roomId}:${capability}`;
	}

	/**
	 * Gets the active LiveKit dispatch for the given room and capability, or null if no
	 * assistant is currently active.
	 */
	protected async getActiveAiAssistant(roomId: string, capability: MeetAssistantCapabilityName) {
		if (capability !== MeetAssistantCapabilityName.LIVE_CAPTIONS) {
			return null;
		}

		return this.livekitService.getAgentDispatch(roomId, INTERNAL_CONFIG.CAPTIONS_AGENT_NAME);
	}

	/**
	 * Resolves the active dispatch via LiveKit and stops it if present. No-op if no
	 * dispatch is active (e.g. room already torn down).
	 */
	protected async stopCaptionsAssistantIfRunning(roomId: string): Promise<void> {
		const dispatch = await this.getActiveAiAssistant(roomId, MeetAssistantCapabilityName.LIVE_CAPTIONS);

		if (!dispatch) return;

		await this.livekitService.stopAgent(dispatch.id, roomId);
	}
}
