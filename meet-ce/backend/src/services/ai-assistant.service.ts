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
	 * @param roomId
	 * @param participantIdentity
	 * @returns
	 */
	async createLiveCaptionsAssistant(
		roomId: string,
		participantIdentity: string
	): Promise<MeetCreateAssistantResponse> {
		// ! For now, we are assuming that the only capability is live captions.
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;
		const lockKey = MeetLock.getAiAssistantLock(roomId, capability);
		let executionResult: MeetCreateAssistantResponse | null = null;

		try {
			await this.validateCreateConditions(roomId, capability);

			executionResult = await this.mutexService.withRetryLock(
				lockKey,
				this.ASSISTANT_STATE_LOCK_TTL,
				async () => {
					const currentAssistantId = await this.getAiAssistantId(roomId, capability);

					if (currentAssistantId) {
						await this.setParticipantAssistantState(roomId, participantIdentity, capability, true);
						return { id: currentAssistantId, status: 'active' };
					}

					// Create a new assistant if none exists for this room/capability.
					const { id: assistantId } = await this.livekitService.createAgent(
						roomId,
						INTERNAL_CONFIG.CAPTIONS_AGENT_NAME
					);

					await Promise.all([
						this.setAiAssistantId(roomId, capability, assistantId),
						this.setParticipantAssistantState(roomId, participantIdentity, capability, true)
					]);

					return {
						id: assistantId,
						status: 'active'
					};
				}
			);

			if (executionResult === null) {
				// Lock could not be acquired after retries. The agent is likely being created
				// by a concurrent request. Try to read the ID already written to Redis and
				// register this participant so their state is not lost.
				this.logger.warn(
					`Could not acquire lock for creating assistant in room '${roomId}'. ` +
						`Attempting to register participant '${participantIdentity}' using existing Redis state.`
				);

				const existingAssistantId = await this.getAiAssistantId(roomId, capability);

				if (existingAssistantId) {
					await this.setParticipantAssistantState(roomId, participantIdentity, capability, true);
					return { id: existingAssistantId, status: 'active' };
				}

				// ID not in Redis yet — creation is still in progress and we cannot safely proceed.
				throw errorAiAssistantAlreadyStarting(roomId);
			}

			return executionResult;
		} catch (error) {
			this.logger.error(`Error creating live captions assistant for room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Stops the specified assistant for the given participant and room.
	 * If no other participants are using the assistant, it will be stopped in LiveKit.
	 * @param assistantId
	 * @param roomId
	 * @param participantIdentity
	 */
	async cancelAssistant(assistantId: string, roomId: string, participantIdentity: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;

		try {
			await this.deactivateParticipant(roomId, participantIdentity, capability);
		} catch (error) {
			this.logger.error(`Error cancelling assistant '${assistantId}' in room '${roomId}': ${error}`);
			throw error;
		}
	}

	/**
	 * Cleans up assistant state in a room triggered by a LiveKit webhook.
	 * - If participantIdentity is provided, removes only that participant's state.
	 * - If participantIdentity is omitted, removes all participant state in the room.
	 *
	 * If no enabled participants remain after cleanup, the agent is stopped in LiveKit.
	 */
	async cleanupState(roomId: string, participantIdentity?: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;

		try {
			if (participantIdentity) {
				// Single participant left: deactivate them and stop the agent if no one else is active.
				await this.deactivateParticipant(roomId, participantIdentity, capability);
			} else {
				// Entire room finished: wipe all participant states and unconditionally stop the agent.
				await this.cleanupRoom(roomId, capability);
			}
		} catch (error) {
			this.logger.error(`Error occurred while cleaning up assistant state for room '${roomId}': ${error}`);
		}
	}

	/**
	 * Atomically removes a participant's active state and stops the agent if no other
	 * participants remain with the capability enabled.
	 *
	 * Both operations run inside the same distributed lock to prevent the race condition
	 * where a concurrent process observes a stale count between the state deletion and
	 * the stop decision.
	 *
	 * @throws {OpenViduMeetError} if the lock cannot be acquired after all retries,
	 * ensuring callers always know when the operation was not performed.
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
				await this.setParticipantAssistantState(roomId, participantIdentity, capability, false);

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
			await this.setParticipantAssistantState(roomId, participantIdentity, capability, false);
			throw errorAiAssistantCannotBeStopped(roomId);
		}
	}

	/**
	 * Removes all participant states for a room and stops the agent unconditionally.
	 * Called when a room_finished webhook is received — no need to count participants
	 * since all state is being wiped.
	 */
	protected async cleanupRoom(roomId: string, capability: MeetAssistantCapabilityName): Promise<void> {
		const lockKey = MeetLock.getAiAssistantLock(roomId, capability);

		const executionResult = await this.mutexService.withRetryLock(
			lockKey,
			this.ASSISTANT_STATE_LOCK_TTL,
			async () => {
				await Promise.all([
					this.deleteParticipantAssistantState(roomId, capability),
					this.stopCaptionsAssistantIfRunning(roomId)
				]);
			}
		);

		if (executionResult === null) {
			this.logger.error(
				`Could not acquire lock '${lockKey}' for room cleanup '${roomId}' after retries. ` +
					`Room state and agent stop were skipped.`
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

	protected async deleteParticipantAssistantState(
		roomId: string,
		capability: MeetAssistantCapabilityName,
		participantIdentity?: string
	): Promise<void> {
		if (participantIdentity) {
			const key = this.getParticipantAssistantStateKey(roomId, participantIdentity, capability);
			await this.redisService.delete(key);
			return;
		}

		const pattern = `${RedisKeyName.AI_ASSISTANT_PARTICIPANT_STATE}${roomId}:${capability}:*`;
		const keys = await this.redisService.getKeys(pattern);

		if (keys.length === 0) {
			return;
		}

		await this.redisService.delete(keys);
	}

	/**
	 * Sets or clears the assistant state for a participant in Redis.
	 * @param roomId
	 * @param participantIdentity
	 * @param capability
	 * @param enabled
	 */
	protected async setParticipantAssistantState(
		roomId: string,
		participantIdentity: string,
		capability: MeetAssistantCapabilityName,
		enabled: boolean
	): Promise<void> {
		if (enabled) {
			const key = this.getParticipantAssistantStateKey(roomId, participantIdentity, capability);
			await this.redisService.setIfNotExists(
				key,
				JSON.stringify({
					enabled: true,
					updatedAt: Date.now()
				})
			);
			return;
		}

		await this.deleteParticipantAssistantState(roomId, capability, participantIdentity);
	}

	/**
	 * Gets the count of participants that have the specified assistant capability enabled in the given room.
	 * @param roomId
	 * @param capability
	 * @returns
	 */
	protected async getParticipantCountByCapability(
		roomId: string,
		capability: MeetAssistantCapabilityName
	): Promise<number> {
		const pattern = `${RedisKeyName.AI_ASSISTANT_PARTICIPANT_STATE}${roomId}:${capability}:*`;
		const keys = await this.redisService.getKeys(pattern);
		return keys.length;
	}

	protected getParticipantAssistantStateKey(
		roomId: string,
		participantIdentity: string,
		capability: MeetAssistantCapabilityName
	): string {
		return `${RedisKeyName.AI_ASSISTANT_PARTICIPANT_STATE}${roomId}:${capability}:${participantIdentity}`;
	}

	protected getAiAssistantIdKey(roomId: string, capability: MeetAssistantCapabilityName): string {
		return `${RedisKeyName.AI_ASSISTANT_ID}${roomId}:${capability}`;
	}

	/**
	 * Gets the active AI assistant ID for the given room and capability, or null if no assistant is currently active.
	 * @param roomId
	 * @param capability
	 * @returns
	 */
	protected async getAiAssistantId(roomId: string, capability: MeetAssistantCapabilityName): Promise<string | null> {
		return this.redisService.get(this.getAiAssistantIdKey(roomId, capability));
	}

	protected async setAiAssistantId(
		roomId: string,
		capability: MeetAssistantCapabilityName,
		aiAssistantId: string
	): Promise<void> {
		await this.redisService.setIfNotExists(this.getAiAssistantIdKey(roomId, capability), aiAssistantId);
	}

	/**
	 * Deletes the stored AI assistant ID for the given room and capability.
	 * @param roomId
	 * @param capability
	 */
	protected async deleteAiAssistantId(roomId: string, capability: MeetAssistantCapabilityName): Promise<void> {
		await this.redisService.delete(this.getAiAssistantIdKey(roomId, capability));
	}

	protected async stopCaptionsAssistantIfRunning(roomId: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;
		const aiAssistantId = await this.getAiAssistantId(roomId, capability);

		// If no assistant ID is stored, we can skip the stop call to LiveKit.
		if (!aiAssistantId) return;

		await this.livekitService.stopAgent(aiAssistantId, roomId);
		await this.deleteAiAssistantId(roomId, capability);
	}
}
