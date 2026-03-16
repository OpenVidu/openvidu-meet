import { MeetRoom, MeetRoomField, MeetRoomFilters, MeetRoomStatus, SortOrder } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { QueryFilter, Require_id } from 'mongoose';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import {
	MEET_ROOM_DOCUMENT_ONLY_FIELDS,
	MeetRoomDocument,
	MeetRoomDocumentOnlyField,
	MeetRoomModel
} from '../models/mongoose-schemas/room.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { getBasePath } from '../utils/html-dynamic-base-path.utils.js';
import { getBaseUrl } from '../utils/url.utils.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetRoom entities in MongoDB.
 * Provides CRUD operations and specialized queries for room data.
 */
@injectable()
export class RoomRepository extends BaseRepository<MeetRoom, MeetRoomDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRoomModel);
	}

	/**
	 * Transforms a persisted MeetRoom document into a domain MeetRoom object.
	 * Enriches access URLs with the base URL.
	 *
	 * @param dbObject - The MongoDB document representing a room
	 * @returns Room with complete URLs
	 */
	protected toDomain(dbObject: Require_id<MeetRoomDocument> & { __v: number }): MeetRoom {
		const { _id, __v, schemaVersion, ...room } = dbObject;
		(void _id, __v, schemaVersion);
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
	async create(room: MeetRoom): Promise<MeetRoom> {
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
	async updatePartial(roomId: string, fieldsToUpdate: Partial<MeetRoom>): Promise<MeetRoom> {
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
	async replace(room: MeetRoom): Promise<MeetRoom> {
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
	async findByRoomId(roomId: string, fields?: MeetRoomField[]): Promise<MeetRoom | null> {
		return this.findOne({ roomId }, fields);
	}

	/**
	 * Finds rooms owned by a specific user.
	 * Returns rooms with enriched URLs (including base URL).
	 *
	 * @param owner - The userId of the room owner
	 * @param fields - Array of field names to include in the result
	 * @returns Array of rooms owned by the user
	 */
	async findByOwner(owner: string, fields?: MeetRoomField[]): Promise<MeetRoom[]> {
		return this.findAll({ owner }, fields);
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
	 * @param options.roomIds - Optional array of room IDs to filter by, representing rooms the user is a member of
	 * @param options.fields - Array of field names to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'creationDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing rooms array, pagination info, and optional next page token
	 */
	async find(options: MeetRoomFilters & { owner?: string; roomIds?: string[] } = {}): Promise<{
		rooms: MeetRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const {
			roomName,
			status,
			owner,
			roomIds,
			fields,
			maxItems = 100,
			nextPageToken,
			sortField = 'creationDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: QueryFilter<MeetRoomDocument> = {};

		// Handle owner and roomIds with $or when both are present
		if (owner && roomIds) {
			filter.$or = [{ owner }, { roomId: { $in: roomIds } }];
		} else if (owner) {
			filter.owner = owner;
		} else if (roomIds) {
			filter.roomId = { $in: roomIds };
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
			fields
		);

		return {
			rooms: result.items,
			isTruncated: result.isTruncated,
			nextPageToken: result.nextPageToken
		};
	}

	/**
	 * Finds all rooms that have expired (autoDeletionDate < now).
	 * Returns all expired rooms without pagination.
	 *
	 * @returns Array of expired rooms with enriched URLs
	 */
	async findExpiredRooms(): Promise<MeetRoom[]> {
		const now = Date.now();

		// Find all rooms where autoDeletionDate exists and is less than now
		return this.findAll({
			autoDeletionDate: { $exists: true, $lt: now }
		});
	}

	/**
	 * Finds all rooms with active meetings.
	 *
	 * @returns Array of all active rooms with ONLY the roomId field and without pagination.
	 */
	async findActiveRooms(): Promise<MeetRoom[]> {
		return this.findAll(
			{
				status: MeetRoomStatus.ACTIVE_MEETING
			},
			['roomId']
		);
	}

	/**
	 * Deletes a room by its roomId.
	 *
	 * @param roomId - The unique room identifier
	 * @throws Error if the room was not found or could not be deleted
	 */
	async deleteByRoomId(roomId: string): Promise<void> {
		await this.deleteOne({ roomId });
	}

	/**
	 * Deletes multiple rooms by their roomIds.
	 *
	 * @param roomIds - Array of room identifiers
	 * @throws Error if no rooms were found or could not be deleted
	 */
	async deleteByRoomIds(roomIds: string[]): Promise<void> {
		await this.deleteMany({ roomId: { $in: roomIds } });
	}

	/**
	 * Counts the total number of rooms.
	 */
	async countTotal(): Promise<number> {
		return this.count();
	}

	/**
	 * Counts the number of rooms with active meetings.
	 */
	async countActiveRooms(): Promise<number> {
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
