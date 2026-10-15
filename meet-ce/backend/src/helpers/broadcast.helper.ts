import type { StreamInfo } from '@livekit/protocol';
import { StreamInfo_Status } from '@livekit/protocol';
import type {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetBroadcastStartDestination,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import {
	isRedactedStreamUrl,
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetBroadcastStatus,
	redactStreamUrl
} from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { uid } from 'uid';
import { isDeepStrictEqual } from 'util';
import type { BroadcastDestinationUrls, BroadcastRecord, BroadcastTarget } from '../models/broadcast.model.js';
import type { EgressError } from '../models/egress.model.js';
import {
	errorBroadcastDestinationInUse,
	errorBroadcastDestinationLimit,
	errorBroadcastDuplicateDestination,
	errorBroadcastRedactedDestinationUrl,
	errorBroadcastUnknownDestination
} from '../models/error.model.js';
import { EgressHelper } from './egress.helper.js';

const ID_LENGTH = 10;
const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const RUNNING_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE];

export class BroadcastHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/** Room options fit for a log line: the broadcast destinations with their stream keys redacted. */
	static redactRoomOptions(options: MeetRoomOptions): MeetRoomOptions {
		const broadcast = options.config?.broadcast;

		if (!broadcast?.destinations) return options;

		const destinations = broadcast.destinations.map((destination) => ({
			...destination,
			url: redactStreamUrl(destination.url)
		}));
		return { ...options, config: { ...options.config, broadcast: { ...broadcast, destinations } } };
	}

	/** Whether the broadcast is still one of the room's current ones: not over yet, if only just ending. */
	static isInProgress(status: MeetBroadcastStatus): boolean {
		return IN_PROGRESS_STATUSES.includes(status);
	}

	/** Whether the broadcast can still be stopped, and keeps the meeting's stream going. */
	static isRunning(status: MeetBroadcastStatus): boolean {
		return RUNNING_STATUSES.includes(status);
	}

	/** Whether LiveKit reports the egress starting or streaming, so it can still be stopped. */
	static isEgressRunning(egress: EgressInfo | undefined): boolean {
		return !!egress && BroadcastHelper.isRunning(EgressHelper.toStatus(egress.status, MeetBroadcastStatus));
	}

	/**
	 * The destinations a start request names, with their real URLs: the room's, streamed to as
	 * saved, and those given for this meeting with their full URL. A request that names none
	 * streams to every room destination the meeting is not streaming to yet.
	 */
	static resolveTargets(
		roomDestinations: MeetBroadcastDestination[],
		roomDestinationUrls: BroadcastDestinationUrls,
		inProgress: BroadcastRecord[],
		requested: MeetBroadcastStartDestination[] | undefined
	): BroadcastTarget[] {
		const streamed = new Set(inProgress.map(({ destinationId }) => destinationId));
		const destinations: MeetBroadcastStartDestination[] =
			requested ??
			roomDestinations.filter(({ id }) => !streamed.has(id)).map(({ id }) => ({ destinationId: id }));

		return destinations.map(({ destinationId, name, url }) => {
			if (destinationId) {
				const destination = roomDestinations.find(({ id }) => id === destinationId);

				if (!destination) throw errorBroadcastUnknownDestination(destinationId);

				return { destinationId, name: destination.name, url: roomDestinationUrls[destinationId] };
			}

			if (isRedactedStreamUrl(url!)) throw errorBroadcastRedactedDestinationUrl();

			return { name: name!, url: url! };
		});
	}

	/**
	 * Whether the meeting can take these broadcasts on top of the ones in progress: at most
	 * {@link MEET_BROADCAST_MAX_DESTINATIONS} run at once, and each stream key once, since the media
	 * server tells the streams of a meeting apart by their stream key alone when they connect.
	 */
	static validateNewBroadcasts(inProgress: BroadcastRecord[], targets: BroadcastTarget[]): void {
		if (inProgress.length + targets.length > MEET_BROADCAST_MAX_DESTINATIONS) {
			throw errorBroadcastDestinationLimit();
		}

		const urls = targets.map(({ url }) => url);
		const duplicate = BroadcastHelper.findRepeatedStreamKey(urls);

		if (duplicate) throw errorBroadcastDuplicateDestination(redactStreamUrl(duplicate));

		const streamedKeys = new Set(inProgress.map(({ url }) => BroadcastHelper.streamKeyOf(url)));
		const inUse = urls.find((url) => streamedKeys.has(BroadcastHelper.streamKeyOf(url)));

		if (inUse) throw errorBroadcastDestinationInUse(redactStreamUrl(inUse));
	}

	/**
	 * A room's destination list as sent on create or update, resolved against what the room has
	 * saved: a destination with a known `id` keeps its identity and, when its URL comes redacted
	 * (a response echoed back), its saved URL; one without `id` is new and needs its full URL.
	 * Returns the list to store, URLs redacted, plus the real URL of each destination.
	 */
	static reconcileRoomDestinations(
		savedUrls: BroadcastDestinationUrls,
		incoming: MeetBroadcastDestination[]
	): { destinations: MeetBroadcastDestination[]; urls: BroadcastDestinationUrls } {
		const urls: BroadcastDestinationUrls = {};

		const destinations = incoming.map(({ id, name, url }) => {
			if (id && !savedUrls[id]) throw errorBroadcastUnknownDestination(id);

			const realUrl = BroadcastHelper.resolveUrl(url, id && savedUrls[id]);
			const destinationId = id ?? uid(ID_LENGTH);

			if (urls[destinationId]) throw errorBroadcastDuplicateDestination(redactStreamUrl(realUrl));

			urls[destinationId] = realUrl;
			return { id: destinationId, name, url: redactStreamUrl(realUrl) };
		});

		if (destinations.length > MEET_BROADCAST_MAX_DESTINATIONS) throw errorBroadcastDestinationLimit();

		const duplicate = BroadcastHelper.findRepeatedStreamKey(Object.values(urls));

		if (duplicate) throw errorBroadcastDuplicateDestination(redactStreamUrl(duplicate));

		return { destinations, urls };
	}

	/**
	 * The record of a broadcast the egress just took: its stream is the last one the egress
	 * reports, since each URL is added to the egress on its own, in a call of its own.
	 */
	static createRecord(
		egress: EgressInfo,
		room: { roomId: string; roomName: string },
		target: BroadcastTarget,
		{ layout, encoding }: Pick<BroadcastRecord, 'layout' | 'encoding'>
	): BroadcastRecord {
		return BroadcastHelper.withEgressInfo(
			{
				broadcastId: `${room.roomId}--${uid(ID_LENGTH)}`,
				roomId: room.roomId,
				roomName: room.roomName,
				status: MeetBroadcastStatus.STARTING,
				name: target.name,
				url: target.url,
				destinationId: target.destinationId,
				layout,
				encoding,
				egressId: egress.egressId,
				streamIndex: Math.max(egress.streamResults.length - 1, 0)
			},
			egress
		);
	}

	/**
	 * The record updated with what LiveKit reports of its stream. A snapshot without the stream
	 * (egress webhooks can carry one older than the response that added it) leaves the record as
	 * it is. An egress that ended streams nowhere, so a broadcast still open in its last snapshot
	 * ends with it.
	 */
	static withEgressInfo(record: BroadcastRecord, egress: EgressInfo): BroadcastRecord {
		const stream = egress.streamResults[record.streamIndex];
		const updated = stream ? BroadcastHelper.withStream(record, stream, egress) : record;
		const egressStatus = EgressHelper.toStatus(egress.status, MeetBroadcastStatus);

		if (BroadcastHelper.isInProgress(egressStatus) || !BroadcastHelper.isInProgress(updated.status)) {
			return updated;
		}

		return BroadcastHelper.settle(
			updated,
			egressStatus,
			EgressHelper.nsToMs(egress.endedAt),
			EgressHelper.extractError(egress)
		);
	}

	/**
	 * The record of a broadcast LiveKit will say nothing more about, because its meeting finished
	 * or its egress died: it is over. It keeps an ending it already has, and one that never
	 * streamed anything carries no dates and, without an ending of its own, was aborted.
	 */
	static withEnded(record: BroadcastRecord, endDate = Date.now()): BroadcastRecord {
		const status = BroadcastHelper.isInProgress(record.status) ? MeetBroadcastStatus.COMPLETE : record.status;
		return BroadcastHelper.settle(record, status, endDate);
	}

	/**
	 * Whether two records of a broadcast say the same as the server keeps them, where a field
	 * without a value is a field the record does not have.
	 */
	static isSameRecord(a: BroadcastRecord, b: BroadcastRecord): boolean {
		return isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
	}

	/** The records with the given ones replacing their previous versions. */
	static replace(records: BroadcastRecord[], updated: BroadcastRecord[]): BroadcastRecord[] {
		return records.map((record) => updated.find(({ broadcastId }) => broadcastId === record.broadcastId) ?? record);
	}

	static toBroadcastInfo({ egressId, streamIndex, ...info }: BroadcastRecord): MeetBroadcastInfo {
		void egressId;
		void streamIndex;
		return { ...info, url: redactStreamUrl(info.url) };
	}

	/** The first URL whose stream key an earlier one already has. */
	private static findRepeatedStreamKey(urls: string[]): string | undefined {
		const keys = urls.map((url) => BroadcastHelper.streamKeyOf(url));
		return urls.find((_, index) => keys.indexOf(keys[index]) !== index);
	}

	/** The stream key of a destination URL as the media server reads it: what follows the last `/`. */
	private static streamKeyOf(url: string): string {
		return url.slice(url.lastIndexOf('/') + 1).replace(/ live=1$/, '');
	}

	/**
	 * The real URL a destination URL stands for. A redacted URL keeps the saved one, but only as it
	 * was served: with any other change there is no stream key to go with it.
	 */
	private static resolveUrl(url: string, savedUrl: string | undefined): string {
		if (!isRedactedStreamUrl(url)) return url;

		if (!savedUrl || redactStreamUrl(url) !== redactStreamUrl(savedUrl)) {
			throw errorBroadcastRedactedDestinationUrl();
		}

		return savedUrl;
	}

	/**
	 * The record as its stream reports it. Egress stamps `startedAt` when the stream connects, and
	 * a stream that ends without ever connecting gets its end time as `startedAt` too, so only a
	 * stream that started before it ended received media. A start the record already knows is kept
	 * when the snapshot carries none, which an older snapshot can.
	 */
	private static withStream(record: BroadcastRecord, stream: StreamInfo, egress: EgressInfo): BroadcastRecord {
		const received = stream.startedAt > 0n && stream.startedAt !== stream.endedAt;
		const startDate = received ? EgressHelper.nsToMs(stream.startedAt) : record.startDate;
		const endDate = startDate ? EgressHelper.nsToMs(stream.endedAt) : undefined;
		const dates = {
			startDate,
			endDate,
			duration: startDate && endDate ? (endDate - startDate) / 1000 : undefined
		};
		const error = stream.error || undefined;

		switch (stream.status) {
			case StreamInfo_Status.FAILED:
				return { ...record, ...dates, status: MeetBroadcastStatus.FAILED, error };
			case StreamInfo_Status.FINISHED:
				return {
					...record,
					...dates,
					status: startDate ? MeetBroadcastStatus.COMPLETE : MeetBroadcastStatus.ABORTED,
					error
				};
			default:
				return { ...record, ...dates, status: BroadcastHelper.toOpenStatus(egress, startDate), error };
		}
	}

	/**
	 * The status of a broadcast whose stream is open. LiveKit reports the egress active as soon as
	 * it composes the meeting, before the destination connects: the broadcast is starting until
	 * media first reaches it.
	 */
	private static toOpenStatus(egress: EgressInfo, startDate: number | undefined): MeetBroadcastStatus {
		const egressStatus = EgressHelper.toStatus(egress.status, MeetBroadcastStatus);

		if (egressStatus === MeetBroadcastStatus.ENDING) return MeetBroadcastStatus.ENDING;

		return startDate ? MeetBroadcastStatus.ACTIVE : MeetBroadcastStatus.STARTING;
	}

	/**
	 * The record ended with the given status at the given instant, unless it already has an end: a
	 * broadcast that never streamed anything carries no dates and, if it was to be complete, was
	 * aborted instead.
	 */
	private static settle(
		record: BroadcastRecord,
		status: MeetBroadcastStatus,
		endDate: number | undefined,
		error: EgressError = {}
	): BroadcastRecord {
		if (!record.startDate || status === MeetBroadcastStatus.ABORTED) {
			return {
				...record,
				...error,
				status: status === MeetBroadcastStatus.COMPLETE ? MeetBroadcastStatus.ABORTED : status,
				startDate: undefined,
				endDate: undefined,
				duration: undefined
			};
		}

		const ended = record.endDate ?? endDate ?? Date.now();
		return { ...record, ...error, status, endDate: ended, duration: (ended - record.startDate) / 1000 };
	}
}
