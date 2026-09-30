import type { StreamInfo } from '@livekit/protocol';
import { StreamInfo_Status } from '@livekit/protocol';
import type {
	MeetBroadcastDestination,
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastInfo,
	MeetBroadcastStartDestination,
	MeetRecordingLayout,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import {
	MEET_BROADCAST_MAX_DESTINATIONS,
	MEET_BROADCAST_REDACTED_STREAM_KEY,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStatus
} from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { uid } from 'uid';
import type { BroadcastDestinationUrls, BroadcastRecord, DestinationState } from '../models/broadcast.model.js';
import {
	errorBroadcastDestinationLimit,
	errorBroadcastDuplicateDestination,
	errorBroadcastNoDestinations,
	errorBroadcastRedactedDestinationUrl,
	errorBroadcastUnknownDestination
} from '../models/error.model.js';
import { EgressHelper } from './egress.helper.js';

const DESTINATION_ID_LENGTH = 10;
const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const RUNNING_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE];
const STREAMING_STATUSES = [MeetBroadcastDestinationStatus.CONNECTING, MeetBroadcastDestinationStatus.ACTIVE];

export class BroadcastHelper {
	private constructor() {
		// Prevent instantiation of this utility class
	}

	/**
	 * The URL as the API serves it: its stream key (the last non-empty path segment, a trailing
	 * slash notwithstanding) replaced by {@link MEET_BROADCAST_REDACTED_STREAM_KEY}, and its query
	 * string dropped.
	 */
	static redactStreamUrl(url: string): string {
		const { protocol, host, pathname } = new URL(url);
		const segments = (pathname || '/').split('/');
		segments[BroadcastHelper.streamKeyIndex(segments)] = MEET_BROADCAST_REDACTED_STREAM_KEY;
		return `${protocol}//${host}${segments.join('/')}`;
	}

	/** Room options fit for a log line: the broadcast destinations with their stream keys redacted. */
	static redactRoomOptions(options: MeetRoomOptions): MeetRoomOptions {
		const broadcast = options.config?.broadcast;

		if (!broadcast) return options;

		const destinations = broadcast.destinations.map((destination) => ({
			...destination,
			url: BroadcastHelper.redactStreamUrl(destination.url)
		}));
		return { ...options, config: { ...options.config, broadcast: { ...broadcast, destinations } } };
	}

	static isRedactedStreamUrl(url: string): boolean {
		const segments = url.split(/[?#]/)[0].split('/');
		return segments[BroadcastHelper.streamKeyIndex(segments)] === MEET_BROADCAST_REDACTED_STREAM_KEY;
	}

	private static streamKeyIndex(segments: string[]): number {
		const index = segments.findLastIndex((segment) => segment !== '');
		return index > 0 ? index : segments.length - 1;
	}

	/**
	 * Whether the URL LiveKit reports for a stream is `realUrl`. Egress never echoes a URL as given:
	 * everything after the last `/` (stream key and query string) comes back as
	 * `{first three...last three}`, or `{...}` for a short key.
	 */
	static matchesReportedStreamUrl(realUrl: string, reportedUrl: string): boolean {
		if (reportedUrl === realUrl) return true;

		const keyStart = realUrl.lastIndexOf('/') + 1;

		if (!reportedUrl.startsWith(realUrl.slice(0, keyStart))) return false;

		const key = realUrl.slice(keyStart);
		const reportedKey = reportedUrl.slice(keyStart);
		return reportedKey === '{...}' || reportedKey === `{${key.slice(0, 3)}...${key.slice(-3)}}`;
	}

	/** Whether the broadcast is still the room's current one: not over yet, if only just ending. */
	static isInProgress(status: MeetBroadcastStatus): boolean {
		return IN_PROGRESS_STATUSES.includes(status);
	}

	/** Whether the broadcast can still be stopped or have its destinations changed. */
	static isRunning(status: MeetBroadcastStatus): boolean {
		return RUNNING_STATUSES.includes(status);
	}

	static isStreaming(destination: MeetBroadcastDestinationInfo): boolean {
		return STREAMING_STATUSES.includes(destination.status);
	}

	/**
	 * The destinations a broadcast starts with: every room destination, streaming to the ones the
	 * request names (to all of them when it names none) and holding the rest as `stopped`, plus the
	 * destinations the request adds for this meeting. Naming a room destination with a different
	 * URL or name changes it for this meeting only, which marks it `edited`.
	 */
	static resolveStartDestinations(
		roomDestinations: MeetBroadcastDestination[],
		roomDestinationUrls: BroadcastDestinationUrls,
		requested: MeetBroadcastStartDestination[] | undefined
	): MeetBroadcastDestinationInfo[] {
		const destinations: MeetBroadcastDestinationInfo[] = roomDestinations.map((destination) => ({
			id: destination.id!,
			name: destination.name,
			url: roomDestinationUrls[destination.id!],
			source: MeetBroadcastDestinationSource.ROOM,
			status: requested ? MeetBroadcastDestinationStatus.STOPPED : MeetBroadcastDestinationStatus.CONNECTING
		}));

		for (const request of requested ?? []) {
			if (request.id) {
				BroadcastHelper.startRoomDestination(destinations, request);
			} else {
				destinations.push(BroadcastHelper.toMeetingDestination({ name: request.name!, url: request.url! }));
			}
		}

		BroadcastHelper.validateDestinationSet(destinations.map(({ url }) => url));

		if (!destinations.some((destination) => BroadcastHelper.isStreaming(destination))) {
			throw errorBroadcastNoDestinations();
		}

		return destinations;
	}

	/**
	 * The destinations of a running broadcast after adding one for this meeting.
	 */
	static addDestination(
		destinations: MeetBroadcastDestinationInfo[],
		options: MeetBroadcastDestinationOptions
	): MeetBroadcastDestinationInfo[] {
		const added = [...destinations, BroadcastHelper.toMeetingDestination(options)];
		BroadcastHelper.validateDestinationSet(added.map(({ url }) => url));
		return added;
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
			const destinationId = id ?? uid(DESTINATION_ID_LENGTH);

			if (urls[destinationId]) throw errorBroadcastDuplicateDestination(BroadcastHelper.redactStreamUrl(realUrl));

			urls[destinationId] = realUrl;
			return { id: destinationId, name, url: BroadcastHelper.redactStreamUrl(realUrl) };
		});

		BroadcastHelper.validateDestinationSet(Object.values(urls));
		return { destinations, urls };
	}

