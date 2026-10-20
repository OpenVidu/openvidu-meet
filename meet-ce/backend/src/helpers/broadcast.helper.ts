import type { StreamInfo } from '@livekit/protocol';
import { StreamInfo_Status } from '@livekit/protocol';
import type {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetBroadcastStartOptions,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import {
	isRedactedStreamUrl,
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetBroadcastStatus,
	redactStreamUrl
} from '@openvidu-meet/typings';
import { lookup } from 'dns/promises';
import type { EgressInfo } from 'livekit-server-sdk';
import { BlockList, isIP } from 'net';
import { uid } from 'uid';
import { isDeepStrictEqual } from 'util';
import type { BroadcastDestinationUrls, BroadcastRecord } from '../models/broadcast.model.js';
import type { EgressError } from '../models/egress.model.js';
import {
	errorBroadcastDestinationInUse,
	errorBroadcastDestinationLimit,
	errorBroadcastDestinationNotAllowed,
	errorBroadcastDuplicateDestination,
	errorBroadcastRedactedDestinationUrl,
	errorBroadcastStartUnknownDestination,
	errorBroadcastUnknownDestination,
	errorEgressWithoutStreamTags
} from '../models/error.model.js';
import { EgressHelper } from './egress.helper.js';

const ID_LENGTH = 10;
const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const RUNNING_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE];
const STREAM_TAG = '#ov-stream-tag=';
const IPV4_MAPPED_PREFIX = '::ffff:';

// No RTMP server a meeting is streamed to can live here: the media server's own host (loopback),
// unspecified, link-local (where the cloud metadata endpoint lives), multicast and broadcast.
const FORBIDDEN_STREAM_ADDRESSES = new BlockList();
FORBIDDEN_STREAM_ADDRESSES.addSubnet('0.0.0.0', 8, 'ipv4');
FORBIDDEN_STREAM_ADDRESSES.addSubnet('127.0.0.0', 8, 'ipv4');
FORBIDDEN_STREAM_ADDRESSES.addSubnet('169.254.0.0', 16, 'ipv4');
FORBIDDEN_STREAM_ADDRESSES.addSubnet('224.0.0.0', 4, 'ipv4');
FORBIDDEN_STREAM_ADDRESSES.addAddress('255.255.255.255', 'ipv4');
FORBIDDEN_STREAM_ADDRESSES.addAddress('::', 'ipv6');
FORBIDDEN_STREAM_ADDRESSES.addAddress('::1', 'ipv6');
FORBIDDEN_STREAM_ADDRESSES.addSubnet('fe80::', 10, 'ipv6');
FORBIDDEN_STREAM_ADDRESSES.addSubnet('ff00::', 8, 'ipv6');

