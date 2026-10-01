import type { StreamInfo } from '@livekit/protocol';
import { StreamInfo_Status } from '@livekit/protocol';
import type {
	MeetBroadcastDestination,
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastInfo,
	MeetBroadcastStartDestination,
	MeetRoomOptions
} from '@openvidu-meet/typings';
import {
	isRedactedStreamUrl,
	MEET_BROADCAST_MAX_DESTINATIONS,
	MeetBroadcastDestinationSource,
	MeetBroadcastDestinationStatus,
	MeetBroadcastStatus,
	redactStreamUrl
} from '@openvidu-meet/typings';
import type { EgressInfo } from 'livekit-server-sdk';
import { uid } from 'uid';
import { isDeepStrictEqual } from 'util';
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

	/**
	 * Whether the URL LiveKit reports for a stream is `realUrl`. Egress never echoes a URL as given:
	 * everything after the last `/` (stream key and query string) comes back with only a third of
	 * it at each end, three characters at most, as `{abc...xyz}`, `{ab...yz}`, `{a...z}`, or `{...}`
	 * for a key shorter than three.
	 */
	static matchesReportedStreamUrl(realUrl: string, reportedUrl: string): boolean {
		if (reportedUrl === realUrl) return true;

		const keyStart = realUrl.lastIndexOf('/') + 1;
		const key = realUrl.slice(keyStart);
		const shown = Math.min(3, Math.floor(key.length / 3));
		const reportedKey = shown === 0 ? '{...}' : `{${key.slice(0, shown)}...${key.slice(-shown)}}`;
		return reportedUrl === realUrl.slice(0, keyStart) + reportedKey;
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
	 * destinations the request adds for this meeting.
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
				BroadcastHelper.startRoomDestination(destinations, request.id);
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

			if (urls[destinationId]) throw errorBroadcastDuplicateDestination(redactStreamUrl(realUrl));

			urls[destinationId] = realUrl;
			return { id: destinationId, name, url: redactStreamUrl(realUrl) };
		});

		BroadcastHelper.validateDestinationSet(Object.values(urls));
		return { destinations, urls };
	}

	static createRecord(
		egress: EgressInfo,
		room: { roomId: string; roomName: string },
		{ layout, encoding }: Pick<BroadcastRecord, 'layout' | 'encoding'>,
		destinations: MeetBroadcastDestinationInfo[]
	): BroadcastRecord {
		return BroadcastHelper.withEgressInfo(
			{
				broadcastId: egress.egressId,
				roomId: room.roomId,
				roomName: room.roomName,
				status: MeetBroadcastStatus.STARTING,
				layout,
				encoding,
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
	 * that ended it, and must not revive it. An egress that ended streams nowhere, so a destination
	 * still connecting or streaming in its last snapshot is stopped when the egress ended.
	 */
	static withEgressInfo(record: BroadcastRecord, egress: EgressInfo): BroadcastRecord {
		const destinations = record.destinations.map((destination) => {
			const stream = BroadcastHelper.findCurrentStream(egress.streamResults, destination.url);

			if (!stream || BroadcastHelper.isEndedAttempt(destination, stream)) return destination;

			return { ...destination, ...BroadcastHelper.toDestinationState(stream) };
		});
		const startDate = BroadcastHelper.extractStartDate(egress) ?? record.startDate;
		const status = BroadcastHelper.toStatus(egress, startDate);
		const endDate = EgressHelper.nsToMs(egress.endedAt);

		return {
			...record,
			destinations: BroadcastHelper.isInProgress(status)
				? destinations
				: BroadcastHelper.stopStreaming(destinations, endDate),
			status,
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
		const destinations = BroadcastHelper.stopStreaming(record.destinations, endDate);
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

	/**
	 * Whether two records of a broadcast say the same as the server keeps them, where a field
	 * without a value is a field the record does not have.
	 */
	static isSameRecord(a: BroadcastRecord, b: BroadcastRecord): boolean {
		return isDeepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
	}

	static toBroadcastInfo(record: BroadcastRecord): MeetBroadcastInfo {
		return {
			...record,
			destinations: record.destinations.map((destination) => ({
				...destination,
				url: redactStreamUrl(destination.url)
			}))
		};
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

	private static toMeetingDestination(options: MeetBroadcastDestinationOptions): MeetBroadcastDestinationInfo {
		if (isRedactedStreamUrl(options.url)) throw errorBroadcastRedactedDestinationUrl();

		return {
			id: uid(DESTINATION_ID_LENGTH),
			name: options.name,
			url: options.url,
			source: MeetBroadcastDestinationSource.MEETING,
			status: MeetBroadcastDestinationStatus.CONNECTING
		};
	}

	private static startRoomDestination(destinations: MeetBroadcastDestinationInfo[], destinationId: string): void {
		const destination = destinations.find(({ id }) => id === destinationId);

		if (!destination) throw errorBroadcastUnknownDestination(destinationId);

		destination.status = MeetBroadcastDestinationStatus.CONNECTING;
	}

	/**
	 * Two destinations with the same URL would be two streams to one ingest, which the platform
	 * closes, so a URL may appear once.
	 */
	private static validateDestinationSet(urls: string[]): void {
		if (urls.length > MEET_BROADCAST_MAX_DESTINATIONS) throw errorBroadcastDestinationLimit();

		const duplicate = urls.find((url, index) => urls.indexOf(url) !== index);

		if (duplicate) throw errorBroadcastDuplicateDestination(redactStreamUrl(duplicate));
	}

	private static stopStreaming(
		destinations: MeetBroadcastDestinationInfo[],
		endDate: number | undefined
	): MeetBroadcastDestinationInfo[] {
		return destinations.map((destination) =>
			BroadcastHelper.isStreaming(destination)
				? { ...destination, status: MeetBroadcastDestinationStatus.STOPPED, endDate }
				: destination
		);
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
	 * LiveKit reports the egress active as soon as it composes the meeting, before any destination
	 * connects; the broadcast is starting until media first reaches one.
	 */
	private static toStatus(egress: EgressInfo, startDate: number | undefined): MeetBroadcastStatus {
		const status = EgressHelper.toStatus(egress.status, MeetBroadcastStatus);
		return status === MeetBroadcastStatus.ACTIVE && !startDate ? MeetBroadcastStatus.STARTING : status;
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