	static createRecord(
		egress: EgressInfo,
		room: { roomId: string; roomName: string },
		layout: MeetRecordingLayout,
		destinations: MeetBroadcastDestinationInfo[]
	): BroadcastRecord {
		return BroadcastHelper.withEgressInfo(
			{
				broadcastId: egress.egressId,
				roomId: room.roomId,
				roomName: room.roomName,
				status: MeetBroadcastStatus.STARTING,
				layout,
				destinations
			},
			egress
		);
	}

	/**
	 * The record updated with what LiveKit reports. A destination without a matching stream keeps
	 * the status the server gave it (`stopped` when it was not chosen, `connecting` right after being
	 * added); one with a stream takes the stream's state, unless the destination already ended and
	 * the stream is that same attempt: egress webhooks can carry a snapshot older than the response
	 * that ended it, and must not revive it.
	 */
	static withEgressInfo(record: BroadcastRecord, egress: EgressInfo): BroadcastRecord {
		const destinations = record.destinations.map((destination) => {
			const stream = BroadcastHelper.findCurrentStream(egress.streamResults, destination.url);

			if (!stream || BroadcastHelper.isEndedAttempt(destination, stream)) return destination;

			return { ...destination, ...BroadcastHelper.toDestinationState(stream) };
		});
		const startDate = BroadcastHelper.extractStartDate(egress) ?? record.startDate;
		const endDate = EgressHelper.nsToMs(egress.endedAt);

		return {
			...record,
			destinations,
			status: EgressHelper.toStatus(egress.status, MeetBroadcastStatus),
			startDate,
			endDate,
			duration: startDate && endDate ? (endDate - startDate) / 1000 : undefined,
			...EgressHelper.extractError(egress)
		};
	}

	/**
	 * The record of a broadcast LiveKit will say nothing more about, because its meeting finished or
	 * its egress died: it is over, and so is every stream it still had open. It keeps an ending it
	 * already has, and one that never streamed anything carries no dates and, without an ending of
	 * its own, was aborted.
	 */
	static withEnded(record: BroadcastRecord, endDate = Date.now()): BroadcastRecord {
		const destinations = record.destinations.map((destination) =>
			BroadcastHelper.isStreaming(destination)
				? { ...destination, status: MeetBroadcastDestinationStatus.STOPPED, endDate }
				: destination
		);
		const status = BroadcastHelper.isInProgress(record.status) ? undefined : record.status;

		if (!record.startDate || status === MeetBroadcastStatus.ABORTED) {
			return {
				...record,
				destinations,
				status: status ?? MeetBroadcastStatus.ABORTED,
				startDate: undefined,
				endDate: undefined,
				duration: undefined
			};
		}

		const ended = record.endDate ?? endDate;
		return {
			...record,
			destinations,
			status: status ?? MeetBroadcastStatus.COMPLETE,
			endDate: ended,
			duration: (ended - record.startDate) / 1000
		};
	}

