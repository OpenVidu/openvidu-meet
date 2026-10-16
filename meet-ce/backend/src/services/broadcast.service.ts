import type { MeetBroadcastInfo, MeetBroadcastStartOptions, MeetBroadcastStopOptions } from '@openvidu-meet/typings';
import {
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout,
	redactStreamUrl
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { EgressInfo } from 'livekit-server-sdk';
import { StreamOutput, StreamProtocol } from 'livekit-server-sdk';
import type { StringValue } from 'ms';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { BroadcastHelper } from '../helpers/broadcast.helper.js';
import { EncodingConverter } from '../helpers/encoding-converter.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import type { BroadcastRecord, BroadcastTarget } from '../models/broadcast.model.js';
import { EGRESS_LOST_ERROR } from '../models/egress.model.js';
import {
	errorBroadcastAlreadyStarted,
	errorBroadcastAlreadyStopped,
	errorBroadcastNotFound,
	errorBroadcastRoomHasNoParticipants,
	errorBroadcastUpdateInProgress
} from '../models/error.model.js';
import { RoomRepository } from '../repositories/room.repository.js';
import { BroadcastStateService } from './broadcast-state.service.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { RoomService } from './room.service.js';
import { WebhookDispatcherService } from './webhook-dispatcher.service.js';

const LOCK_RETRY_DELAY_MS = 250;

/** The stream of a broadcast on the egress it was added to. */
type StreamPlacement = Pick<BroadcastRecord, 'broadcastId' | 'egressId' | 'url'>;

/**
 * Live broadcasts of a meeting, one per destination. They run on the room-composite egress the
 * recording already uses, with RTMP destinations instead of a file: the first broadcast of a
 * meeting starts the egress and the next ones join it, so the meeting is composed once and
 * delivered to every destination. Every change to a room's broadcasts, from a request or from an
 * egress webhook, runs under the room's broadcast lock and goes through {@link BroadcastStateService},
 * so the replicas of a deployment see the same broadcasts.
 */
@injectable()
export class BroadcastService {
	constructor(
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(BroadcastStateService) protected broadcastState: BroadcastStateService,
		@inject(RoomService) protected roomService: RoomService,
		@inject(RoomRepository) protected roomRepository: RoomRepository,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(WebhookDispatcherService) protected webhookDispatcherService: WebhookDispatcherService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * Starts streaming the meeting to each destination asked for, one broadcast each, or to every
	 * room destination not streamed to yet. Either every broadcast starts or none does. The request
	 * completes as soon as LiveKit accepts the streams: each broadcast is `starting` until media
	 * reaches its destination, and is told as started before anything LiveKit reported of it while
	 * the request went on, such as a destination that refused the stream at once.
	 */
	async startBroadcasts(roomId: string, { destinations }: MeetBroadcastStartOptions): Promise<MeetBroadcastInfo[]> {
		return this.withRequestLock(roomId, async () => {
			const records = await this.reconcile(roomId, await this.broadcastState.find(roomId));

			if (!(await this.livekitService.roomHasParticipants(roomId))) {
				throw errorBroadcastRoomHasNoParticipants(roomId);
			}

			const [{ roomName, config }, destinationUrls] = await Promise.all([
				this.roomService.getMeetRoom(roomId, ['roomName', 'config']),
				this.roomRepository.findBroadcastDestinationUrls(roomId)
			]);
			const targets = BroadcastHelper.resolveTargets(
				config.broadcast.destinations,
				destinationUrls,
				records,
				destinations
			);

			if (targets.length === 0) throw errorBroadcastAlreadyStarted(roomId);

			BroadcastHelper.validateNewBroadcasts(records, targets);

			const { started, egress } = await this.addStreams(
				{ roomId, roomName },
				records.find(({ status }) => BroadcastHelper.isRunning(status)),
				targets,
				{
					layout: config.broadcast.layout ?? MeetRecordingLayout.GRID,
					encoding: config.broadcast.encoding ?? MeetRecordingEncodingPreset.H264_720P_30
				}
			);
			const withStarted = [...records, ...started];
			await this.saveAndNotify(roomId, records, withStarted);
			await this.saveAndNotify(roomId, withStarted, this.withEgress(withStarted, egress));

			this.logger.info(
				`Broadcasts '${started.map(({ broadcastId }) => broadcastId).join("', '")}' started for room '${roomId}'`
			);
			return started.map((record) => BroadcastHelper.toBroadcastInfo(record));
		});
	}

	/**
	 * Stops the given broadcasts, or every running one: the stream to each destination ends at
	 * once, and the egress ends by itself with its last stream. LiveKit's answers settle the final
	 * states. The broadcasts stopped before a failure are saved as stopped all the same.
	 */
	async stopBroadcasts(roomId: string, { broadcastIds }: MeetBroadcastStopOptions): Promise<MeetBroadcastInfo[]> {
		return this.withRequestLock(roomId, async () => {
			const records = await this.broadcastState.find(roomId);
			const targets = broadcastIds
				? [...new Set(broadcastIds)].map((broadcastId) => this.findRunningRecord(records, broadcastId))
				: records.filter(({ status }) => BroadcastHelper.isRunning(status));
			let updated = records;

			try {
				for (const target of targets) {
					const egress =
						(await this.livekitService.updateStream(
							target.egressId,
							[],
							[BroadcastHelper.taggedUrl(target)]
						)) ?? (await this.livekitService.getEgress(roomId, target.egressId))[0];

					if (egress) updated = this.withEgress(updated, egress);

					const latest = updated.find(({ broadcastId }) => broadcastId === target.broadcastId)!;
					updated = BroadcastHelper.replace(updated, [BroadcastHelper.withEnded(latest)]);
				}
			} finally {
				await this.saveAndNotify(roomId, records, updated);
			}

			const stoppedIds = new Set(targets.map(({ broadcastId }) => broadcastId));
			this.logger.info(`Broadcasts '${[...stoppedIds].join("', '")}' stopped for room '${roomId}'`);
			return updated
				.filter(({ broadcastId }) => stoppedIds.has(broadcastId))
				.map((record) => BroadcastHelper.toBroadcastInfo(record));
		});
	}

	/**
	 * The broadcasts in progress in the room: what a participant joining now has to be told about,
	 * and what makes the meeting's `broadcastActive`.
	 */
	async getBroadcasts(roomId: string): Promise<MeetBroadcastInfo[]> {
		return (await this.broadcastState.find(roomId)).map((record) => BroadcastHelper.toBroadcastInfo(record));
	}

	async getBroadcast(roomId: string, broadcastId: string): Promise<MeetBroadcastInfo> {
		const record = (await this.broadcastState.find(roomId)).find(
			(candidate) => candidate.broadcastId === broadcastId
		);

		if (!record) throw errorBroadcastNotFound(broadcastId);

		return BroadcastHelper.toBroadcastInfo(record);
	}

	async isBroadcastActive(roomId: string): Promise<boolean> {
		return this.broadcastState.hasBroadcasts(roomId);
	}

	/**
	 * Applies an `egress_started`, `egress_updated` or `egress_ended` webhook of an egress that
	 * streams the room to its broadcasts. What changes nothing is dropped: LiveKit reports every
	 * change a request makes again, after the request already saved and notified it. An egress that
	 * streams no broadcast and LiveKit still runs is one a request lost track of, because LiveKit
	 * started it after the request gave up or the replica stopped before saving it: it is stopped,
	 * so nothing streams the meeting without a broadcast that reports it. LiveKit is asked first
	 * because events of an egress whose broadcasts already ended keep arriving late.
	 */
	async handleEgressEvent(egress: EgressInfo): Promise<void> {
		await this.withWebhookLock(egress.roomName, `an event of egress '${egress.egressId}'`, async () => {
			const records = await this.broadcastState.find(egress.roomName);

			if (records.some((record) => record.egressId === egress.egressId)) {
				await this.saveAndNotify(egress.roomName, records, this.withEgress(records, egress));
				return;
			}

			if (!BroadcastHelper.isEgressRunning(egress)) return;

			const [latest] = await this.livekitService.getEgress(egress.roomName, egress.egressId);

			if (!BroadcastHelper.isEgressRunning(latest)) return;

			this.logger.warn(
				`Stopping egress '${egress.egressId}': it streams no broadcast of room '${egress.roomName}'`
			);
			await this.endEgress(egress.roomName, egress.egressId);
		});
	}

	/**
	 * Settles the broadcasts of a meeting that has finished. Normally their egress's own
	 * `egress_ended` already did; this covers a meeting that ended without it reaching the server,
	 * so the participants and the webhooks still learn that the broadcasts are over. It stops the
	 * egress too: closing the room ends an egress that streams, not one still starting, which
	 * would join after the room is gone, create it again and wait minutes for media.
	 */
	async cleanupRoom(roomId: string): Promise<void> {
		await this.withWebhookLock(roomId, 'room_finished', async () => {
			const records = await this.broadcastState.find(roomId);

			if (records.length === 0) return;

			let latest = records;

			for (const egressId of new Set(records.map((record) => record.egressId))) {
				const egress = await this.endEgress(roomId, egressId);

				if (egress) latest = this.withEgress(latest, egress);
			}

			await this.saveAndNotify(
				roomId,
				records,
				latest.map((record) => BroadcastHelper.withEnded(record))
			);
		});
	}

	/**
	 * The egress of a broadcast leaves the room only after LiveKit reports it ended. One that leaves
	 * while its broadcasts are still in progress may have died with its egress service, which
	 * LiveKit never reports, so its broadcasts are reconciled with LiveKit at once.
	 */
	async handleEgressParticipantLeft(roomId: string, egressId: string): Promise<void> {
		await this.withWebhookLock(roomId, `participant_left of egress '${egressId}'`, async () => {
			const records = await this.broadcastState.find(roomId);

			if (records.some((record) => record.egressId === egressId)) await this.reconcile(roomId, records);
		});
	}

	/**
	 * Reconciles every room with broadcasts in progress, for what LiveKit's webhooks never told
	 * this server: a meeting that is over, and an egress that ended or died. Without this, a lost
	 * webhook would leave broadcasts in Redis, which keeps them without expiry, reporting a meeting
	 * live that no longer is.
	 */
	async reconcileAllRooms(): Promise<void> {
		for (const roomId of await this.broadcastState.findRoomIds()) {
			try {
				if (await this.livekitService.roomExists(roomId)) {
					await this.withWebhookLock(roomId, 'the broadcasts reconciliation', async () => {
						await this.reconcile(roomId, await this.broadcastState.find(roomId));
					});
				} else {
					await this.cleanupRoom(roomId);
				}
			} catch (error) {
				this.logger.error(`Could not reconcile the broadcasts of room '${roomId}'`, error);
			}
		}
	}

	/**
	 * Adds each target to the egress already streaming the meeting, or starts the egress with the
	 * first one, each URL tagged with the id of its broadcast. A target that fails withdraws the
	 * streams added before it, and its own in case the egress took it before the call failed, so
	 * the request starts every broadcast or none.
	 */
	protected async addStreams(
		room: { roomId: string; roomName: string },
		host: BroadcastRecord | undefined,
		targets: BroadcastTarget[],
		roomSettings: Pick<BroadcastRecord, 'layout' | 'encoding'>
	): Promise<{ started: BroadcastRecord[]; egress: EgressInfo }> {
		const started: BroadcastRecord[] = [];
		let egress: EgressInfo | undefined;
		let adding: StreamPlacement | undefined;

		try {
			for (const target of targets) {
				const stream = { broadcastId: BroadcastHelper.newBroadcastId(room.roomId), url: target.url };
				const url = BroadcastHelper.taggedUrl(stream);
				adding = host && { ...stream, egressId: host.egressId };
				const joined = host && (await this.livekitService.updateStream(host.egressId, [url], []));
				const settings = joined && host ? host : roomSettings;
				egress = joined ?? (await this.startEgress(room.roomId, url, settings));
				adding = { ...stream, egressId: egress.egressId };
				host = BroadcastHelper.createRecord(stream.broadcastId, egress, room, target, settings);
				started.push(host);
			}
		} catch (error) {
			await this.withdraw(adding ? [...started, adding] : started);
			throw error;
		}

		return { started, egress: egress! };
	}

	/** Takes back streams that no broadcast will keep, without failing the caller. */
	protected async withdraw(streams: StreamPlacement[]): Promise<void> {
		for (const stream of streams) {
			try {
				await this.livekitService.updateStream(stream.egressId, [], [BroadcastHelper.taggedUrl(stream)]);
			} catch (error) {
				this.logger.warn(
					`Could not withdraw the stream to '${redactStreamUrl(stream.url)}' from egress '${stream.egressId}'`,
					error
				);
			}
		}
	}

	protected findRunningRecord(records: BroadcastRecord[], broadcastId: string): BroadcastRecord {
		const record = records.find((candidate) => candidate.broadcastId === broadcastId);

		if (!record) throw errorBroadcastNotFound(broadcastId);

		if (!BroadcastHelper.isRunning(record.status)) throw errorBroadcastAlreadyStopped(broadcastId);

		return record;
	}

	protected startEgress(
		roomId: string,
		url: string,
		{ layout, encoding }: Pick<BroadcastRecord, 'layout' | 'encoding'>
	): Promise<EgressInfo> {
		return this.livekitService.startRoomComposite(
			roomId,
			new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [url] }),
			{ layout, encodingOptions: EncodingConverter.toLivekit(encoding) }
		);
	}

	/**
	 * Ends the egress unless LiveKit already did, without failing the caller if it cannot. Returns
	 * the latest egress LiveKit reported, if it reported any.
	 */
	protected async endEgress(roomId: string, egressId: string): Promise<EgressInfo | undefined> {
		try {
			const stopped = await this.livekitService.stopEgressIfRunning(egressId);
			return stopped ?? (await this.livekitService.getEgress(roomId, egressId))[0];
		} catch (error) {
			this.logger.warn(`Could not end the egress '${egressId}' of room '${roomId}'`, error);
			return undefined;
		}
	}

	/**
	 * Runs a webhook's change to a room's broadcasts once no other change holds the room's
	 * broadcast lock, waiting longer than a request does: the webhook carries LiveKit's latest state
	 * of the egress, which only the next reconciliation sweep would apply if it were dropped.
	 */
	protected async withWebhookLock(roomId: string, webhook: string, task: () => Promise<void>): Promise<void> {
		const handled = await this.withBroadcastLock(roomId, INTERNAL_CONFIG.BROADCAST_LOCK_TTL, async () => {
			await task();
			return true;
		});

		if (handled === null) {
			this.logger.warn(`Could not process ${webhook} for the broadcasts of room '${roomId}': they stayed locked`);
		}
	}

	/**
	 * Runs a request's change to a room's broadcasts once no other change holds the room's
	 * broadcast lock, answering 409 only when one holds it for longer than a request waits.
	 */
	protected async withRequestLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
		const result = await this.withBroadcastLock(roomId, INTERNAL_CONFIG.BROADCAST_REQUEST_LOCK_WAIT, task);

		if (result === null) throw errorBroadcastUpdateInProgress(roomId);

		return result;
	}

	/**
	 * Runs a change to a room's broadcasts once its broadcast lock is free, giving up as `null`
	 * when the lock stays taken for longer than `wait`.
	 */
	protected withBroadcastLock<T>(roomId: string, wait: StringValue, task: () => Promise<T>): Promise<T | null> {
		return this.mutexService.withRetryLock(
			MeetLock.getBroadcastLock(roomId),
			ms(INTERNAL_CONFIG.BROADCAST_LOCK_TTL),
			task,
			Math.ceil(ms(wait) / LOCK_RETRY_DELAY_MS),
			LOCK_RETRY_DELAY_MS
		);
	}

	/**
	 * Brings the room's broadcasts up to date with what LiveKit knows of their egress, for what its
	 * webhooks never told this server: the latest snapshot of an egress in progress, the end of one
	 * that ended, and the loss of one whose egress service died, which LiveKit never reports and
	 * keeps listing in progress. Saves and notifies what changed, and returns the broadcasts still
	 * in progress.
	 */
	protected async reconcile(roomId: string, records: BroadcastRecord[]): Promise<BroadcastRecord[]> {
		let latest = records;

		for (const egressId of new Set(records.map((record) => record.egressId))) {
			const [egress] = await this.livekitService.getEgress(roomId, egressId);

			if (!BroadcastHelper.isEgressInProgress(egress)) {
				this.logger.warn(`Settling the broadcasts of egress '${egressId}' in room '${roomId}': it ended`);
				latest = this.endBroadcastsOf(latest, egressId, (record) =>
					egress ? BroadcastHelper.withEgressInfo(record, egress) : record
				);
			} else if (await this.isEgressLost(roomId, egressId)) {
				this.logger.warn(`The egress '${egressId}' streaming room '${roomId}' stopped responding`);
				latest = this.endBroadcastsOf(latest, egressId, (record) => ({
					...record,
					status: MeetBroadcastStatus.FAILED,
					error: EGRESS_LOST_ERROR
				}));
			} else {
				latest = this.withEgress(latest, egress);
			}
		}

		await this.saveAndNotify(roomId, records, latest);
		return latest.filter(({ status }) => BroadcastHelper.isInProgress(status));
	}

	/**
	 * Whether the egress died with its egress service, which LiveKit never reports: its participant
	 * left the room and no egress service answers for it.
	 */
	protected async isEgressLost(roomId: string, egressId: string): Promise<boolean> {
		return (
			!(await this.livekitService.participantExists(roomId, egressId)) &&
			!(await this.livekitService.isEgressReachable(egressId))
		);
	}

	/** The records with those of the egress ended as `end` leaves them. */
	protected endBroadcastsOf(
		records: BroadcastRecord[],
		egressId: string,
		end: (record: BroadcastRecord) => BroadcastRecord
	): BroadcastRecord[] {
		return records.map((record) =>
			record.egressId === egressId ? BroadcastHelper.withEnded(end(record)) : record
		);
	}

	/** The records with those of the egress updated with what LiveKit reports of it. */
	protected withEgress(records: BroadcastRecord[], egress: EgressInfo): BroadcastRecord[] {
		return records.map((record) =>
			record.egressId === egress.egressId ? BroadcastHelper.withEgressInfo(record, egress) : record
		);
	}

	/**
	 * Saves the broadcasts still in progress, forgetting the ones that are over, then tells the
	 * participants and the webhooks about each broadcast that changed: as started when it is new,
	 * as ended when it is over. Every change notifies once, whether a request or LiveKit made it,
	 * and nothing is written when nothing changed.
	 */
	protected async saveAndNotify(roomId: string, before: BroadcastRecord[], after: BroadcastRecord[]): Promise<void> {
		const changed = after.filter((record) => {
			const previous = before.find(({ broadcastId }) => broadcastId === record.broadcastId);
			return !previous || !BroadcastHelper.isSameRecord(previous, record);
		});

		if (changed.length === 0) return;

		await this.broadcastState.save(
			roomId,
			after.filter(({ status }) => BroadcastHelper.isInProgress(status))
		);

		for (const record of changed) {
			const isNew = !before.some(({ broadcastId }) => broadcastId === record.broadcastId);
			const info = BroadcastHelper.toBroadcastInfo(record);
			await this.frontendEventService.sendBroadcastUpdatedSignal(roomId, info);

			if (!BroadcastHelper.isInProgress(record.status)) {
				this.webhookDispatcherService.sendBroadcastEndedWebhook(info);
			} else if (isNew) {
				this.webhookDispatcherService.sendBroadcastStartedWebhook(info);
			} else {
				this.webhookDispatcherService.sendBroadcastUpdatedWebhook(info);
			}
		}
	}
}
