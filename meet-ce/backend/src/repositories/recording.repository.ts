import {
	MeetRecordingField,
	MeetRecordingFilters,
	MeetRecordingInfo,
	MeetRecordingStatus,
	SortOrder
} from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { FilterQuery, Require_id } from 'mongoose';
import { uid as secureUid } from 'uid/secure';
import { MeetRecordingDocument, MeetRecordingModel } from '../models/mongoose-schemas/recording.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing recording entities in MongoDB.
 * Provides CRUD operations and specialized queries for recording data.
 */
@injectable()
export class RecordingRepository extends BaseRepository<MeetRecordingInfo, MeetRecordingDocument> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRecordingModel);
	}

	protected toDomain(dbObject: Require_id<MeetRecordingDocument> & { __v: number }): MeetRecordingInfo {
		const { _id, __v, schemaVersion, accessSecrets, ...recording } = dbObject;
		(void _id, __v, schemaVersion, accessSecrets);
		return recording as MeetRecordingInfo;
	}

	/**
	 * Creates a new recording with generated access secrets.
	 *
	 * @param recording - The recording information to create (excluding access secrets)
	 * @returns The created recording (without access secrets)
	 */
	async create(recording: MeetRecordingInfo): Promise<MeetRecordingInfo> {
		// Generate access secrets
		const recordingDoc: Omit<MeetRecordingDocument, 'schemaVersion'> = {
			...recording,
			accessSecrets: {
				public: secureUid(10),
				private: secureUid(10)
			}
		};
		return this.createDocument(recordingDoc);
	}

	/**
	 * Updates an existing recording.
	 *
	 * @param recording - The recording data to update
	 * @returns The updated recording (without access secrets)
	 * @throws Error if recording not found
	 */
	async update(recording: MeetRecordingInfo): Promise<MeetRecordingInfo> {
		return this.updateOne({ recordingId: recording.recordingId }, { $set: recording });
	}

	/**
	 * Finds a recording by its recordingId.
	 *
	 * @param recordingId - The ID of the recording to find
	 * @param fields - Array of field names to include in the result
	 * @returns The recording (without access secrets), or null if not found
	 */
	async findByRecordingId(recordingId: string, fields?: MeetRecordingField[]): Promise<MeetRecordingInfo | null> {
		return this.findOne({ recordingId }, fields);
	}

	/**
	 * Finds recordings with filtering, pagination, and sorting.
	 * Default sort is by startDate descending (newest first).
	 *
	 * Uses compound sorting (sortField + _id) to ensure consistent pagination
	 * even when the sort field has duplicate values.
	 *
	 * @param options - Query options
	 * @param options.roomIds - Optional array of room IDs to filter by
	 * @param options.roomId - Optional room ID for exact match filtering
	 * @param options.roomName - Optional room name for regex match filtering (case-insensitive)
	 * @param options.status - Optional recording status to filter by
	 * @param options.fields - Array of field names to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 10)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'startDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing recordings array, pagination info, and optional next page token
	 */
	async find(options: MeetRecordingFilters & { roomIds?: string[] } = {}): Promise<{
		recordings: MeetRecordingInfo[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const {
			roomIds,
			roomId,
			roomName,
			status,
			fields,
			maxItems = 10,
			nextPageToken,
			sortField = 'startDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: FilterQuery<MeetRecordingDocument> = {};

		if (roomIds) {
			// Filter by multiple room IDs
			filter.roomId = { $in: roomIds };
		}

		if (roomId && roomName) {
			// Both defined: OR filter with exact roomId match and regex roomName match
			filter.$or = [{ roomId }, { roomName: new RegExp(roomName, 'i') }];
		} else if (roomId) {
			// Only roomId defined: exact match
			filter.roomId = roomId;
		} else if (roomName) {
			// Only roomName defined: regex match (case-insensitive)
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
			recordings: result.items,
			isTruncated: result.isTruncated,
			nextPageToken: result.nextPageToken
		};
	}

	/**
	 * Finds all recordings for a specific roomId.
	 *
	 * @param roomId - The ID of the room
	 * @returns Array of recordings for the specified room
	 */
	async findAllByRoomId(roomId: string): Promise<MeetRecordingInfo[]> {
		return await this.findAll({ roomId });
	}

	/**
	 * Finds access secrets for a specific recording.
	 * This is the only method that returns the access secrets.
	 *
	 * @param recordingId - The ID of the recording
	 * @returns Object with public and private secrets, or null if not found
	 */
	async findAccessSecretsByRecordingId(
		recordingId: string
	): Promise<{ publicAccessSecret: string; privateAccessSecret: string } | null> {
		const result = await this.model.findOne({ recordingId }).select('accessSecrets').exec();

		if (!result || !result.accessSecrets) {
			return null;
		}

		return {
			publicAccessSecret: result.accessSecrets.public,
			privateAccessSecret: result.accessSecrets.private
		};
	}

	/**
	 * Finds all active recordings (status 'ACTIVE' or 'ENDING').
	 * Returns all active recordings without pagination.
	 *
	 * @returns Array of active recordings
	 */
	async findActiveRecordings(): Promise<MeetRecordingInfo[]> {
		return this.findAll({
			status: { $in: [MeetRecordingStatus.ACTIVE, MeetRecordingStatus.ENDING] }
		});
	}

	/**
	 * Deletes a recording by its recordingId.
	 *
	 * @param recordingId - The ID of the recording to delete
	 * @throws Error if the recording was not found or could not be deleted
	 */
	async deleteByRecordingId(recordingId: string): Promise<void> {
		this.deleteOne({ recordingId });
	}

	/**
	 * Deletes multiple recordings by their recordingIds.
	 *
	 * @param recordingIds - Array of recording IDs to delete
	 * @throws Error if any recording was not found or could not be deleted
	 */
	async deleteByRecordingIds(recordingIds: string[]): Promise<void> {
		this.deleteMany({ recordingId: { $in: recordingIds } });
	}

	/**
	 * Counts the total number of recordings.
	 */
	async countTotal(): Promise<number> {
		return this.count();
	}

	/**
	 * Counts the number of recordings with status 'complete'.
	 */
	async countCompleteRecordings(): Promise<number> {
		return await this.count({ status: 'complete' });
	}
}
