import type {
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastDestinationUpdateOptions,
	MeetBroadcastInfo,
	MeetBroadcastStartOptions
} from '@openvidu-meet/typings';
import {
	MeetBroadcastDestinationStatus,
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
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
import type { BroadcastRecord } from '../models/broadcast.model.js';
import type { EgressWebhookAction } from '../models/egress.model.js';
import { EGRESS_LOST_ERROR } from '../models/egress.model.js';
import {
	errorBroadcastAlreadyStarted,
	errorBroadcastAlreadyStopped,
	errorBroadcastDestinationNotFound,
	errorBroadcastNotActive,
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
 * Live broadcasts of a meeting: the room-composite egress recording already runs, with RTMP
 * destinations instead of a file. Every change to a room's broadcast, from a request or from an
 * egress webhook, runs under the room's broadcast lock and goes through {@link BroadcastStateService},
 * so the replicas of a deployment see one broadcast per room.
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
	 * Starts streaming the meeting. The request completes as soon as LiveKit accepts the egress: the
	 * broadcast is `starting` until media reaches a destination, and each destination reports its
	 * own status from then on.
	 */
	async startBroadcast(roomId: string, options: MeetBroadcastStartOptions): Promise<MeetBroadcastInfo> {
		return this.withRequestLock(roomId, async () => {
			if (await this.findLiveRecord(roomId)) throw errorBroadcastAlreadyStarted(roomId);

			if (!(await this.livekitService.roomHasParticipants(roomId))) {
				throw errorBroadcastRoomHasNoParticipants(roomId);
			}

			const [{ roomName, config }, destinationUrls] = await Promise.all([
				this.roomService.getMeetRoom(roomId, ['roomName', 'config']),
				this.roomRepository.findBroadcastDestinationUrls(roomId)
			]);
			const destinations = BroadcastHelper.resolveStartDestinations(
				config.broadcast.destinations,
				destinationUrls,
				options.destinations
			);
			const layout = config.broadcast.layout ?? MeetRecordingLayout.GRID;
			const encoding = config.broadcast.encoding ?? MeetRecordingEncodingPreset.H264_720P_30;
			const egress = await this.livekitService.startRoomComposite(roomId, this.toStreamOutput(destinations), {
				layout,
				encodingOptions: EncodingConverter.toLivekit(encoding)
			});
			const record = BroadcastHelper.createRecord(
				egress,
				{ roomId, roomName },
				{ layout, encoding },
				destinations
			);
			await this.broadcastState.save(record);

			this.logger.info(`Broadcast '${record.broadcastId}' started for room '${roomId}'`);
			return BroadcastHelper.toBroadcastInfo(record);
		});
	}

	/**
	 * Stops the broadcast to every destination at once. LiveKit's `egress_ended` webhook then
	 * settles the final state and clears it.
	 */
	async stopBroadcast(roomId: string, broadcastId: string): Promise<MeetBroadcastInfo> {
		return this.withRequestLock(roomId, async () => {
			const record = await this.getRecord(roomId, broadcastId);

			if (!BroadcastHelper.isRunning(record.status)) throw errorBroadcastAlreadyStopped(broadcastId);

			const egress = await this.livekitService.stopEgressIfRunning(broadcastId);

			if (!egress) throw errorBroadcastAlreadyStopped(broadcastId);

			this.logger.info(`Broadcast '${broadcastId}' stopped for room '${roomId}'`);
			return this.persistAndNotify(BroadcastHelper.withEgressInfo(record, egress), 'updated');
		});
	}

	async getBroadcasts(roomId: string): Promise<MeetBroadcastInfo[]> {
		const record = await this.broadcastState.find(roomId);
		return record ? [BroadcastHelper.toBroadcastInfo(record)] : [];
	}

	async getBroadcast(roomId: string, broadcastId: string): Promise<MeetBroadcastInfo> {
		return BroadcastHelper.toBroadcastInfo(await this.getRecord(roomId, broadcastId));
	}

	/**
	 * The broadcast running in the room, if any: what a participant joining now has to be told
	 * about, and what makes the meeting's `broadcastActive`.
	 */
	async findActiveBroadcast(roomId: string): Promise<MeetBroadcastInfo | null> {
		const record = await this.broadcastState.find(roomId);
		return record && BroadcastHelper.isInProgress(record.status) ? BroadcastHelper.toBroadcastInfo(record) : null;
	}

	async isBroadcastActive(roomId: string): Promise<boolean> {
		return (await this.findActiveBroadcast(roomId)) !== null;
	}

	/**
	 * Adds a destination for this meeting to a running broadcast and starts streaming to it.
	 */
	async addDestination(
		roomId: string,
		broadcastId: string,
		options: MeetBroadcastDestinationOptions
	): Promise<MeetBroadcastInfo> {
		return this.withRequestLock(roomId, async () => {
			const record = await this.getRunningRecord(roomId, broadcastId);
			const destinations = BroadcastHelper.addDestination(record.destinations, options);
			const egress = await this.livekitService.updateStream(broadcastId, [options.url], []);

			this.logger.info(`Destination added to broadcast '${broadcastId}' of room '${roomId}'`);
			return this.persistAndNotify(
				BroadcastHelper.withEgressInfo({ ...record, destinations }, egress),
				'updated'
			);
		});
	}

	/**
	 * Starts or stops the stream to one destination of a running broadcast. Starting a `failed` or
	 * `stopped` destination is a new attempt against the same URL; stopping the last destination
	 * still streaming ends the whole broadcast, through LiveKit's own `egress_ended`.
	 */
	async updateDestination(
		roomId: string,
		broadcastId: string,
		destinationId: string,
		{ active }: MeetBroadcastDestinationUpdateOptions
	): Promise<MeetBroadcastInfo> {
		return this.withRequestLock(roomId, async () => {
			const record = await this.getRunningRecord(roomId, broadcastId);
			const destination = record.destinations.find(({ id }) => id === destinationId);

			if (!destination) throw errorBroadcastDestinationNotFound(destinationId);

			if (active === BroadcastHelper.isStreaming(destination)) return BroadcastHelper.toBroadcastInfo(record);

			const egress = active
				? await this.livekitService.updateStream(broadcastId, [destination.url], [])
				: await this.livekitService.updateStream(broadcastId, [], [destination.url]);
			const destinations = record.destinations.map((candidate) =>
				candidate.id === destinationId ? this.toRequestedState(candidate, active) : candidate
			);

			this.logger.info(
				`Destination '${destinationId}' ${active ? 'started' : 'stopped'} in broadcast '${broadcastId}' of room '${roomId}'`
			);
			return this.persistAndNotify(
				BroadcastHelper.withEgressInfo({ ...record, destinations }, egress),
				'updated'
			);
		});
	}

	/**
	 * Applies an `egress_started`, `egress_updated` or `egress_ended` webhook of a broadcast egress.
	 * An update that changes nothing is dropped: LiveKit reports every change a request makes
	 * again, after the request already saved and notified it.
	 */
	async handleEgressEvent(egress: EgressInfo, action: EgressWebhookAction): Promise<void> {
		await this.withWebhookLock(egress.roomName, `egress_${action} of egress '${egress.egressId}'`, async () => {
			const record = await this.broadcastState.find(egress.roomName);

			if (record?.broadcastId !== egress.egressId) {
				this.logger.debug(
					`Ignoring egress_${action} for egress '${egress.egressId}': it is not the broadcast of room '${egress.roomName}'`
				);
				return;
			}

			const updated = BroadcastHelper.withEgressInfo(record, egress);

			if (action === 'updated' && BroadcastHelper.isSameRecord(record, updated)) return;

			await this.persistAndNotify(updated, action);
		});
	}

	/**
	 * Settles the broadcast of a meeting that has finished. Normally the broadcast's own
	 * `egress_ended` already did; this covers a meeting that ended without it reaching the server,
	 * so the participants and the webhooks still learn that the broadcast is over. It stops the
	 * egress too: closing the room ends a broadcast that streams, not one still starting, which
	 * would join after the room is gone, create it again and wait minutes for media.
	 */
	async cleanupRoom(roomId: string): Promise<void> {
		await this.withWebhookLock(roomId, 'room_finished', async () => {
			const record = await this.broadcastState.find(roomId);

			if (!record) return;

			const egress = await this.endEgress(roomId, record.broadcastId);
			const latest = egress ? BroadcastHelper.withEgressInfo(record, egress) : record;
			await this.persistAndNotify(BroadcastHelper.withEnded(latest), 'ended');
		});
	}

	/**
	 * The egress of a broadcast leaves the room only after LiveKit reports it ended. One that leaves
	 * while the broadcast is still in progress and no longer answers died with its egress service,
	 * which LiveKit never reports: it keeps listing the egress as in progress forever. The broadcast
	 * is ended here instead, as failed, so the room can go live again.
	 */
	async handleEgressParticipantLeft(roomId: string, egressId: string): Promise<void> {
		await this.withWebhookLock(roomId, `participant_left of egress '${egressId}'`, async () => {
			const record = await this.broadcastState.find(roomId);

			if (record?.broadcastId !== egressId || !BroadcastHelper.isInProgress(record.status)) return;

			if (await this.livekitService.isEgressReachable(egressId)) return;

			this.logger.warn(`The egress of broadcast '${egressId}' in room '${roomId}' stopped responding`);
			await this.persistAndNotify(
				BroadcastHelper.withEnded({ ...record, status: MeetBroadcastStatus.FAILED, error: EGRESS_LOST_ERROR }),
				'ended'
			);
		});
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
	 * Runs a webhook's change to a room's broadcast once no other change holds the room's
	 * broadcast lock, waiting as long as one can hold it: the webhook carries LiveKit's latest
	 * state of the egress, which nothing else would apply if it were dropped.
	 */
	protected async withWebhookLock(roomId: string, webhook: string, task: () => Promise<void>): Promise<void> {
		const handled = await this.withBroadcastLock(roomId, INTERNAL_CONFIG.BROADCAST_LOCK_TTL, async () => {
			await task();
			return true;
		});

		if (handled === null) {
			this.logger.warn(`Could not process ${webhook} for the broadcast of room '${roomId}': it stayed locked`);
		}
	}

	/**
	 * Runs a request's change to a room's broadcast once no other change holds the room's
	 * broadcast lock, answering 409 only when one holds it for longer than a request waits.
	 */
	protected async withRequestLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
		const result = await this.withBroadcastLock(roomId, INTERNAL_CONFIG.BROADCAST_REQUEST_LOCK_WAIT, task);

		if (result === null) throw errorBroadcastUpdateInProgress(roomId);

		return result;
	}

	/**
	 * Runs a change to a room's broadcast once its broadcast lock is free, giving up as `null` when
	 * the lock stays taken for longer than `wait`.
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
	 * The saved broadcast of the room whose egress LiveKit still reports in progress. One LiveKit no
	 * longer does ended without its `egress_ended` reaching this server, and is forgotten here so it
	 * does not block the room until its TTL.
	 */
	protected async findLiveRecord(roomId: string): Promise<BroadcastRecord | undefined> {
		const record = await this.broadcastState.find(roomId);

		if (!record) return undefined;

		const [egress] = await this.livekitService.getEgress(roomId, record.broadcastId);

		if (egress && BroadcastHelper.isInProgress(EgressHelper.toStatus(egress.status, MeetBroadcastStatus))) {
			return record;
		}

		this.logger.warn(`Dropping the stale broadcast '${record.broadcastId}' of room '${roomId}'`);
		await this.broadcastState.delete(roomId);
		return undefined;
	}

	protected async getRecord(roomId: string, broadcastId: string): Promise<BroadcastRecord> {
		const record = await this.broadcastState.find(roomId);

		if (record?.broadcastId !== broadcastId) throw errorBroadcastNotFound(broadcastId);

		return record;
	}

	protected async getRunningRecord(roomId: string, broadcastId: string): Promise<BroadcastRecord> {
		const record = await this.getRecord(roomId, broadcastId);

		if (!BroadcastHelper.isRunning(record.status)) throw errorBroadcastNotActive(broadcastId);

		return record;
	}

	/**
	 * Saves the broadcast while it is in progress and forgets it once it is over, then tells the
	 * participants and the webhooks. Every change notifies, whether a request or LiveKit made it.
	 */
	protected async persistAndNotify(record: BroadcastRecord, action: EgressWebhookAction): Promise<MeetBroadcastInfo> {
		const inProgress = BroadcastHelper.isInProgress(record.status);

		if (inProgress) {
			await this.broadcastState.save(record);
		} else {
			await this.broadcastState.delete(record.roomId);
		}

		const info = BroadcastHelper.toBroadcastInfo(record);
		await this.frontendEventService.sendBroadcastUpdatedSignal(record.roomId, info);

		if (!inProgress) {
			this.webhookDispatcherService.sendBroadcastEndedWebhook(info);
		} else if (action === 'started') {
			this.webhookDispatcherService.sendBroadcastStartedWebhook(info);
		} else {
			this.webhookDispatcherService.sendBroadcastUpdatedWebhook(info);
		}

		return info;
	}

	protected toRequestedState(
		destination: MeetBroadcastDestinationInfo,
		active: boolean
	): MeetBroadcastDestinationInfo {
		return {
			...destination,
			status: active ? MeetBroadcastDestinationStatus.CONNECTING : MeetBroadcastDestinationStatus.STOPPED,
			error: undefined
		};
	}

	protected toStreamOutput(destinations: MeetBroadcastDestinationInfo[]): StreamOutput {
		return new StreamOutput({
			protocol: StreamProtocol.RTMP,
			urls: destinations.filter((destination) => BroadcastHelper.isStreaming(destination)).map(({ url }) => url)
		});
	}
}
