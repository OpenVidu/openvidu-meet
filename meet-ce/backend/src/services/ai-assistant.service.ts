import { MeetAssistantCapabilityName, MeetCreateAssistantResponse } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { errorInsufficientPermissions } from '../models/error.model.js';
import { RedisKeyName } from '../models/redis.model.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { RedisService } from './redis.service.js';
import { RoomService } from './room.service.js';

@injectable()
export class AiAssistantService {
	private readonly ASSISTANT_STATE_LOCK_TTL = ms('15s');

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
		const lockName = MeetLock.getAiAssistantLock(roomId, capability);

		try {
			await this.validateCreateConditions(roomId, capability);

			const lock = await this.mutexService.acquire(lockName, this.ASSISTANT_STATE_LOCK_TTL);

			if (!lock) {
				this.logger.error(`Could not acquire lock '${lockName}' for creating assistant in room '${roomId}'`);
				throw new Error('Could not acquire lock for creating assistant. Please try again.');
			}

			const existingAgent = await this.livekitService.getAgent(roomId, INTERNAL_CONFIG.CAPTIONS_AGENT_NAME);

			if (existingAgent) {
				await this.setParticipantAssistantState(roomId, participantIdentity, capability, true);
				return { id: existingAgent.id, status: 'active' };
			}

			const assistant = await this.livekitService.createAgent(roomId, INTERNAL_CONFIG.CAPTIONS_AGENT_NAME);

			await this.setParticipantAssistantState(roomId, participantIdentity, capability, true);

			return {
				id: assistant.id,
				status: 'active'
			};
		} finally {
			await this.mutexService.release(lockName);
		}
	}

	/**
	 *  Stops the specified assistant for the given participant and room.
	 *  If the assistant is not used by any other participants in the room, it will be stopped in LiveKit.
	 * @param assistantId
	 * @param roomId
	 * @param participantIdentity
	 * @returns
	 */
	async cancelAssistant(assistantId: string, roomId: string, participantIdentity: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;
		// The lock only protects the atomic "count → stop dispatch" decision.
		const lockName = MeetLock.getAiAssistantLock(roomId, capability);

		try {
			await this.setParticipantAssistantState(roomId, participantIdentity, capability, false);

			const lock = await this.mutexService.acquire(lockName, this.ASSISTANT_STATE_LOCK_TTL);

			if (!lock) {
				this.logger.warn(
					`Could not acquire lock '${lockName}' for stopping assistant in room '${roomId}'. Participant state saved as disabled.`
				);
				return;
			}

			const enabledParticipants = await this.getEnabledParticipantsCount(roomId, capability);

			if (enabledParticipants > 0) {
				this.logger.debug(
					`Skipping assistant stop for room '${roomId}'. Remaining enabled participants: ${enabledParticipants}`
				);
				return;
			}

			const assistant = await this.livekitService.getAgent(roomId, assistantId);

			if (!assistant) {
				this.logger.warn(`Captions assistant not found in room '${roomId}'. Skipping stop request.`);
				return;
			}

			await this.livekitService.stopAgent(assistantId, roomId);
		} finally {
			await this.mutexService.release(lockName);
		}
	}

	/**
	 * Cleanup assistant state in a room.
	 * - If participantIdentity is provided, removes only that participant state.
	 * - If participantIdentity is omitted, removes all assistant state in the room.
	 *
	 * If no enabled participants remain after cleanup, captions agent dispatch is stopped.
	 */
	async cleanupState(roomId: string, participantIdentity?: string): Promise<void> {
		const capability = MeetAssistantCapabilityName.LIVE_CAPTIONS;
		const lockName = MeetLock.getAiAssistantLock(roomId, capability);

		try {
			if (participantIdentity) {
				await this.setParticipantAssistantState(roomId, participantIdentity, capability, false);
			}

			// acquireWithRetry because this is called from webhooks (participantLeft / roomFinished).
			// The agent may run indefinitely with no further opportunity to stop it.
			const lock = await this.mutexService.acquireWithRetry(lockName, this.ASSISTANT_STATE_LOCK_TTL);

			if (!lock) {
				const scope = participantIdentity ? `participant '${participantIdentity}'` : `room '${roomId}'`;
				this.logger.error(
					`Could not acquire lock '${lockName}' for dispatch cleanup (${scope}) after retries. ` +
						(participantIdentity
							? 'Participant state was saved but dispatch stop may be skipped.'
							: 'Room state cleanup and dispatch stop were skipped.')
				);
				return;
			}

			if (!participantIdentity) {
				const pattern = `${RedisKeyName.AI_ASSISTANT_PARTICIPANT_STATE}${roomId}:${capability}:*`;
				const keys = await this.redisService.getKeys(pattern);

				if (keys.length > 0) {
					await this.redisService.delete(keys);
				}
			}

			const enabledParticipants = await this.getEnabledParticipantsCount(roomId, capability);

			if (enabledParticipants > 0) {
				return;
			}

			await this.stopCaptionsAssistantIfRunning(roomId);
		} catch (error) {
			this.logger.error(`Error occurred while cleaning up assistant state for room '${roomId}': ${error}`);
		} finally {
			await this.mutexService.release(lockName);
		}
	}

	protected async validateCreateConditions(roomId: string, capability: MeetAssistantCapabilityName): Promise<void> {
		if (capability === MeetAssistantCapabilityName.LIVE_CAPTIONS) {
			if (MEET_ENV.CAPTIONS_ENABLED !== 'true') {
				throw errorInsufficientPermissions();
			}

			const room = await this.roomService.getMeetRoom(roomId);

			if (!room.config.captions.enabled) {
				throw errorInsufficientPermissions();
			}
		}
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
		const key = this.getParticipantAssistantStateKey(roomId, participantIdentity, capability);

		if (!enabled) {
			await this.redisService.delete(key);
			return;
		}

		await this.redisService.setIfNotExists(
			key,
			JSON.stringify({
				enabled: true,
				updatedAt: Date.now()
			})
		);
	}

	/**
	 * Gets the count of participants that have the specified assistant capability enabled in the given room.
	 * @param roomId
	 * @param capability
	 * @returns
	 */
	protected async getEnabledParticipantsCount(
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

	protected async stopCaptionsAssistantIfRunning(roomId: string): Promise<void> {
		const assistants = await this.livekitService.listAgents(roomId);

		if (assistants.length === 0) return;

		const captionsAssistant = assistants.find(
			(assistant) => assistant.agentName === INTERNAL_CONFIG.CAPTIONS_AGENT_NAME
		);

		if (!captionsAssistant) return;

		await this.livekitService.stopAgent(captionsAssistant.id, roomId);
	}
}
