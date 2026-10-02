import type { MeetBroadcastInfo, MeetBroadcastStartOptions, MeetBroadcastStopOptions } from '@openvidu-meet/typings';
import { MeetBroadcastStatus, MeetRecordingEncodingPreset, MeetRecordingLayout } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { EgressInfo } from 'livekit-server-sdk';
import { StreamOutput, StreamProtocol } from 'livekit-server-sdk';
import type { StringValue } from 'ms';
import ms from 'ms';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { BroadcastHelper } from '../helpers/broadcast.helper.js';
import { EgressHelper } from '../helpers/egress.helper.js';
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
	 * reaches its destination.
	 */
	async startBroadcasts(roomId: string, { destinations }: MeetBroadcastStartOptions): Promise<MeetBroadcastInfo[]> {
		return this.withRequestLock(roomId, async () => {
			const records = await this.findLiveRecords(roomId);

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
			const updated = this.withEgress([...records, ...started], egress);
			await this.saveAndNotify(roomId, records, updated);

			const startedIds = new Set(started.map(({ broadcastId }) => broadcastId));
			this.logger.info(`Broadcasts '${[...startedIds].join("', '")}' started for room '${roomId}'`);
			return updated
				.filter(({ broadcastId }) => startedIds.has(broadcastId))
				.map((record) => BroadcastHelper.toBroadcastInfo(record));
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
						(await this.livekitService.updateStream(target.egressId, [], [target.url])) ??
						(await this.livekitService.getEgress(roomId, target.egressId))[0];

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
		return (await this.broadcastState.find(roomId)).length > 0;
	}

	/**
	 * Applies an `egress_started`, `egress_updated` or `egress_ended` webhook of an egress that
	 * streams the room to its broadcasts. What changes nothing is dropped: LiveKit reports every
	 * change a request makes again, after the request already saved and notified it.
	 */
	async handleEgressEvent(egress: EgressInfo): Promise<void> {
		await this.withWebhookLock(egress.roomName, `an event of egress '${egress.egressId}'`, async () => {
			const records = await this.broadcastState.find(egress.roomName);

			if (!records.some((record) => record.egressId === egress.egressId)) {
				this.logger.debug(
					`Ignoring the event of egress '${egress.egressId}': it streams no broadcast of room '${egress.roomName}'`
				);
				return;
			}

			await this.saveAndNotify(egress.roomName, records, this.withEgress(records, egress));
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
	 * while its broadcasts are still in progress and no longer answers died with its egress service,
	 * which LiveKit never reports: it keeps listing the egress as in progress forever. The broadcasts
	 * are ended here instead, as failed, so the room can go live again.
	 */
	async handleEgressParticipantLeft(roomId: string, egressId: string): Promise<void> {
		await this.withWebhookLock(roomId, `participant_left of egress '${egressId}'`, async () => {
			const records = await this.broadcastState.find(roomId);

			if (!records.some((record) => record.egressId === egressId)) return;

			if (await this.livekitService.isEgressReachable(egressId)) return;

			this.logger.warn(`The egress '${egressId}' streaming room '${roomId}' stopped responding`);
			const lost = records.map((record) =>
				record.egressId === egressId
					? BroadcastHelper.withEnded({
							...record,
							status: MeetBroadcastStatus.FAILED,
							error: EGRESS_LOST_ERROR
						})
					: record
			);
			await this.saveAndNotify(roomId, records, lost);
		});
	}

	/**
	 * Adds each target to the egress already streaming the meeting, or starts the egress with the
	 * first one, one URL per call so each broadcast knows the position of its stream. A target that
	 * fails withdraws the streams added before it, so the request starts every broadcast or none.
	 */
	protected async addStreams(
		room: { roomId: string; roomName: string },
		host: BroadcastRecord | undefined,
		targets: BroadcastTarget[],
		roomSettings: Pick<BroadcastRecord, 'layout' | 'encoding'>
	): Promise<{ started: BroadcastRecord[]; egress: EgressInfo }> {
		const started: BroadcastRecord[] = [];
		let egress: EgressInfo | undefined;

		try {
			for (const target of targets) {
				const joined = host && (await this.livekitService.updateStream(host.egressId, [target.url], []));
				const settings = joined && host ? host : roomSettings;
				egress = joined ?? (await this.startEgress(room.roomId, target.url, settings));
				host = BroadcastHelper.createRecord(egress, room, target, settings);
				started.push(host);
			}
		} catch (error) {
			await this.withdraw(started);
			throw error;
		}

		return { started, egress: egress! };
	}

	/** Takes back the streams of broadcasts that will not be kept, without failing the caller. */
	protected async withdraw(records: BroadcastRecord[]): Promise<void> {
		for (const { broadcastId, egressId, url } of records) {
			try {
				await this.livekitService.updateStream(egressId, [], [url]);
			} catch (error) {
				this.logger.warn(`Could not withdraw the stream of broadcast '${broadcastId}'`, error);
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
	 * broadcast lock, waiting as long as one can hold it: the webhook carries LiveKit's latest
	 * state of the egress, which nothing else would apply if it were dropped.
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
	 * The saved broadcasts of the room whose egress LiveKit still reports in progress. Those of an
	 * egress LiveKit no longer does ended without their `egress_ended` reaching this server: they are
	 * settled here with what LiveKit last reported, so they do not block the room until their TTL.
	 */
	protected async findLiveRecords(roomId: string): Promise<BroadcastRecord[]> {
		const records = await this.broadcastState.find(roomId);
		let live = records;

		for (const egressId of new Set(records.map((record) => record.egressId))) {
			const [egress] = await this.livekitService.getEgress(roomId, egressId);

			if (egress && BroadcastHelper.isInProgress(EgressHelper.toStatus(egress.status, MeetBroadcastStatus))) {
				continue;
			}

			this.logger.warn(`Settling the stale broadcasts of egress '${egressId}' in room '${roomId}'`);
			live = live.map((record) =>
				record.egressId === egressId
					? BroadcastHelper.withEnded(egress ? BroadcastHelper.withEgressInfo(record, egress) : record)
					: record
			);
		}

		if (live !== records) await this.saveAndNotify(roomId, records, live);

		return live.filter(({ status }) => BroadcastHelper.isInProgress(status));
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
	 * as ended when it is over. Every change notifies, whether a request or LiveKit made it.
	 */
	protected async saveAndNotify(roomId: string, before: BroadcastRecord[], after: BroadcastRecord[]): Promise<void> {
		await this.broadcastState.save(
			roomId,
			after.filter(({ status }) => BroadcastHelper.isInProgress(status))
		);

		for (const record of after) {
			const previous = before.find(({ broadcastId }) => broadcastId === record.broadcastId);

			if (previous && BroadcastHelper.isSameRecord(previous, record)) continue;

			const info = BroadcastHelper.toBroadcastInfo(record);
			await this.frontendEventService.sendBroadcastUpdatedSignal(roomId, info);

			if (!BroadcastHelper.isInProgress(record.status)) {
				this.webhookDispatcherService.sendBroadcastEndedWebhook(info);
			} else if (!previous) {
				this.webhookDispatcherService.sendBroadcastStartedWebhook(info);
			} else {
				this.webhookDispatcherService.sendBroadcastUpdatedWebhook(info);
			}
		}
	}
}
