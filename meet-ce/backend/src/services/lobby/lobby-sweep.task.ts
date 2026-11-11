import { inject, injectable } from 'inversify';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../../config/internal-config.js';
import { runConcurrently } from '../../utils/concurrency.utils.js';
import { LoggerService } from '../logger.service.js';
import { TaskSchedulerService } from '../task-scheduler.service.js';
import { LobbyStateService } from './lobby-state.service.js';
import { LobbyService } from './lobby.service.js';

/**
 * Expires, once per cluster every few seconds, the waits whose client has been out of touch for a minute
 * and the admissions not used by joining within a minute, from Redis alone. A pass that follows a gap
 * (a Redis outage holding queued commands, a stalled replica) expires nobody, nor do the passes shortly
 * after it, so every connection has written its presence again before anyone is judged unseen.
 */
@injectable()
export class LobbySweepTask {
	constructor(
		@inject(LobbyStateService) protected lobbyStateService: LobbyStateService,
		@inject(LobbyService) protected lobbyService: LobbyService,
		@inject(TaskSchedulerService) taskSchedulerService: TaskSchedulerService,
		@inject(LoggerService) protected logger: LoggerService
	) {
		taskSchedulerService.registerTask({
			name: 'lobbySweep',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.LOBBY_SWEEP_INTERVAL,
			callback: () => this.sweep()
		});
	}

	async sweep(): Promise<void> {
		const { now, lastRun, gapAt, due } = await this.lobbyStateService.sweep();

		if (lastRun !== undefined && now - lastRun > ms(INTERNAL_CONFIG.LOBBY_SWEEP_MAX_GAP)) {
			this.logger.warn(
				`The waiting room sweep ran ${now - lastRun} ms after its previous pass: no wait expires for the next ${INTERNAL_CONFIG.LOBBY_SWEEP_GAP_GRACE}`
			);
			await this.lobbyStateService.recordSweepGap(now);
			return;
		}

		if (gapAt !== undefined && now - gapAt < ms(INTERNAL_CONFIG.LOBBY_SWEEP_GAP_GRACE)) return;

		const waitIdsByRoom = Map.groupBy(due, ({ roomId }) => roomId);
		const rooms = [...waitIdsByRoom.entries()];
		const results = await runConcurrently(
			rooms,
			([roomId, waits]) =>
				this.lobbyService.expire(
					roomId,
					waits.map(({ waitId }) => waitId)
				),
			{ concurrency: INTERNAL_CONFIG.CONCURRENCY_LOBBY_SWEEP }
		);

		results.forEach((result, index) => {
			if (result.status === 'rejected') {
				this.logger.warn(`Could not expire the waits of room '${rooms[index][0]}'`, result.reason);
			}
		});
	}
}