type AddressLookup = (host: string, options: { all: true }) => Promise<{ address: string }[]>;

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

	/** The room a broadcast belongs to: its id is `{roomId}--{id}`, as a recording's names its room. */
	static roomIdOf(broadcastId: string): string {
		return broadcastId.split('--')[0];
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

	/** Whether LiveKit reports the egress in progress, if only just ending. */
	static isEgressInProgress(egress: EgressInfo | undefined): egress is EgressInfo {
		return !!egress && BroadcastHelper.isInProgress(EgressHelper.toStatus(egress.status, MeetBroadcastStatus));
	}

	static newBroadcastId(roomId: string): string {
		return `${roomId}--${uid(ID_LENGTH)}`;
	}

	/**
	 * The URL the egress streams to for a broadcast: the destination's, tagged with the broadcast's
	 * id. The egress streams to the URL without the tag and reports the tag after the redacted URL,
	 * which is how a broadcast finds its stream in everything LiveKit reports of the egress.
	 */
	static taggedUrl({ broadcastId, destination }: Pick<BroadcastRecord, 'broadcastId' | 'destination'>): string {
		return `${destination.url}${STREAM_TAG}${broadcastId}`;
	}

	/**
	 * The destinations a start request names, with their real URLs: first the room's, streamed to
	 * as saved, and then those given for this meeting with their full URL. Without
	 * `destinationIds`, the room's are every one the meeting is not streaming to yet.
	 */
	static resolveTargets(
		roomDestinations: MeetBroadcastDestination[],
		roomDestinationUrls: BroadcastDestinationUrls,
		inProgress: BroadcastRecord[],
		{ destinationIds, destinations = [] }: MeetBroadcastStartOptions
	): MeetBroadcastDestination[] {
		const streamed = new Set(inProgress.map(({ destination }) => destination.id));
		const saved = destinationIds
			? destinationIds.map((destinationId) => {
					const destination = roomDestinations.find(({ id }) => id === destinationId);

					if (!destination) throw errorBroadcastStartUnknownDestination(destinationId);

					return destination;
				})
			: roomDestinations.filter(({ id }) => !streamed.has(id));
		const forMeeting = destinations.map(({ name, url }) => {
			if (isRedactedStreamUrl(url)) throw errorBroadcastRedactedDestinationUrl();

			return { name, url };
		});

		return [...saved.map(({ id, name }) => ({ id, name, url: roomDestinationUrls[id!] })), ...forMeeting];
	}

	/**
	 * Whether the meeting can take these broadcasts on top of the ones in progress: at most
	 * {@link MEET_BROADCAST_MAX_DESTINATIONS} run at once, and each stream key once, since the media
	 * server tells the streams of a meeting apart by their stream key alone when they connect.
	 */
	static validateNewBroadcasts(inProgress: BroadcastRecord[], targets: MeetBroadcastDestination[]): void {
		if (inProgress.length + targets.length > MEET_BROADCAST_MAX_DESTINATIONS) {
			throw errorBroadcastDestinationLimit();
		}

		const urls = targets.map(({ url }) => url);
		const duplicate = BroadcastHelper.findRepeatedStreamKey(urls);

		if (duplicate) throw errorBroadcastDuplicateDestination(redactStreamUrl(duplicate));

		const streamedKeys = new Set(inProgress.map(({ destination }) => BroadcastHelper.streamKeyOf(destination.url)));
		const inUse = urls.find((url) => streamedKeys.has(BroadcastHelper.streamKeyOf(url)));

		if (inUse) throw errorBroadcastDestinationInUse(redactStreamUrl(inUse));
	}

	/**
	 * Refuses a destination whose host resolves to an address where no RTMP server for the meeting
	 * can live, which the media server would only use to reach itself or the cloud metadata
	 * endpoint. A host that does not resolve is let through, for the media server to fail on it.
	 */
	static async assertDestinationsAllowed(urls: string[], resolve: AddressLookup = lookup): Promise<void> {
		for (const url of urls) {
			const addresses = await BroadcastHelper.addressesOf(url, resolve);

			if (addresses.some((address) => BroadcastHelper.isForbiddenStreamAddress(address))) {
				throw errorBroadcastDestinationNotAllowed(redactStreamUrl(url));
			}
		}
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
	 * The record of a broadcast whose tagged URL the egress just took. An egress that does not
	 * report the tag back could never tell the broadcast how its stream goes.
	 */
	static createRecord(
		broadcastId: string,
		egress: EgressInfo,
		room: { roomId: string; roomName: string },
		destination: MeetBroadcastDestination,
		{ layout, encoding }: Pick<BroadcastRecord, 'layout' | 'encoding'>
	): BroadcastRecord {
		if (!BroadcastHelper.findStream(egress, broadcastId)) throw errorEgressWithoutStreamTags();

		return BroadcastHelper.withEgressInfo(
			{
				broadcastId,
				roomId: room.roomId,
				roomName: room.roomName,
				status: MeetBroadcastStatus.STARTING,
				destination,
				layout,
				encoding,
				egressId: egress.egressId
			},
			egress
		);
	}

	/**
	 * The record updated with what LiveKit reports of its stream. A snapshot without the stream
	 * (egress webhooks can carry one older than the response that added it) leaves the record as
	 * it is, and so does one older than what the record already knows: a broadcast only moves
	 * forward. An egress that ended streams nowhere, so a broadcast still open in its last snapshot
	 * ends with it.
	 */
	static withEgressInfo(record: BroadcastRecord, egress: EgressInfo): BroadcastRecord {
		const stream = BroadcastHelper.findStream(egress, record.broadcastId);
		const reported = stream ? BroadcastHelper.withStream(record, stream, egress) : record;
		const updated = BroadcastHelper.progressOf(reported) < BroadcastHelper.progressOf(record) ? record : reported;
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

	static toBroadcastInfo({ egressId, ...info }: BroadcastRecord): MeetBroadcastInfo {
		void egressId;
		return { ...info, destination: { ...info.destination, url: redactStreamUrl(info.destination.url) } };
	}

	private static async addressesOf(url: string, resolve: AddressLookup): Promise<string[]> {
		let host: string;

		try {
			host = new URL(url).hostname;
		} catch {
			return [];
		}

		const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

		if (isIP(literal)) return [literal];

		try {
			return (await resolve(literal, { all: true })).map(({ address }) => address);
		} catch {
			return [];
		}
	}

	private static isForbiddenStreamAddress(address: string): boolean {
		const lower = address.toLowerCase();
		const mapped = lower.startsWith(IPV4_MAPPED_PREFIX) ? lower.slice(IPV4_MAPPED_PREFIX.length) : undefined;

		if (mapped && isIP(mapped) === 4) return FORBIDDEN_STREAM_ADDRESSES.check(mapped, 'ipv4');

		return FORBIDDEN_STREAM_ADDRESSES.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
	}

	/** The stream of the broadcast among those LiveKit reports of the egress, by its tag. */
	private static findStream(egress: EgressInfo, broadcastId: string): StreamInfo | undefined {
		return egress.streamResults.find(({ url }) => url.endsWith(`${STREAM_TAG}${broadcastId}`));
	}

	/** How far the broadcast went: starting, active, ending and over, in that order. */
	private static progressOf({ status }: BroadcastRecord): number {
		return BroadcastHelper.isInProgress(status)
			? IN_PROGRESS_STATUSES.indexOf(status)
			: IN_PROGRESS_STATUSES.length;
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
