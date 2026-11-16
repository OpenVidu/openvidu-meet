import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { runConcurrently } from '../../utils/concurrency.utils.js';
import { LoggerService } from '../logger.service.js';
import { TaskSchedulerService } from '../task-scheduler.service.js';
import { WaitingParticipantStateService } from './waiting-participant-state.service.js';
import { WaitingParticipantService } from './waiting-participant.service.js';

/**
 * Expires, once per cluster every few seconds, the waits whose client has been out of touch for a minute
 * and the admissions not used by joining within a minute, from Redis alone. A pass that follows a gap
 * (a Redis outage holding queued commands, a stalled replica) expires nobody, nor do the passes shortly
 * after it, so every connection has written its presence again before anyone is judged unseen.
 */
@injectable()
export class WaitingParticipantSweepTask {
	constructor(
		@inject(WaitingParticipantStateService)
		protected waitingParticipantStateService: WaitingParticipantStateService,
		@inject(WaitingParticipantService) protected waitingParticipantService: WaitingParticipantService,
		@inject(TaskSchedulerService) taskSchedulerService: TaskSchedulerService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		taskSchedulerService.registerTask({
			name: 'waitingParticipantSweep',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.WAITING_PARTICIPANT_SWEEP_INTERVAL,
			callback: () => this.sweep()
		});
	}

	async sweep(): Promise<void> {
		const { now, lastRun, gapAt, due } = await this.waitingParticipantStateService.sweep();

		if (lastRun !== undefined && now - lastRun > ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_SWEEP_MAX_GAP)) {
			this.logger.warn(
				`The waiting participant sweep ran ${now - lastRun} ms after its previous pass: no wait expires for the next ${INTERNAL_CONFIG.WAITING_PARTICIPANT_SWEEP_GAP_GRACE}`
			);
			await this.waitingParticipantStateService.recordSweepGap(now);
			return;
		}

		if (gapAt !== undefined && now - gapAt < ms(INTERNAL_CONFIG.WAITING_PARTICIPANT_SWEEP_GAP_GRACE)) return;

		const waitIdsByRoom = Map.groupBy(due, ({ roomId }) => roomId);
		const rooms = [...waitIdsByRoom.entries()];
		const results = await runConcurrently(
			rooms,
			([roomId, waits]) =>
				this.waitingParticipantService.expire(
					roomId,
					waits.map(({ waitId }) => waitId)
				),
			{ concurrency: INTERNAL_CONFIG.CONCURRENCY_WAITING_PARTICIPANT_SWEEP }
		);

		results.forEach((result, index) => {
			if (result.status === 'rejected') {
				this.logger.warn(`Could not expire the waits of room '${rooms[index][0]}'`, result.reason);
			}
		});
	}
}
