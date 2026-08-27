import { inject, injectable } from 'inversify';
import type { Room } from 'livekit-server-sdk';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MeetRoomHelper } from '../helpers/room.helper.js';
import { RedisKeyName } from '../models/redis.model.js';
import type { IScheduledTask } from '../models/task-scheduler.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LivekitWebhookService } from './livekit-webhook.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { RedisService } from './redis.service.js';
import { RoomService } from './room.service.js';
import { TaskSchedulerService } from './task-scheduler.service.js';

/**
 * Service responsible for managing scheduled tasks related to rooms.
 *
 * This service handles periodic cleanup operations for rooms, such as:
 * - Deleting expired rooms based on their auto-deletion date
 */
@injectable()
export class RoomScheduledTasksService {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(RoomService) protected roomService: RoomService,
		@inject(TaskSchedulerService) protected taskSchedulerService: TaskSchedulerService,
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(LivekitWebhookService) protected livekitWebhookService: LivekitWebhookService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(RedisService) protected redisService: RedisService
	) {
		this.registerScheduledTasks();
	}

	/**
	 * Registers all scheduled tasks related to rooms.
	 */
	protected registerScheduledTasks(): void {
		const expiredRoomsGCTask: IScheduledTask = {
			name: 'expiredRoomsGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.ROOM_EXPIRED_GC_INTERVAL,
			callback: this.deleteExpiredRooms.bind(this)
		};
		this.taskSchedulerService.registerTask(expiredRoomsGCTask);

		const validateRoomsStatusGCTask: IScheduledTask = {
			name: 'validateRoomsStatusGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.ROOM_ACTIVE_VERIFICATION_GC_INTERVAL,
			callback: this.validateRoomsStatusGC.bind(this)
		};
		this.taskSchedulerService.registerTask(validateRoomsStatusGCTask);

		const meetingMaxDurationGCTask: IScheduledTask = {
			name: 'meetingMaxDurationGC',
			type: 'cron',
			scheduleOrDelay: INTERNAL_CONFIG.MEETING_MAX_DURATION_GC_INTERVAL,
			callback: this.enforceMeetingMaxDurationGC.bind(this)
		};
		this.taskSchedulerService.registerTask(meetingMaxDurationGCTask);
	}

	/**
	 * Performs garbage collection for expired rooms.
	 *
	 * This method checks for rooms that have an auto-deletion date in the past and
	 * tries to delete them based on their auto-deletion policy.
	 */
	protected async deleteExpiredRooms(): Promise<void> {
		this.logger.verbose(`Checking expired rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_ROOMS_EXPIRED_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let totalDeletedCandidates = 0;
			let hasAnyExpiredRoom = false;

			while (hasMore) {
				const expiredRoomsPage = await this.roomRepository.findExpiredRooms(BATCH_SIZE, nextPageToken);

				if (expiredRoomsPage.rooms.length === 0) {
					break;
				}

				hasAnyExpiredRoom = true;
				totalDeletedCandidates += expiredRoomsPage.rooms.length;
				this.logger.verbose(
					`Trying to delete batch of ${expiredRoomsPage.rooms.length} expired Meet rooms: ${expiredRoomsPage.rooms.map((room) => room.roomId).join(', ')}`
				);

				await this.roomService.bulkDeleteMeetRooms(expiredRoomsPage.rooms);

				hasMore = expiredRoomsPage.isTruncated;
				nextPageToken = expiredRoomsPage.nextPageToken;
			}

			if (!hasAnyExpiredRoom) {
				this.logger.verbose(`No expired rooms found.`);
				return;
			}

			this.logger.verbose(`Expired rooms cleanup finished. Total rooms processed: ${totalDeletedCandidates}`);
		} catch (error) {
			this.logger.error('Error deleting expired rooms:', error);
		}
	}

	/**
	 * Reconciles Mongo's room status against LiveKit's, in both directions: rooms marked active in
	 * the database that no longer exist in LiveKit, and rooms marked open that already have a live
	 * meeting there. Each direction is independent and self-contained, so one failing doesn't skip
	 * the other.
	 */
	protected async validateRoomsStatusGC(): Promise<void> {
		await this.reconcileActiveMeetingsGoneFromLiveKit();
		await this.reconcileOpenRoomsGC();
	}

	/**
	 * Checks for inconsistent rooms.
	 *
	 * This method checks for rooms that are marked as active in the database but do not exist in LiveKit.
	 * If such a room is found, it triggers the room finished logic to clean up the room.
	 */
	protected async reconcileActiveMeetingsGoneFromLiveKit(): Promise<void> {
		this.logger.verbose(`Checking inconsistent rooms at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_ROOMS_STATUS_VALIDATION_GC;
			let nextPageToken: string | undefined;
			let hasMore = true;
			let hasAnyActiveRoom = false;
			let totalInconsistentRooms = 0;

			while (hasMore) {
				const activeRoomsPage = await this.roomRepository.findActiveRooms(BATCH_SIZE, nextPageToken);

				if (activeRoomsPage.rooms.length === 0) {
					break;
				}

				hasAnyActiveRoom = true;

				const roomIds: string[] = activeRoomsPage.rooms.map((room) => room.roomId);
				const roomExistenceMap = await this.livekitService.roomsExist(roomIds);

				const roomsToCleanup = activeRoomsPage.rooms.filter((room) => {
					const exists = roomExistenceMap.get(room.roomId);
					return !exists;
				});

				totalInconsistentRooms += roomsToCleanup.length;

				if (roomsToCleanup.length > 0) {
					this.logger.warn(
						`Found ${roomsToCleanup.length} rooms active in DB but not in LiveKit in current batch. Cleaning up...`
					);

					await runConcurrently(
						roomsToCleanup,
						async (room) => {
							try {
								await this.livekitWebhookService.handleRoomFinished({
									name: room.roomId
								} as unknown as Room);
							} catch (error) {
								this.logger.error(`Error cleaning up room '${room.roomId}':`, error);
								// Continue with other rooms even if one fails
							}
						},
						{ concurrency: INTERNAL_CONFIG.CONCURRENCY_VALIDATE_ROOMS_STATUS, failFast: true }
					);
				}

				hasMore = activeRoomsPage.isTruncated;
				nextPageToken = activeRoomsPage.nextPageToken;
			}

			if (!hasAnyActiveRoom) {
				this.logger.verbose(`No active rooms found. Skipping room consistency check.`);
				return;
			}

			if (totalInconsistentRooms === 0) {
				this.logger.verbose(`All active rooms are consistent with LiveKit. No cleanup needed.`);
				return;
			}

			this.logger.warn(
				`Room consistency check finished. Total inconsistent rooms processed: ${totalInconsistentRooms}`
			);
		} catch (error) {
			this.logger.error('Error checking inconsistent rooms:', error);
		}
	}

	/**
	 * Checks for rooms that are marked as open in the database but already have a live meeting in LiveKit.
	 */
	protected async reconcileOpenRoomsGC(): Promise<void> {
		this.logger.verbose(`Checking open rooms with a live meeting at ${new Date(Date.now()).toISOString()}`);

		try {
			const liveRooms = await this.livekitService.listRooms();

			if (liveRooms.length === 0) {
				this.logger.verbose('No active LiveKit rooms found. Skipping open-room reconciliation.');
				return;
			}

			const liveRoomIds = liveRooms.map((room) => room.name);
			const roomIdsToReconcile = await this.roomRepository.findOpenRoomIds(liveRoomIds);

			if (roomIdsToReconcile.length === 0) {
				this.logger.verbose('All LiveKit-active rooms are already reflected as active in DB.');
				return;
			}

			this.logger.warn(
				`Found ${roomIdsToReconcile.length} rooms active in LiveKit but still 'open' in DB. Reconciling...`
			);

			await runConcurrently(
				roomIdsToReconcile,
				async (roomId) => {
					try {
						await this.livekitWebhookService.handleRoomStarted({ name: roomId } as unknown as Room);
					} catch (error) {
						this.logger.error(`Error reconciling room '${roomId}':`, error);
						// Continue with other rooms even if one fails
					}
				},
				{ concurrency: INTERNAL_CONFIG.CONCURRENCY_VALIDATE_ROOMS_STATUS, failFast: true }
			);

			this.logger.warn(`Open-room reconciliation finished. Total rooms reconciled: ${roomIdsToReconcile.length}`);
		} catch (error) {
			this.logger.error('Error reconciling open rooms with a live meeting:', error);
		}
	}

	/**
	 * Ends the meetings that have exceeded their room's `maxDurationMinutes`.
	 *
	 * LiveKit has no native duration limit, so this periodic sweep is the enforcement: it walks
	 * the active rooms that declare a limit, compares the LiveKit room's creation time against it,
	 * and ends the expired ones by deleting the LiveKit room — the exact flow a moderator's
	 * `meetingEnd` triggers, so participants leave with the `meeting_ended` reason and the
	 * `meetingEnded` webhook fires. A meeting can overrun its limit by up to the sweep interval.
	 *
	 * The same sweep also warns the meetings that are not over yet but are inside the
	 * `MEETING_DURATION_WARNING_REMAINING` window before their deadline — see
	 * {@link warnMeetingEndingSoon}.
	 */
	protected async enforceMeetingMaxDurationGC(): Promise<void> {
		this.logger.verbose(`Checking meetings over their duration limit at ${new Date(Date.now()).toISOString()}`);

		try {
			const BATCH_SIZE = INTERNAL_CONFIG.BATCH_SIZE_MEETING_MAX_DURATION_GC;
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
					async (room) => {
						const maxDurationMinutes = room.config.maxDurationMinutes;

						if (!maxDurationMinutes) {
							return false;
						}

						let livekitRoom;

						try {
							// The meeting start is the LiveKit room's creation time. A room that is
							// gone by now simply ended on its own; the status GC reconciles it.
							livekitRoom = await this.livekitService.getRoom(room.roomId);
							const creationTimeSeconds = Number(livekitRoom.creationTime);
							const remainingMs = MeetRoomHelper.meetingRemainingMs(
								creationTimeSeconds,
								maxDurationMinutes,
								Date.now()
							);

							if (remainingMs > 0) {
								if (remainingMs <= ms(INTERNAL_CONFIG.MEETING_DURATION_WARNING_REMAINING)) {
									await this.warnMeetingEndingSoon(room.roomId, livekitRoom.sid, remainingMs);
								}

								return false;
							}

							this.logger.info(
								`Meeting in room '${room.roomId}' exceeded its ${maxDurationMinutes}-minute limit. Ending it.`
							);
							// Written before deleteRoom, which is what triggers room_finished: the
							// flag must already be visible (on every replica) by the time that
							// webhook handler reads it.
							await this.markMeetingEndedByDurationLimit(room.roomId, livekitRoom.sid);
							const deleted = await this.livekitService.deleteRoom(room.roomId);

							if (!deleted) {
								// Something else — most likely a moderator's own endMeeting — already
								// deleted the room in the window between the write above and this
								// call: this GC attempt did not cause the room_finished that's about
								// to fire, so withdraw the attribution before anything reads it.
								await this.clearMeetingEndedCause(room.roomId, livekitRoom.sid);
							}

							return deleted;
						} catch (error) {
							this.logger.error(`Error enforcing the duration limit of room '${room.roomId}':`, error);

							if (livekitRoom) {
								await this.clearMeetingEndedCause(room.roomId, livekitRoom.sid);
							}

							// Continue with other rooms even if one fails
							return false;
						}
					},
					{ concurrency: INTERNAL_CONFIG.CONCURRENCY_MEETING_MAX_DURATION_GC, failFast: true }
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
	 * Warns every participant, once per meeting, that the meeting is inside the warning window
	 * before its duration limit. The once-only guard is a Redis flag scoped to the meeting
	 * (`meetingId` is the LiveKit room sid), so a leaked flag is inert for the room's later
	 * meetings. The flag is only set after the signal is actually sent: a failed send stays
	 * unmarked and is retried on the next sweep, while a failed mark can at worst repeat the
	 * warning once per sweep interval.
	 */
	protected async warnMeetingEndingSoon(roomId: string, meetingId: string, remainingMs: number): Promise<void> {
		const warningKey = `${RedisKeyName.MEETING_DURATION_WARNING_SENT}${roomId}`;
		const alreadyWarned = (await this.redisService.get(warningKey)) === meetingId;

		if (alreadyWarned) {
			return;
		}

		const remainingMinutes = Math.ceil(remainingMs / 60_000);
		this.logger.info(
			`Meeting in room '${roomId}' reaches its duration limit in ~${remainingMinutes} min. Warning its participants.`
		);
		await this.frontendEventService.sendMeetingEndingSoonSignal(roomId, remainingMinutes);
		await this.redisService.set(warningKey, meetingId, ms(INTERNAL_CONFIG.MEETING_DURATION_WARNING_SENT_TTL));
	}

	/**
	 * Records that `meetingId` is being force-ended by this GC, so {@link LivekitWebhookService}
	 * can attribute the resulting `room_finished`/`meetingEnded` webhook to the duration limit
	 * instead of a moderator's own end. Scoped to the meeting's LiveKit room sid, so a leaked flag
	 * is inert for the room's later meetings.
	 */
	protected async markMeetingEndedByDurationLimit(roomId: string, meetingId: string): Promise<void> {
		const key = `${RedisKeyName.MEETING_ENDED_CAUSE}${roomId}`;
		await this.redisService.set(key, meetingId, ms(INTERNAL_CONFIG.MEETING_ENDED_CAUSE_TTL));
	}

	/**
	 * Withdraws a duration-cause attribution this GC speculatively wrote, once it turns out this
	 * attempt is not what actually ended the meeting (its own `deleteRoom` found the room already
	 * gone, or failed outright). Without this, the flag would sit for up to
	 * `MEETING_ENDED_CAUSE_TTL` and misattribute whatever later, unrelated event actually ends this
	 * same still-running meeting — its sid doesn't change just because this attempt didn't land.
	 * Only clears the flag if it still matches `meetingId`, the same guard {@link
	 * markMeetingEndedByDurationLimit}'s read side uses, so a legitimate flag from a different
	 * meeting already occupying the (room-scoped) key is never touched.
	 */
	protected async clearMeetingEndedCause(roomId: string, meetingId: string): Promise<void> {
		const key = `${RedisKeyName.MEETING_ENDED_CAUSE}${roomId}`;
		const value = await this.redisService.get(key);

		if (value === meetingId) {
			await this.redisService.delete(key);
		}
	}
}
