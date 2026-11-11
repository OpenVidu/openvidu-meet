import { MeetEventOrigin, MeetMeetingEndedReason } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { Room } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetLock } from '../helpers/redis.helper.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { RedisKeyName } from '../models/redis.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { LiveKitService } from './livekit.service.js';
import { LobbyService } from './lobby/lobby.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { RedisService } from './redis.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';

/**
 * Ends a meeting when it reaches its room's `maxDurationMinutes`: a timer per meeting, armed when
 * the meeting starts, and a sweep that gives a timer back to every meeting whose timer died with its
 * replica. It also tells the `meetingEnded` webhook which ends it caused.
 */
@injectable()
export class MeetingDurationLimitService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(RedisService) protected redisService: RedisService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(LobbyService) protected lobbyService: LobbyService
	) {
		this.taskSchedulerService.registerTask({
			name: 'reconcileDurationLimitTimersGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.MEETING_DURATION_LIMIT_GC_INTERVAL,
			callback: this.reconcileDurationLimitTimersGC.bind(this)
		});
	}

	/**
	 * Arms the timer that ends the meeting running in `livekitRoom` the moment it reaches its room's
	 * `maxDurationMinutes`, replacing any timer already armed for that room. The deadline is the
	 * meeting's own state, so re-arming mid-meeting keeps it.
	 */
	scheduleMeetingEndAtDurationLimit(livekitRoom: Room, maxDurationMinutes: number): void {
		const remainingMs = this.meetingRemainingMs(livekitRoom, maxDurationMinutes);
		this.armDurationLimitTimer(livekitRoom, maxDurationMinutes, Math.max(remainingMs, 0));
	}

	/**
	 * Disarms the duration-limit timer of `roomId`, for a meeting that ended by any other means.
	 * The timer only exists on the replica that armed it, so {@link endMeetingIfPastDurationLimit}
	 * checks the deadline again before ending anything.
	 */
	cancelMeetingEndAtDurationLimit(roomId: string): void {
		this.taskSchedulerService.cancelTask(MeetRoomHelper.durationLimitTimerName(roomId));
	}

	/**
	 * Arms the timer to fire in `delayMs`, carrying the delay its own failed end would retry with.
	 */
	protected armDurationLimitTimer(
		livekitRoom: Room,
		maxDurationMinutes: number,
		delayMs: number,
		nextRetryDelayMs = ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_RETRY_DELAY)
	): void {
		const name = MeetRoomHelper.durationLimitTimerName(livekitRoom.name);

		this.taskSchedulerService.cancelTask(name);
		this.taskSchedulerService.registerTask({
			name,
			type: 'timeout',
			scheduleOrDelay: `${delayMs}ms`,
			callback: () => this.runDurationLimitTimer(livekitRoom, maxDurationMinutes, nextRetryDelayMs)
		});
	}

	/**
	 * Body of a fired timer: ends the meeting it was armed for, re-arming itself for the deadline it
	 * has yet to reach, or for another attempt at an end that did not land. A fired timer no longer
	 * exists, so every path out of here either re-arms or leaves the meeting to the sweep.
	 *
	 * `armedMeeting` is compared against the meeting running now before anything is ended: a timer
	 * outliving the meeting it was armed for carries that meeting's limit, which is not necessarily
	 * the room's limit now.
	 */
	protected async runDurationLimitTimer(
		armedMeeting: Room,
		maxDurationMinutes: number,
		retryDelayMs: number
	): Promise<void> {
		const roomId = armedMeeting.name;

		try {
			const currentMeeting = await this.livekitService.findRoom(roomId);

			if (currentMeeting?.sid !== armedMeeting.sid) {
				return;
			}

			const remainingMs = this.meetingRemainingMs(currentMeeting, maxDurationMinutes);

			if (!this.isDurationLimitReached(remainingMs)) {
				this.armDurationLimitTimer(currentMeeting, maxDurationMinutes, remainingMs);
				return;
			}

			if (await this.endMeetingIfPastDurationLimit(roomId, maxDurationMinutes)) {
				return;
			}

			this.retryDurationLimitTimer(armedMeeting, maxDurationMinutes, retryDelayMs);
		} catch (error) {
			this.logger.error(`Error running the duration-limit timer of room '${roomId}':`, error);
			this.retryDurationLimitTimer(armedMeeting, maxDurationMinutes, retryDelayMs);
		}
	}

	/**
	 * Re-arms a timer whose end could not be carried out, doubling the delay per consecutive
	 * attempt. Retrying stops once it would be slower than the safety-net sweep, which owns the end
	 * from there.
	 */
	protected retryDurationLimitTimer(armedMeeting: Room, maxDurationMinutes: number, retryDelayMs: number): void {
		if (retryDelayMs > ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_GC_INTERVAL)) {
			return;
		}

		this.armDurationLimitTimer(armedMeeting, maxDurationMinutes, retryDelayMs, retryDelayMs * 2);
	}

	protected meetingRemainingMs(livekitRoom: Room, maxDurationMinutes: number): number {
		return MeetRoomHelper.meetingRemainingMs(livekitRoom, maxDurationMinutes, Date.now());
	}

	/**
	 * A remainder this small is spent ending the meeting anyway, so it counts as reached rather
	 * than as a deadline to wait for. It is also what keeps a timer that fires a hair early, its
	 * delay counted down on the monotonic clock against a wall-clock deadline, from re-arming for
	 * a millisecond.
	 */
	protected isDurationLimitReached(remainingMs: number): boolean {
		return remainingMs <= ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_TOLERANCE);
	}

	/**
	 * Safety net for the per-meeting timers armed at `room_started`
	 * ({@link scheduleMeetingEndAtDurationLimit}): walks the active rooms that declare a limit, ends
	 * the meetings already past their deadline and re-arms the timer of every meeting still running,
	 * so a meeting whose timer died with its replica (a restart or a rolling deploy included) gets
	 * one back and is ended on time rather than on this sweep's next tick. Its interval bounds how
	 * far a meeting can overrun only while it has no timer, at most one tick.
	 *
	 * Re-arming is what this mostly does: a timer lives in the memory of the single replica that
	 * armed it, and nothing else restores one.
	 */
	protected async reconcileDurationLimitTimersGC(): Promise<void> {
		this.logger.verbose(`Checking meetings over their duration limit at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_MEETING_DURATION_LIMIT_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let totalEndedMeetings = 0;

			while (hasMore) {
				const limitedRoomsPage = await this.roomRepository.findActiveRoomsWithMaxDuration(
					BATCH_SIZE,
					nextPageToken
				);

				if (limitedRoomsPage.rooms.length === 0) {
					break;
				}

				const results = await runConcurrently(
					limitedRoomsPage.rooms,
					async (meetRoom) => {
						const maxDurationMinutes = meetRoom.config.maxDurationMinutes;

						if (!maxDurationMinutes) {
							return false;
						}

						try {
							// The deadline lives in the LiveKit room. A room that is gone by now
							// simply ended on its own; the status GC reconciles it.
							const livekitRoom = await this.livekitService.findRoom(meetRoom.roomId);

							if (!livekitRoom) {
								return false;
							}

							const remainingMs = this.meetingRemainingMs(livekitRoom, maxDurationMinutes);

							if (!this.isDurationLimitReached(remainingMs)) {
								this.scheduleMeetingEndAtDurationLimit(livekitRoom, maxDurationMinutes);
								return false;
							}

							return await this.endMeetingIfPastDurationLimit(meetRoom.roomId, maxDurationMinutes);
						} catch (error) {
							this.logger.error(
								`Error enforcing the duration limit of room '${meetRoom.roomId}':`,
								error
							);
							// Continue with other rooms even if one fails
							return false;
						}
					},
					{ concurrency: INTERNAL_CONFIG.CONCURRENCY_MEETING_DURATION_LIMIT_GC, failFast: true }
				);

				totalEndedMeetings += results.filter(Boolean).length;

				hasMore = limitedRoomsPage.isTruncated;
				nextPageToken = limitedRoomsPage.nextPageToken;
			}

			if (totalEndedMeetings > 0) {
				this.logger.info(`Meeting duration sweep finished. Meetings ended: ${totalEndedMeetings}`);
			}
		} catch (error) {
			this.logger.error('Error checking meetings over their duration limit:', error);
		}
	}

	/**
	 * Ends the meeting running in `roomId` if it is already past `maxDurationMinutes`, by deleting
	 * its LiveKit room: the exact flow a moderator's `meetingEnd` triggers, so participants leave
	 * with the `meeting_ended` reason and the `meetingEnded` webhook fires. LiveKit has no native
	 * duration limit, so this is what enforces the configured one.
	 *
	 * The deadline is re-read from the live LiveKit room under a per-room lock, so that the timer
	 * and the sweep cannot both claim the same end.
	 *
	 * @returns whether this call is what ended the meeting.
	 */
	protected async endMeetingIfPastDurationLimit(roomId: string, maxDurationMinutes: number): Promise<boolean> {
		const lockKey = MeetLock.getDurationLimitEndLock(roomId);
		const ended = await this.mutexService.withLock(
			lockKey,
			ms(INTERNAL_CONFIG.MEETING_DURATION_LIMIT_LOCK_TTL),
			async () => {
				const livekitRoom = await this.livekitService.findRoom(roomId);

				if (!livekitRoom) {
					return false;
				}

				const remainingMs = this.meetingRemainingMs(livekitRoom, maxDurationMinutes);

				if (!this.isDurationLimitReached(remainingMs)) {
					return false;
				}

				this.logger.info(
					`Meeting in room '${roomId}' exceeded its ${maxDurationMinutes}-minute limit. Ending it.`
				);
				// deleteRoom is what triggers room_finished, whose handler reads this flag.
				await this.recordMeetingEndedReason(roomId, livekitRoom.sid);

				let deleted = false;

				try {
					deleted = await this.livekitService.deleteRoom(roomId);
				} catch (error) {
					this.logger.error(`Error ending the meeting over its duration limit in '${roomId}':`, error);
				}

				if (deleted) {
					await this.lobbyService.endMeeting(roomId, MeetEventOrigin.SYSTEM);
				} else {
					await this.clearMeetingEndedReason(roomId, livekitRoom.sid);
				}

				return deleted;
			}
		);

		return ended ?? false;
	}

	/**
	 * Records that `meetingId` is being force-ended for exceeding its room's duration limit, so
	 * {@link getMeetingEndedReason} can attribute the resulting `room_finished`/`meetingEnded`
	 * webhook to the duration limit instead of a moderator's own end. Scoped to the meeting's
	 * LiveKit room sid, so a leaked flag is inert for the room's later meetings.
	 */
	protected async recordMeetingEndedReason(roomId: string, meetingId: string): Promise<void> {
		const key = this.getMeetingEndedReasonKey(roomId);
		await this.redisService.set(key, meetingId, ms(INTERNAL_CONFIG.MEETING_ENDED_REASON_TTL));
	}

	/**
	 * Withdraws a duration-limit attribution {@link endMeetingIfPastDurationLimit} speculatively
	 * wrote, once it turns out that attempt is not what actually ended the meeting (its own
	 * `deleteRoom` found the room already gone, or failed outright). Without this, the flag would
	 * sit for up to `MEETING_ENDED_REASON_TTL` and misattribute whatever later, unrelated event
	 * actually ends this same still-running meeting: its sid doesn't change just because this
	 * attempt didn't land. Only clears the flag if it still matches `meetingId`, the same guard
	 * {@link recordMeetingEndedReason}'s read side uses, so a legitimate flag from a different
	 * meeting already occupying the (room-scoped) key is never touched.
	 */
	protected async clearMeetingEndedReason(roomId: string, meetingId: string): Promise<void> {
		const key = this.getMeetingEndedReasonKey(roomId);
		const value = await this.redisService.get(key);

		if (value === meetingId) {
			await this.redisService.delete(key);
		}
	}

	/**
	 * Whether the meeting finishing in `roomId` was force-ended for reaching its duration limit
	 * rather than ending normally (a moderator's own end, or the room emptying out). Scoped to the
	 * meeting's sid when the caller knows it: like {@link RecordingAutoStartStateService#isDisabled},
	 * a flag left over from a different, earlier meeting in the same room never applies.
	 *
	 * The flag is consumed on the way out, so it attributes exactly one end. That is what lets a
	 * caller with no sid attribute at all: a flag still standing means no `room_finished` ever came
	 * for the meeting this service ended, which is the very case the room status sweep covers.
	 */
	async getMeetingEndedReason(roomId: string, meetingId?: string): Promise<MeetMeetingEndedReason | undefined> {
		const key = this.getMeetingEndedReasonKey(roomId);
		const value = await this.redisService.get(key);

		if (value === null || (meetingId !== undefined && value !== meetingId)) return undefined;

		try {
			await this.redisService.delete(key);
		} catch (error) {
			this.logger.warn(`Error consuming the meeting ended reason flag for room '${roomId}'`, error);
		}

		return MeetMeetingEndedReason.MAX_DURATION_REACHED;
	}

	private getMeetingEndedReasonKey(roomId: string): string {
		return `${RedisKeyName.MEETING_ENDED_REASON}${roomId}`;
	}
}
