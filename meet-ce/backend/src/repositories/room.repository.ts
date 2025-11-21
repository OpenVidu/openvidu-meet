import { MeetRoom } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomDocument, MeetRoomModel } from '../models/mongoose-schemas/index.js';
import { LoggerService } from '../services/logger.service.js';
import { getBaseUrl } from '../utils/url.utils.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing MeetRoom entities in MongoDB.
 * Provides CRUD operations and specialized queries for room data.
 *
 * @template TRoom - The domain type extending MeetRoom (default: MeetRoom)
 */
@injectable()
export class RoomRepository<TRoom extends MeetRoom = MeetRoom> extends BaseRepository<TRoom, MeetRoomDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRoomModel);
	}

	/**
	 * Transforms a MongoDB document into a domain room object.
	 * Enriches URLs with the base URL.
	 *
	 * @param document - The MongoDB document
	 * @returns Room with complete URLs
	 */
	protected toDomain(document: MeetRoomDocument): TRoom {
		return this.enrichRoomWithBaseUrls(document);
	}

	/**
	 * Creates a new room.
	 * URLs are stored in the database without the base URL.
	 *
	 * @param room - The room data to create
	 * @returns The created room with enriched URLs
	 */
	async create(room: TRoom): Promise<TRoom> {
		const normalizedRoom = this.normalizeRoomForStorage(room);
		const document = await this.createDocument(normalizedRoom);
		return this.enrichRoomWithBaseUrls(document);
	}

	/**
	 * Updates an existing room.
	 * URLs are stored in the database without the base URL.
	 *
	 * @param room - The complete updated room data
	 * @returns The updated room with enriched URLs
	 * @throws Error if room not found
	 */
	async update(room: TRoom): Promise<TRoom> {
		const normalizedRoom = this.normalizeRoomForStorage(room);
		const document = await this.updateOne({ roomId: room.roomId }, normalizedRoom);
		return this.enrichRoomWithBaseUrls(document);
	}

	/**
	 * Finds a room by its roomId.
	 * Returns the room with enriched URLs (including base URL).
	 *
	 * @param roomId - The unique room identifier
	 * @returns The room or null if not found
	 */
	async findByRoomId(roomId: string): Promise<TRoom | null> {
		const document = await this.findOne({ roomId });
		return document ? this.enrichRoomWithBaseUrls(document) : null;
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
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'createdAt')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing rooms array, pagination info, and optional next page token
	 */
	async find(
		options: {
			roomName?: string;
			maxItems?: number;
			nextPageToken?: string;
			sortField?: string;
			sortOrder?: 'asc' | 'desc';
		} = {}
	): Promise<{
		rooms: TRoom[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const { roomName, maxItems = 100, nextPageToken, sortField = 'creationDate', sortOrder = 'desc' } = options;

		// Build base filter
		const filter: Record<string, unknown> = {};

		if (roomName) {
			filter.roomName = new RegExp(roomName, 'i');
		}

		// Use base repository's pagination method
		const result = await this.findMany(filter, {
			maxItems,
			nextPageToken,
			sortField,
			sortOrder
		});

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
	async findExpiredRooms(): Promise<TRoom[]> {
		const now = Date.now();

		// Find all rooms where autoDeletionDate exists and is less than now
		return await this.findAll({
			autoDeletionDate: { $exists: true, $lt: now }
		});
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
		return await this.count();
	}

	/**
	 * Counts the number of rooms with active meetings.
	 */
	async countActiveRooms(): Promise<number> {
		return await this.count({ status: 'active_meeting' });
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Normalizes room data for storage by removing the base URL from URLs.
	 * This ensures only the path is stored in the database.
	 *
	 * @param room - The room data to normalize
	 * @returns Normalized room data
	 */
	private normalizeRoomForStorage(room: TRoom): TRoom {
		return {
			...room,
			moderatorUrl: this.extractPathFromUrl(room.moderatorUrl),
			speakerUrl: this.extractPathFromUrl(room.speakerUrl)
		};
	}

	/**
	 * Extracts the path from a URL, removing the base URL if present.
	 *
	 * @param url - The URL to process
	 * @returns The path portion of the URL
	 */
	private extractPathFromUrl(url: string): string {
		// If already a path, return as-is
		if (url.startsWith('/')) {
			return url;
		}

		try {
			const urlObj = new URL(url);
			return urlObj.pathname + urlObj.search + urlObj.hash;
		} catch {
			// If URL parsing fails, assume it's already a path
			return url;
		}
	}

	/**
	 * Enriches room data by adding the base URL to URLs.
	 * Converts MongoDB document to domain object.
	 *
	 * @param document - The MongoDB document
	 * @returns Room data with complete URLs
	 */
	private enrichRoomWithBaseUrls(document: MeetRoomDocument): TRoom {
		const baseUrl = getBaseUrl();
		const room = document.toObject() as TRoom;

		return {
			...room,
			moderatorUrl: `${baseUrl}${room.moderatorUrl}`,
			speakerUrl: `${baseUrl}${room.speakerUrl}`
		};
	}
}
