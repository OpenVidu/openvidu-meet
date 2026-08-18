import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { RedisKeyName } from '../models/redis.model.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';

/**
 * Tracks, per room, whether a deliberate recording stop has disarmed the recording auto-start for
 * the rest of the current meeting (see {@link RecordingService#stopRecordingEgress} and
 * {@link LivekitWebhookService#autoStartRecordingIfConfigured}). The stored value is the meeting's
 * LiveKit room sid, so a flag leaked by a lost `room_finished` event is inert for later meetings
 * instead of blocking their auto-start until the TTL expires.
 */
@injectable()
export class RecordingAutoStartStateService {
	private readonly DISABLED_TTL_MS = ms(INTERNAL_CONFIG.RECORDING_AUTO_START_DISABLED_TTL);

	constructor(
		@inject(RedisService) protected redisService: RedisService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * Marks the room's recording auto-start as disabled for the rest of the current meeting, shared
	 * across replicas via Redis (the stop and the later `participant_joined` webhooks may be handled
	 * by different backend instances).
	 */
	async markDisabled(roomId: string, meetingId: string): Promise<void> {
		if (!meetingId) {
			this.logger.warn(
				`Cannot scope the recording auto-start disable flag for room '${roomId}': the egress carries no room sid`
			);
			return;
		}

		try {
			await this.redisService.set(this.getKey(roomId), meetingId, this.DISABLED_TTL_MS);
		} catch (error) {
			this.logger.warn(`Error disabling recording auto-start for room '${roomId}'`, error);
		}
	}

	/**
	 * Whether the room's recording auto-start was disabled by a deliberate stop during the given
	 * meeting (`meetingId` is the LiveKit room sid). A flag scoped to a different meeting is a
	 * leftover and never blocks. A positive answer also refreshes the flag's TTL, so meetings that
	 * outlive the TTL stay covered for as long as participants keep joining.
	 */
	async isDisabled(roomId: string, meetingId: string): Promise<boolean> {
		const key = this.getKey(roomId);
		const value = await this.redisService.get(key);
		const disabled = value !== null && value === meetingId;

		if (disabled) {
			try {
				await this.redisService.setExpiration(key, this.DISABLED_TTL_MS / 1000);
			} catch (error) {
				this.logger.warn(`Error refreshing the recording auto-start disable flag for room '${roomId}'`, error);
			}
		}

		return disabled;
	}

	/**
	 * Re-arms the room's recording auto-start. Called when the meeting ends (`room_finished`), so
	 * the next meeting in the same room auto-starts its recording again. Never throws: the callers
	 * (the `room_finished` handler, the stop-failure compensation in {@link RecordingService}) must
	 * not be aborted by flag bookkeeping, and a leaked flag is inert for later meetings anyway (it is
	 * scoped to the sid).
	 */
	async clearDisabled(roomId: string): Promise<void> {
		try {
			await this.redisService.delete(this.getKey(roomId));
		} catch (error) {
			this.logger.warn(`Error re-arming recording auto-start for room '${roomId}'`, error);
		}
	}

	private getKey(roomId: string): string {
		return `${RedisKeyName.RECORDING_AUTO_START_DISABLED}${roomId}`;
	}
}