	static toBroadcastInfo(record: BroadcastRecord): MeetBroadcastInfo {
		return {
			...record,
			destinations: record.destinations.map((destination) => ({
				...destination,
				url: BroadcastHelper.redactStreamUrl(destination.url)
			}))
		};
	}

	/**
	 * The real URL a destination URL stands for. A redacted URL keeps the saved one, but only as it
	 * was served: with any other change there is no stream key to go with it.
	 */
	private static resolveUrl(url: string, savedUrl: string | undefined): string {
		if (!BroadcastHelper.isRedactedStreamUrl(url)) return url;

		if (!savedUrl || BroadcastHelper.redactStreamUrl(url) !== BroadcastHelper.redactStreamUrl(savedUrl)) {
			throw errorBroadcastRedactedDestinationUrl();
		}

		return savedUrl;
	}

	private static toMeetingDestination(options: MeetBroadcastDestinationOptions): MeetBroadcastDestinationInfo {
		if (BroadcastHelper.isRedactedStreamUrl(options.url)) throw errorBroadcastRedactedDestinationUrl();

		return {
			id: uid(DESTINATION_ID_LENGTH),
			name: options.name,
			url: options.url,
			source: MeetBroadcastDestinationSource.MEETING,
			status: MeetBroadcastDestinationStatus.CONNECTING
		};
	}

	/**
	 * Streams to the room destination the request names, under the name and URL the request gives
	 * it for this meeting.
	 */
	private static startRoomDestination(
		destinations: MeetBroadcastDestinationInfo[],
		request: MeetBroadcastStartDestination
	): void {
		const destination = destinations.find(({ id }) => id === request.id);

		if (!destination) throw errorBroadcastUnknownDestination(request.id!);

		const url = request.url ? BroadcastHelper.resolveUrl(request.url, destination.url) : destination.url;
		const name = request.name ?? destination.name;
		destination.status = MeetBroadcastDestinationStatus.CONNECTING;

		if (url !== destination.url || name !== destination.name) {
			Object.assign(destination, { url, name, edited: true });
		}
	}

	/**
	 * Two destinations with the same URL would be two streams to one ingest, which the platform
	 * closes, so a URL may appear once.
	 */
	private static validateDestinationSet(urls: string[]): void {
		if (urls.length > MEET_BROADCAST_MAX_DESTINATIONS) throw errorBroadcastDestinationLimit();

		const duplicate = urls.find((url, index) => urls.indexOf(url) !== index);

		if (duplicate) throw errorBroadcastDuplicateDestination(BroadcastHelper.redactStreamUrl(duplicate));
	}

	/**
	 * Egress appends a new stream entry each time a URL is added and keeps the finished ones, so
	 * the last match is the attempt that is current.
	 */
	private static findCurrentStream(streams: StreamInfo[], url: string): StreamInfo | undefined {
		return streams.filter((stream) => BroadcastHelper.matchesReportedStreamUrl(url, stream.url)).at(-1);
	}

	private static isEndedAttempt(destination: MeetBroadcastDestinationInfo, stream: StreamInfo): boolean {
		return (
			!BroadcastHelper.isStreaming(destination) &&
			(EgressHelper.nsToMs(stream.startedAt) ?? 0) <= (destination.endDate ?? 0)
		);
	}

	private static toDestinationState(stream: StreamInfo): DestinationState {
		const startDate = EgressHelper.nsToMs(stream.startedAt);

		return {
			status: BroadcastHelper.toDestinationStatus(stream, startDate),
			error: stream.error || undefined,
			startDate,
			endDate: EgressHelper.nsToMs(stream.endedAt),
			duration: EgressHelper.nsToSeconds(stream.duration)
		};
	}

	private static toDestinationStatus(stream: StreamInfo, startDate?: number): MeetBroadcastDestinationStatus {
		switch (stream.status) {
			case StreamInfo_Status.FAILED:
				return MeetBroadcastDestinationStatus.FAILED;
			case StreamInfo_Status.FINISHED:
				return MeetBroadcastDestinationStatus.STOPPED;
			default:
				return startDate ? MeetBroadcastDestinationStatus.ACTIVE : MeetBroadcastDestinationStatus.CONNECTING;
		}
	}

	/**
	 * When media first reached a destination. The egress's own `startedAt` is stamped when LiveKit
	 * accepts the request, before anything is streamed.
	 */
	private static extractStartDate(egress: EgressInfo): number | undefined {
		const starts = egress.streamResults.map(({ startedAt }) => startedAt).filter((startedAt) => startedAt > 0n);

		if (starts.length === 0) return undefined;

		return EgressHelper.nsToMs(
			starts.reduce((earliest, startedAt) => (startedAt < earliest ? startedAt : earliest))
		);
	}
}
