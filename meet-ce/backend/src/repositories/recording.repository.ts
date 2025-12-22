import { MeetRecordingFilters, MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import { uid as secureUid } from 'uid/secure';
import { MeetRecordingDocument, MeetRecordingModel } from '../models/mongoose-schemas/recording.schema.js';
import { LoggerService } from '../services/logger.service.js';
import { BaseRepository } from './base.repository.js';

/**
 * Repository for managing recording entities in MongoDB.
 * Handles CRUD operations and query filtering for recordings.
 */
@injectable()
export class RecordingRepository<TRecording extends MeetRecordingInfo = MeetRecordingInfo> extends BaseRepository<
	TRecording,
	MeetRecordingDocument
> {
	constructor(@inject(LoggerService) logger: LoggerService) {
		super(logger, MeetRecordingModel);
	}

	/**
	 * Transforms a Mongoose document to a domain object.
	 * Removes access secrets before returning.
	 */
	protected toDomain(document: MeetRecordingDocument): TRecording {
		return document.toObject() as TRecording;
	}

	/**
	 * Creates a new recording document in the database.
	 * Automatically generates access secrets if not provided.
	 *
	 * @param recording - The recording information to create (optionally includes accessSecrets)
	 * @returns The created recording (without access secrets)
	 */
	async create(recording: TRecording): Promise<TRecording> {
		// Check if recording already includes accessSecrets
		const hasAccessSecrets =
			'accessSecrets' in recording &&
			recording.accessSecrets &&
			typeof recording.accessSecrets === 'object' &&
			'public' in recording.accessSecrets &&
			'private' in recording.accessSecrets;

		// Generate access secrets only if not provided
		const recordingDoc = {
			...recording,
			accessSecrets: hasAccessSecrets
				? recording.accessSecrets
				: {
						public: secureUid(10),
						private: secureUid(10)
					}
		};

		const result = await this.createDocument(recordingDoc);
		return this.toDomain(result);
	}

	/**
	 * Updates an existing recording.
	 *
	 * @param recording - The recording data to update
	 * @returns The updated recording (without access secrets)
	 * @throws Error if recording not found
	 */
	async update(recording: TRecording): Promise<TRecording> {
		const document = await this.updateOne({ recordingId: recording.recordingId }, { $set: recording });
		return this.toDomain(document);
	}

	/**
	 * Finds a recording by its recordingId.
	 *
	 * @param recordingId - The ID of the recording to find
	 * @returns The recording (without access secrets), or null if not found
	 */
	async findByRecordingId(recordingId: string): Promise<TRecording | null> {
		const document = await this.findOne({ recordingId });
		return document ? this.toDomain(document) : null;
	}

	/**
	 * Finds recordings with filtering, pagination, and sorting.
	 * Default sort is by startDate descending (newest first).
	 *
	 * Uses compound sorting (sortField + _id) to ensure consistent pagination
	 * even when the sort field has duplicate values.
	 *
	 * @param options - Query options
	 * @param options.roomId - Optional room ID for exact match filtering
	 * @param options.roomName - Optional room name for regex match filtering (case-insensitive)
	 * @param options.status - Optional recording status to filter by
	 * @param options.fields - Comma-separated list of fields to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 10)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'startDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing recordings array, pagination info, and optional next page token
	 */
	async find(options: MeetRecordingFilters = {}): Promise<{
		recordings: TRecording[];
		isTruncated: boolean;
		nextPageToken?: string;
	}> {
		const {
			roomId,
			roomName,
			status,
			fields,
			maxItems = 10,
			nextPageToken,
			sortField = 'startDate',
			sortOrder = 'desc'
		} = options;

		// Build base filter
		const filter: Record<string, unknown> = {};

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
		const result = await this.findMany(filter, {
			maxItems,
			nextPageToken,
			sortField,
			sortOrder
		});

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
	async findAllByRoomId(roomId: string): Promise<TRecording[]> {
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
	async findActiveRecordings(): Promise<TRecording[]> {
		return await this.findAll({
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
		await this.deleteOne({ recordingId });
	}

	/**
	 * Deletes multiple recordings by their recordingIds.
	 *
	 * @param recordingIds - Array of recording IDs to delete
	 * @throws Error if any recording was not found or could not be deleted
	 */
	async deleteByRecordingIds(recordingIds: string[]): Promise<void> {
		await this.deleteMany({ recordingId: { $in: recordingIds } });
	}

	/**
	 * Counts the total number of recordings.
	 */
	async countTotal(): Promise<number> {
		return await this.count();
	}

	/**
	 * Counts the number of recordings with status 'complete'.
	 */
	async countCompleteRecordings(): Promise<number> {
		return await this.count({ status: 'complete' });
	}
}
