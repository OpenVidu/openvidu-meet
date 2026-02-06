import { MeetRoom, MeetRoomStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { MeetRoomDocument, MeetRoomModel } from '../models/mongoose-schemas/room.schema.js';
import { MeetRoomField, MeetRoomFilters } from '../models/room-request.js';
import { LoggerService } from '../services/logger.service.js';
import { getBasePath } from '../utils/html-injection.utils.js';
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
	 * @param fields - Comma-separated list of fields to include in the result
	 * @returns The room or null if not found
	 */
	async findByRoomId(roomId: string, fields?: MeetRoomField[]): Promise<TRoom | null> {
		//!FIXME: This transform should be removed once the controller is updated to pass the fields as an array of MeetRoomField instead of a comma-separated string.
		const fieldsString = fields ? fields.join(',') : undefined;
		const document = await this.findOne({ roomId }, fieldsString);
		return document ? this.enrichRoomWithBaseUrls(document) : null;
	}

	/**
	 * Finds rooms owned by a specific user.
	 * Returns rooms with enriched URLs (including base URL).
	 *
	 * @param owner - The userId of the room owner
	 * @param fields - Comma-separated list of fields to include in the result
	 * @returns Array of rooms owned by the user
	 */
	async findByOwner(owner: string, fields?: string): Promise<TRoom[]> {
		return await this.findAll({ owner }, fields);
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
	 * @param options.fields - Comma-separated list of fields to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 100)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'creationDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing rooms array, pagination info, and optional next page token
	 */
	async find(options: MeetRoomFilters & { owner?: string; roomIds?: string[] } = {}): Promise<{
		rooms: TRoom[];
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
			sortOrder = 'desc'
		} = options;

		// Build base filter
		const filter: Record<string, unknown> = {};

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
			//! FIXME: This transform should be removed because the findMany method should accept an array of fields instead of a comma-separated string, to avoid unnecessary string manipulation
			fields?.join(',')
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
	async findExpiredRooms(): Promise<TRoom[]> {
		const now = Date.now();

		// Find all rooms where autoDeletionDate exists and is less than now
		return await this.findAll({
			autoDeletionDate: { $exists: true, $lt: now }
		});
	}

	/**
	 * Finds all rooms with active meetings.
	 * Returns all active rooms without pagination.
	 *
	 * @returns Array of active rooms with enriched URLs
	 */
	async findActiveRooms(): Promise<TRoom[]> {
		return await this.findAll({
			status: MeetRoomStatus.ACTIVE_MEETING
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
		return await this.count({ status: MeetRoomStatus.ACTIVE_MEETING });
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Normalizes room data for storage by removing the base URL from access URLs.
	 * This ensures only the path is stored in the database.
	 *
	 * @param room - The room data to normalize
	 * @returns Normalized room data
	 */
	private normalizeRoomForStorage(room: TRoom): TRoom {
		return {
			...room,
			accessUrl: this.extractPathFromUrl(room.accessUrl),
			anonymous: {
				...room.anonymous,
				moderator: {
					...room.anonymous.moderator,
					accessUrl: this.extractPathFromUrl(room.anonymous.moderator.accessUrl)
				},
				speaker: {
					...room.anonymous.speaker,
					accessUrl: this.extractPathFromUrl(room.anonymous.speaker.accessUrl)
				}
			}
		};
	}

	/**
	 * Extracts the path from a URL, removing the base URL and basePath if present.
	 * This ensures only the route path is stored in the database, without the basePath prefix.
	 *
	 * @param url - The URL to process
	 * @returns The path portion of the URL without the basePath prefix
	 */
	private extractPathFromUrl(url: string): string {
		const basePath = getBasePath();
		// Remove trailing slash from basePath for comparison (e.g., '/meet/' -> '/meet')
		const basePathWithoutTrailingSlash = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

		// Helper to strip basePath from a path
		const stripBasePath = (path: string): string => {
			if (basePathWithoutTrailingSlash !== '' && path.startsWith(basePathWithoutTrailingSlash)) {
				return path.slice(basePathWithoutTrailingSlash.length) || '/';
			}

			return path;
		};

		// If already a path, strip basePath and return
		if (url.startsWith('/')) {
			return stripBasePath(url);
		}

		try {
			const urlObj = new URL(url);
			const pathname = stripBasePath(urlObj.pathname);
			return pathname + urlObj.search + urlObj.hash;
		} catch {
			// If URL parsing fails, assume it's already a path
			return url;
		}
	}

	/**
	 * Enriches room data by adding the base URL to access URLs.
	 * Converts MongoDB document to domain object.
	 * Only enriches URLs that are present in the document.
	 *
	 * @param document - The MongoDB document
	 * @returns Room data with complete URLs
	 */
	private enrichRoomWithBaseUrls(document: MeetRoomDocument): TRoom {
		const baseUrl = getBaseUrl();
		const room = document.toObject() as TRoom;

		return {
			...room,
			...(room.accessUrl !== undefined && { accessUrl: `${baseUrl}${room.accessUrl}` }),
			...(room.anonymous !== undefined && {
				anonymous: {
					...room.anonymous,
					moderator: {
						...room.anonymous.moderator,
						accessUrl: `${baseUrl}${room.anonymous.moderator.accessUrl}`
					},
					speaker: {
						...room.anonymous.speaker,
						accessUrl: `${baseUrl}${room.anonymous.speaker.accessUrl}`
					}
				}
			})
		};
	}
}
