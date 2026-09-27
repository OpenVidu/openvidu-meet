import type { StreamInfo } from '@livekit/protocol';
import { EgressStatus, StreamInfo_Status } from '@livekit/protocol';
import type {
	MeetBroadcastDestination,
	MeetBroadcastDestinationInfo,
	MeetBroadcastDestinationOptions,
	MeetBroadcastInfo,
	MeetBroadcastStartDestination,
	MeetRecordingLayout,
	MeetRoomMemberPermissions
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
import type { BroadcastDestinationUrls, BroadcastRecord } from '../models/broadcast.model.js';
import {
	errorBroadcastDestinationLimit,
	errorBroadcastDuplicateDestination,
	errorBroadcastNoDestinations,
	errorBroadcastRedactedDestinationUrl,
	errorBroadcastUnknownDestination,
	errorInsufficientPermissions
} from '../models/error.model.js';

const DESTINATION_ID_LENGTH = 10;
const NS_PER_MS = 1_000_000n;
const NS_PER_SECOND = 1_000_000_000n;
const IN_PROGRESS_STATUSES = [MeetBroadcastStatus.STARTING, MeetBroadcastStatus.ACTIVE, MeetBroadcastStatus.ENDING];
const STREAMING_STATUSES = [MeetBroadcastDestinationStatus.CONNECTING, MeetBroadcastDestinationStatus.ACTIVE];

type DestinationState = Pick<MeetBroadcastDestinationInfo, 'status' | 'error' | 'startDate' | 'endDate' | 'duration'>;

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

	static isBroadcastEgress(egress: EgressInfo): boolean {
		const { streamResults = [], fileResults = [] } = egress;
		return streamResults.length > 0 && fileResults.length === 0;
	}

	static extractStatus(status: EgressStatus | undefined): MeetBroadcastStatus {
		switch (status) {
			case EgressStatus.EGRESS_STARTING:
				return MeetBroadcastStatus.STARTING;
			case EgressStatus.EGRESS_ACTIVE:
				return MeetBroadcastStatus.ACTIVE;
			case EgressStatus.EGRESS_ENDING:
				return MeetBroadcastStatus.ENDING;
			case EgressStatus.EGRESS_COMPLETE:
				return MeetBroadcastStatus.COMPLETE;
			case EgressStatus.EGRESS_ABORTED:
				return MeetBroadcastStatus.ABORTED;
			case EgressStatus.EGRESS_LIMIT_REACHED:
				return MeetBroadcastStatus.LIMIT_REACHED;
			default:
				return MeetBroadcastStatus.FAILED;
		}
	}

	static isInProgress(status: MeetBroadcastStatus): boolean {
		return IN_PROGRESS_STATUSES.includes(status);
	}

	static isStreaming(destination: MeetBroadcastDestinationInfo): boolean {
		return STREAMING_STATUSES.includes(destination.status);
	}

	/**
	 * The destinations a broadcast starts with: every room destination, streaming to the ones the
	 * request names (to all of them when it names none) and holding the rest as `stopped`, plus the
	 * destinations the request adds for this meeting. Naming a room destination with a different
	 * URL or name changes it for this meeting only. Both departures from the room's list need their
	 * own permission on top of `broadcastControl`.
	 */
	static resolveStartDestinations(
		roomDestinations: MeetBroadcastDestination[],
		roomDestinationUrls: BroadcastDestinationUrls,
		requested: MeetBroadcastStartDestination[] | undefined,
		permissions: MeetRoomMemberPermissions
	): MeetBroadcastDestinationInfo[] {
		const destinations: MeetBroadcastDestinationInfo[] = roomDestinations.map((destination) => ({
			id: destination.id!,
			name: destination.name,
			url: roomDestinationUrls[destination.id!],
			source: MeetBroadcastDestinationSource.ROOM,
			status: requested ? MeetBroadcastDestinationStatus.STOPPED : MeetBroadcastDestinationStatus.CONNECTING
		}));

		for (const request of requested ?? []) {
			if (!request.id) {
				if (!permissions.broadcastAddDestinations) throw errorInsufficientPermissions();

				destinations.push(BroadcastHelper.toMeetingDestination({ name: request.name!, url: request.url! }));
				continue;
			}

			const destination = destinations.find(({ id }) => id === request.id);

			if (!destination) throw errorBroadcastUnknownDestination(request.id);

			destination.status = MeetBroadcastDestinationStatus.CONNECTING;
			const url =
				request.url && !BroadcastHelper.isRedactedStreamUrl(request.url) ? request.url : destination.url;
			const name = request.name ?? destination.name;

			if (url !== destination.url || name !== destination.name) {
				if (!permissions.broadcastEditDestinations) throw errorInsufficientPermissions();

				Object.assign(destination, { url, name, edited: true });
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

			const realUrl = BroadcastHelper.isRedactedStreamUrl(url) ? id && savedUrls[id] : url;

			if (!realUrl) throw errorBroadcastRedactedDestinationUrl();

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
		const startDate = BroadcastHelper.extractStartDate(egress);
		const endDate = BroadcastHelper.nsToMs(egress.endedAt);

		return {
			...record,
			destinations,
			status: BroadcastHelper.extractStatus(egress.status),
			startDate,
			endDate,
			duration: startDate && endDate ? Math.round((endDate - startDate) / 1000) : undefined,
			errorCode: egress.errorCode || undefined,
			error: egress.error || undefined,
			details: egress.details || undefined
		};
	}

	/**
	 * The record of a broadcast whose meeting has finished without LiveKit's final word: it is over,
	 * and so is every stream it still had open.
	 */
	static withMeetingEnded(record: BroadcastRecord, endDate = Date.now()): BroadcastRecord {
		const destinations = record.destinations.map((destination) =>
			BroadcastHelper.isStreaming(destination)
				? { ...destination, status: MeetBroadcastDestinationStatus.STOPPED, endDate }
				: destination
		);

		return {
			...record,
			destinations,
			status: MeetBroadcastStatus.COMPLETE,
			endDate,
			duration: record.startDate ? Math.round((endDate - record.startDate) / 1000) : undefined
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
			(BroadcastHelper.nsToMs(stream.startedAt) ?? 0) <= (destination.endDate ?? 0)
		);
	}

	private static toDestinationState(stream: StreamInfo): DestinationState {
		const startDate = BroadcastHelper.nsToMs(stream.startedAt);

		return {
			status: BroadcastHelper.toDestinationStatus(stream, startDate),
			error: stream.error || undefined,
			startDate,
			endDate: BroadcastHelper.nsToMs(stream.endedAt),
			duration: stream.duration > 0n ? Number(stream.duration / NS_PER_SECOND) : undefined
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

		return BroadcastHelper.nsToMs(
			starts.reduce((earliest, startedAt) => (startedAt < earliest ? startedAt : earliest))
		);
	}

	private static nsToMs(value: bigint): number | undefined {
		return value > 0n ? Number(value / NS_PER_MS) : undefined;
	}
}
