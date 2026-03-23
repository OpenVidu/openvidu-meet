import type { MeetRoom, MeetRoomField, ProjectedMeetRoom } from '@openvidu-meet/typings';
import { MeetRoomStatus, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { QueryFilter } from 'mongoose';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type { MeetRoomDocument, MeetRoomDocumentOnlyField } from '../models/mongoose-schemas/room.schema.js';
import { MEET_ROOM_DOCUMENT_ONLY_FIELDS, MeetRoomModel } from '../models/mongoose-schemas/room.schema.js';
import { LoggerService } from '../services/logger.service.js';
import type {
	MeetRoomPage,
	RoomQuery,
	RoomQueryWithFields,
	RoomQueryWithProjection
} from '../types/room-projection.types.js';
import { getBasePath } from '../utils/html-dynamic-base-path.utils.js';
import { getBaseUrl } from '../utils/url.utils.js';
import { BaseRepository } from './base.repository.js';
import { RoomMemberRepository } from './room-member.repository.js';

/**
 * Repository for managing MeetRoom entities in MongoDB.
 * Provides CRUD operations and specialized queries for room data.
 */
@injectable()
export class RoomRepository extends BaseRepository<MeetRoom, MeetRoomDocument> {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(RoomMemberRepository) protected roomMemberRepository: RoomMemberRepository
	) {
		super(logger, MeetRoomModel);
	}

	/**
	 * Transforms a persisted MeetRoom document into a domain MeetRoom object.
	 * Enriches access URLs with the base URL.
	 *
	 * @param dbObject - The MongoDB document representing a room
	 * @returns Room with complete URLs
	 */
	protected toDomain(dbObject: MeetRoomDocument): MeetRoom {
		const { schemaVersion, ...room } = dbObject;
		void schemaVersion;
		return this.enrichRoomWithBaseUrls(room as MeetRoom);
	}

	protected override getDocumentOnlyFields(): readonly MeetRoomDocumentOnlyField[] {
		return MEET_ROOM_DOCUMENT_ONLY_FIELDS;
	}

	protected override getAtomicUpdatePaths(): readonly string[] {
		// Recording encoding must be treated as an atomic update path because
		// it can be either a string or an object, and we want to ensure it is fully replaced rather than partially updated.
		return ['config.recording.encoding'];
	}

	/**
	 * Creates a new room.
	 * URLs are stored in the database without the base URL.
	 *
	 * @param room - The room data to create
	 * @returns The created room with enriched URLs
	 */
	create(room: MeetRoom): Promise<MeetRoom> {
		const normalizedRoom = this.normalizeRoomForStorage(room) as MeetRoom;
		const document: MeetRoomDocument = {
			...normalizedRoom,
			schemaVersion: INTERNAL_CONFIG.ROOM_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Updates specific fields of a room without replacing the entire document.
	 *
	 * @param roomId - The unique room identifier
	 * @param fieldsToUpdate - Partial room data with fields to update
	 * @returns The updated room with enriched URLs
	 * @throws Error if room not found
	 */
	updatePartial(roomId: string, fieldsToUpdate: Partial<MeetRoom>): Promise<MeetRoom> {
		const normalizedFieldsToUpdate = this.normalizeRoomForStorage(fieldsToUpdate);
		return this.updatePartialOne({ roomId }, normalizedFieldsToUpdate);
	}

	/**
	 * Replaces an existing room with new data.
	 * URLs are stored in the database without the base URL.
	 *
	 * @param room - The complete updated room data
	 * @returns The updated room with enriched URLs
	 * @throws Error if room not found
	 */
	replace(room: MeetRoom): Promise<MeetRoom> {
		const normalizedRoom = this.normalizeRoomForStorage(room) as MeetRoom;
		return this.replaceOne({ roomId: room.roomId }, normalizedRoom);
	}

	/**
	 * Finds a room by its roomId.
	 * Returns the room with enriched URLs (including base URL).
	 *
	 * @param roomId - The unique room identifier
	 * @param fields - Array of field names to include in the result
	 * @returns The room or null if not found
	 */
	findByRoomId(roomId: string): Promise<MeetRoom | null>;

	findByRoomId<const TFields extends readonly MeetRoomField[]>(
		roomId: string,
		fields: TFields
	): Promise<ProjectedMeetRoom<TFields> | null>;

	findByRoomId(roomId: string, fields?: readonly MeetRoomField[]): Promise<MeetRoom | Partial<MeetRoom> | null>;

	findByRoomId(roomId: string, fields?: readonly MeetRoomField[]): Promise<MeetRoom | Partial<MeetRoom> | null> {
		return this.findOne({ roomId }, fields as string[]) as Promise<MeetRoom | Partial<MeetRoom> | null>;
	}

	/**
	 * Finds rooms owned by a specific user.
	 * Returns rooms with enriched URLs (including base URL).
	 *
	 * @param owner - The userId of the room owner
	 * @param fields - Array of field names to include in the result
	 * @returns Array of rooms owned by the user
	 */
	findByOwner(owner: string): Promise<MeetRoom[]>;

	findByOwner<const TFields extends readonly MeetRoomField[]>(
		owner: string,
		fields: TFields
	): Promise<ProjectedMeetRoom<TFields>[]>;

	findByOwner(owner: string, fields?: readonly MeetRoomField[]): Promise<MeetRoom[] | Partial<MeetRoom>[]> {
		return this.findAll({ owner }, fields as string[]) as Promise<MeetRoom[] | Partial<MeetRoom>[]>;
	}

	/**
	 * Finds room IDs where registered access is enabled.
	 *
	 * @returns Array of rooms including only roomId
	 */
	async findRoomIdsWithRegisteredAccessEnabled(): Promise<string[]> {
		const rooms = await this.findAll({ 'access.registered.enabled': true }, ['roomId']);
		return rooms.map((room) => room.roomId);
	}

	/**
	 * Finds rooms with optional filtering, pagination, and sorting.
	 * Returns rooms with enriched URLs (including base URL).
	 *
	 * Uses compound sorting (sortField + _id) to ensure consistent pagination
	 * even when the sort field has duplicate values.
	 *
	 * @param options - Query options
	 * @param options.roomName - Optional room name to filter by (case-insensitive partial match)
	 * @param options.status - Optional room status to filter by
	 * @param options.owner - Optional owner userId to filter by
	 * @param options.member - Optional member userId to filter rooms where user is a member
	 * @param options.registeredAccess - If true, includes rooms with registered access enabled
	 * @param options.fields - Array of field names to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'creationDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing rooms array, pagination info, and optional next page token
	 */
	async find(options?: RoomQuery): Promise<MeetRoomPage<MeetRoom>>;

	async find<const TFields extends readonly MeetRoomField[]>(
		options: RoomQueryWithProjection<TFields>
	): Promise<MeetRoomPage<ProjectedMeetRoom<TFields>>>;

	async find(options: RoomQueryWithFields): Promise<MeetRoomPage<MeetRoom | Partial<MeetRoom>>>;

	async find(options: RoomQueryWithFields = {}): Promise<MeetRoomPage<MeetRoom | Partial<MeetRoom>>> {
		const {
			roomName,
			status,
			owner,
			member,
			registeredAccess,
			fields,
			maxItems = 100,
			nextPageToken,
			sortField = 'creationDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: QueryFilter<MeetRoomDocument> = {};

		const accessScopeOrFilters: QueryFilter<MeetRoomDocument>[] = [];

		if (owner) {
			accessScopeOrFilters.push({ owner });
		}

		if (member) {
			const memberRoomIds = await this.roomMemberRepository.getRoomIdsByMemberId(member);
			accessScopeOrFilters.push({ roomId: { $in: memberRoomIds } });
		}

		if (registeredAccess) {
			accessScopeOrFilters.push({ 'access.registered.enabled': true });
		}

		if (accessScopeOrFilters.length === 1) {
			Object.assign(filter, accessScopeOrFilters[0]);
		} else if (accessScopeOrFilters.length > 1) {
			filter.$or = accessScopeOrFilters;
		}

		if (roomName) {
			filter.roomName = new RegExp(roomName, 'i');
		}

		if (status) {
			filter.status = status;
		}

		// Use base repository's pagination method
		const result = await this.findMany(
			filter,
			{
				maxItems,
				nextPageToken,
				sortField,
				sortOrder
			},
			fields as string[]
		);

		return {
			rooms: result.items,
			isTruncated: result.isTruncated,
			nextPageToken: result.nextPageToken
		};
	}

	/**
	 * Finds expired rooms (autoDeletionDate < now) in paginated batches.
	 *
	 * @param batchSize - Number of rooms to retrieve per page
	 * @param pageToken - Optional cursor token from a previous call
	 * @returns A paginated page of expired rooms
	 */
	async findExpiredRooms(batchSize = 100, pageToken?: string): Promise<MeetRoomPage<MeetRoom>> {
		const now = Date.now();

		const { items, isTruncated, nextPageToken } = await this.findMany(
			{
				autoDeletionDate: { $exists: true, $lt: now }
			},
			{
				maxItems: batchSize,
				nextPageToken: pageToken,
				sortField: 'autoDeletionDate',
				sortOrder: SortOrder.ASC
			}
		);

		return {
			rooms: items,
			isTruncated,
			nextPageToken
		};
	}

	/**
	 * Finds active rooms in paginated batches, projecting only roomId.
	 *
	 * @param batchSize - Number of rooms to retrieve per page
	 * @param pageToken - Optional cursor token from a previous call
	 * @returns A paginated page of active room identifiers
	 */
	async findActiveRooms(batchSize = 100, pageToken?: string): Promise<MeetRoomPage<Pick<MeetRoom, 'roomId'>>> {
		const { items, isTruncated, nextPageToken } = await this.findMany(
			{
				status: MeetRoomStatus.ACTIVE_MEETING
			},
			{
				maxItems: batchSize,
				nextPageToken: pageToken,
				sortField: 'creationDate',
				sortOrder: SortOrder.DESC
			},
			['roomId']
		);

		return {
			rooms: items as Pick<MeetRoom, 'roomId'>[],
			isTruncated,
			nextPageToken
		};
	}

	/**
	 * Deletes a room by its roomId.
	 *
	 * @param roomId - The unique room identifier
	 * @throws Error if the room was not found or could not be deleted
	 */
	deleteByRoomId(roomId: string): Promise<void> {
		return this.deleteOne({ roomId });
	}

	/**
	 * Deletes multiple rooms by their roomIds.
	 *
	 * @param roomIds - Array of room identifiers
	 * @throws Error if no rooms were found or could not be deleted
	 */
	deleteByRoomIds(roomIds: string[]): Promise<void> {
		return this.deleteMany({ roomId: { $in: roomIds } });
	}

	/**
	 * Counts the total number of rooms.
	 */
	countTotal(): Promise<number> {
		return this.count();
	}

	/**
	 * Counts the number of rooms with active meetings.
	 */
	countActiveRooms(): Promise<number> {
		return this.count({ status: MeetRoomStatus.ACTIVE_MEETING });
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Normalizes room data for storage by removing the base URL from access URLs.
	 * This ensures only the path is stored in the database.
	 * NOTE: Only normalizes fields that are present in the partial payload.
	 *
	 * @param room - The partial room data to normalize
	 * @returns Normalized partial room data
	 */
	private normalizeRoomForStorage(room: Partial<MeetRoom>): Partial<MeetRoom> {
		const registeredUrl = room.access?.registered.url;
		const moderatorUrl = room.access?.anonymous.moderator.url;
		const speakerUrl = room.access?.anonymous.speaker.url;
		const recordingUrl = room.access?.anonymous.recording.url;

		if (registeredUrl) {
			room.access!.registered.url = this.extractPathFromUrl(registeredUrl);
		}

		if (moderatorUrl) {
			room.access!.anonymous.moderator.url = this.extractPathFromUrl(moderatorUrl);
		}

		if (speakerUrl) {
			room.access!.anonymous.speaker.url = this.extractPathFromUrl(speakerUrl);
		}

		if (recordingUrl) {
			room.access!.anonymous.recording.url = this.extractPathFromUrl(recordingUrl);
		}

		return room;
	}

	/**
	 * Extracts the path from a URL, removing the base URL and basePath if present.
	 * This ensures only the route path is stored in the database, without the basePath prefix.
	 *
	 * @param url - The URL to process
	 * @returns The path portion of the URL without the basePath prefix
	 */
	private extractPathFromUrl(url: string): string {
		// If already a path, strip basePath and return
		if (url.startsWith('/')) {
			return this.stripBasePath(url);
		}

		try {
			const urlObj = new URL(url);
			const pathname = this.stripBasePath(urlObj.pathname);
			return pathname + urlObj.search + urlObj.hash;
		} catch {
			// If URL parsing fails, assume it's already a path
			return url;
		}
	}

	/**
	 * Strips the basePath from a given path if it starts with it.
	 *
	 * @param path - The path to process
	 * @returns The path without the basePath prefix
	 */
	private stripBasePath(path: string): string {
		const basePath = getBasePath();
		// Remove trailing slash from basePath for comparison (e.g., '/meet/' -> '/meet')
		const basePathWithoutTrailingSlash = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

		if (basePathWithoutTrailingSlash && path.startsWith(basePathWithoutTrailingSlash)) {
			return path.slice(basePathWithoutTrailingSlash.length) || '/';
		}

		return path;
	}

	/**
	 * Enriches room data by adding the base URL to access URLs.
	 * Only enriches URLs that are present in the document.
	 *
	 * @param document - The MongoDB document
	 * @returns Room data with complete URLs
	 */
	private enrichRoomWithBaseUrls(room: MeetRoom): MeetRoom {
		const baseUrl = getBaseUrl();

		const registeredUrl = room.access?.registered.url;
		const moderatorUrl = room.access?.anonymous.moderator.url;
		const speakerUrl = room.access?.anonymous.speaker.url;
		const recordingUrl = room.access?.anonymous.recording.url;

		if (registeredUrl) {
			room.access!.registered.url = `${baseUrl}${registeredUrl}`;
		}

		if (moderatorUrl) {
			room.access!.anonymous.moderator.url = `${baseUrl}${moderatorUrl}`;
		}

		if (speakerUrl) {
			room.access!.anonymous.speaker.url = `${baseUrl}${speakerUrl}`;
		}

		if (recordingUrl) {
			room.access!.anonymous.recording.url = `${baseUrl}${recordingUrl}`;
		}

		return room;
	}
}
