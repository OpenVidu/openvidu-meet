import { inject, injectable } from 'inversify';
import type { ParticipantInfo } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetParticipantHelper } from '../helpers/participant.helper.js';
import { RedisKeyName } from '../models/redis.model.js';
import type { MeetRecordingAutoStartPreset } from '../types/recording-auto-start.types.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';

/**
 * Tracks, per room, whether a deliberate recording stop has disarmed the recording auto-start for
 * the rest of the current meeting (see {@link RecordingService#stopRecordingEgress}). The stored
 * value is the meeting's LiveKit room sid, so a flag leaked by a lost `room_finished` event is
 * inert for later meetings instead of blocking their auto-start until the TTL expires.
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
	 * Reactivates the room's recording auto-start. Called when the meeting ends
	 * ({@link RecordingService#reactivateAutoRecording}, itself called from the `room_finished`
	 * handler), so the next meeting in the same room auto-starts its recording again. Never throws:
	 * the `room_finished` handling must not be aborted by flag bookkeeping, and a leaked flag is
	 * inert for later meetings anyway (it is scoped to the sid).
	 */
	async activateAutoStart(roomId: string): Promise<void> {
		try {
			await this.redisService.delete(this.getKey(roomId));
		} catch (error) {
			this.logger.warn(`Error reactivating recording auto-start for room '${roomId}'`, error);
		}
	}

	/**
	 * Determines whether a recording auto-start should trigger for the current meeting state.
	 *
	 * The check is based on the room's auto-start preset, the participant that just joined, and the
	 * standard participants currently in the meeting (excluding the joiner). The joiner is included
	 * in the count if they are not already listed and they are eligible for the preset.
	 *
	 * @param roomId - The room where the meeting is taking place
	 * @param preset - The auto-start preset configured for the room
	 * @param joiner - The participant that just joined the meeting, triggering this check
	 * @param participants - The standard participants currently in the meeting (excluding the joiner)
	 * @returns `true` if the auto-start threshold is reached, `false` otherwise
	 */
	hasReachedAutoStartThreshold(
		roomId: string,
		preset: MeetRecordingAutoStartPreset,
		joiner: ParticipantInfo,
		participants: ParticipantInfo[]
	): boolean {
		const isParticipantEligible = (participant: ParticipantInfo): boolean =>
			preset.participantRoles.includes(MeetParticipantHelper.extractRole(participant));

		const isJoinerAlreadyListed = participants.some((participant) => participant.identity === joiner.identity);

		const listedEligibleParticipants = participants.filter(isParticipantEligible).length;

		const joinerCountsTowardsThreshold = !isJoinerAlreadyListed && isParticipantEligible(joiner);

		const eligibleParticipantCount = listedEligibleParticipants + (joinerCountsTowardsThreshold ? 1 : 0);

		const thresholdReached = eligibleParticipantCount >= preset.minParticipants;

		if (!thresholdReached) {
			this.logger.verbose(
				`Skipping recording auto-start in room '${roomId}': threshold not reached (${eligibleParticipantCount}/${preset.minParticipants})`
			);
		}

		return thresholdReached;
	}

	private getKey(roomId: string): string {
		return `${RedisKeyName.RECORDING_AUTO_START_DISABLED}${roomId}`;
	}
}
