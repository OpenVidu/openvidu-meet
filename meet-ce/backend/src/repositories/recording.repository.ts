import type { MeetRecordingField, MeetRecordingInfo } from '@openvidu-meet/typings';
import { MeetRecordingStatus, SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { inject, injectable } from 'inversify';
import type { QueryFilter } from 'mongoose';
import { uid as secureUid } from 'uid/secure';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import type {
	MeetRecordingDocument,
	MeetRecordingDocumentOnlyField
} from '../models/mongoose-schemas/recording.schema.js';
import {
	MEET_RECORDING_DOCUMENT_ONLY_FIELDS,
	MeetRecordingModel
} from '../models/mongoose-schemas/recording.schema.js';
import { LoggerService } from '../services/logger.service.js';
import type {
	MeetRecordingPage,
	ProjectedRecording,
	RecordingQuery,
	RecordingQueryWithFields,
	RecordingQueryWithProjection
} from '../types/recording-projection.types.js';
import { buildStringMatchFilter } from '../utils/string-match-filter.utils.js';
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

	protected toDomain(dbObject: MeetRecordingDocument): MeetRecordingInfo {
		const { schemaVersion, accessSecrets, ...recording } = dbObject;
		(void schemaVersion, accessSecrets);
		return recording as MeetRecordingInfo;
	}

	protected override getDocumentOnlyFields(): readonly MeetRecordingDocumentOnlyField[] {
		return MEET_RECORDING_DOCUMENT_ONLY_FIELDS;
	}

	protected override getAtomicUpdatePaths(): readonly string[] {
		// Recording encoding must be treated as an atomic update path because
		// it can be either a string or an object, and we want to ensure it is fully replaced rather than partially updated.
		return ['encoding'];
	}

	/**
	 * Creates a new recording with generated access secrets.
	 *
	 * @param recording - The recording information to create (excluding access secrets)
	 * @returns The created recording (without access secrets)
	 */
	create(recording: MeetRecordingInfo): Promise<MeetRecordingInfo> {
		const document: MeetRecordingDocument = {
			...recording,
			accessSecrets: {
				public: secureUid(10),
				private: secureUid(10)
			},
			schemaVersion: INTERNAL_CONFIG.RECORDING_SCHEMA_VERSION
		};
		return this.createDocument(document);
	}

	/**
	 * Updates specific fields of a recording without replacing the entire document.
	 *
	 * @param recordingId - The recording identifier
	 * @param fieldsToUpdate - Partial recording data with fields to update
	 * @returns The updated recording (without access secrets)
	 * @throws Error if recording not found
	 */
	updatePartial(recordingId: string, fieldsToUpdate: Partial<MeetRecordingInfo>): Promise<MeetRecordingInfo> {
		return this.updatePartialOne({ recordingId }, fieldsToUpdate);
	}

	/**
	 * Replaces an existing recording with new data.
	 *
	 * @param recording - The recording data to update
	 * @returns The updated recording (without access secrets)
	 * @throws Error if recording not found
	 */
	replace(recording: MeetRecordingInfo): Promise<MeetRecordingInfo> {
		return this.replaceOne({ recordingId: recording.recordingId }, recording);
	}

	/**
	 * Finds a recording by its recordingId.
	 *
	 * @param recordingId - The ID of the recording to find
	 * @param fields - Array of field names to include in the result
	 * @returns The recording (without access secrets), or null if not found
	 */
	findByRecordingId(recordingId: string): Promise<MeetRecordingInfo | null>;

	findByRecordingId<const TFields extends readonly MeetRecordingField[]>(
		recordingId: string,
		fields: TFields
	): Promise<ProjectedRecording<TFields> | null>;

	findByRecordingId(
		recordingId: string,
		fields?: readonly MeetRecordingField[]
	): Promise<MeetRecordingInfo | Partial<MeetRecordingInfo> | null>;

	findByRecordingId(
		recordingId: string,
		fields?: readonly MeetRecordingField[]
	): Promise<MeetRecordingInfo | Partial<MeetRecordingInfo> | null> {
		return this.findOne({ recordingId }, fields as string[]) as Promise<
			MeetRecordingInfo | Partial<MeetRecordingInfo> | null
		>;
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
	 * @param options.roomName - Optional room name for filtering
	 * @param options.roomNameMatchMode - Optional room name match mode (default: exact)
	 * @param options.roomNameCaseInsensitive - Optional room name case-insensitive flag (default: false)
	 * @param options.status - Optional recording status to filter by
	 * @param options.fields - Array of field names to include in the result
	 * @param options.maxItems - Maximum number of results to return (default: 10)
	 * @param options.nextPageToken - Token for pagination (encoded cursor with last sortField value and _id)
	 * @param options.sortField - Field to sort by (default: 'startDate')
	 * @param options.sortOrder - Sort order: 'asc' or 'desc' (default: 'desc')
	 * @returns Object containing recordings array, pagination info, and optional next page token
	 */
	async find(options?: RecordingQuery): Promise<MeetRecordingPage<MeetRecordingInfo>>;

	async find<const TFields extends readonly MeetRecordingField[]>(
		options: RecordingQueryWithProjection<TFields>
	): Promise<MeetRecordingPage<ProjectedRecording<TFields>>>;

	async find(
		options: RecordingQueryWithFields
	): Promise<MeetRecordingPage<MeetRecordingInfo | Partial<MeetRecordingInfo>>>;

	async find(
		options: RecordingQueryWithFields = {}
	): Promise<MeetRecordingPage<MeetRecordingInfo | Partial<MeetRecordingInfo>>> {
		const {
			roomIds,
			roomId,
			roomName,
			roomNameMatchMode = TextMatchMode.EXACT,
			roomNameCaseInsensitive = false,
			status,
			fields,
			maxItems = 10,
			nextPageToken,
			sortField = 'startDate',
			sortOrder = SortOrder.DESC
		} = options;

		// Build base filter
		const filter: QueryFilter<MeetRecordingDocument> = {};

		if (roomIds) {
			// Filter by multiple room IDs
			filter.roomId = { $in: roomIds };
		}

		if (roomId && roomName) {
			// Both defined: OR filter with exact roomId match and roomName match condition
			filter.$or = [{ roomId }, { roomName: buildStringMatchFilter(roomName, roomNameMatchMode, roomNameCaseInsensitive) }];
		} else if (roomId) {
			// Only roomId defined: exact match
			filter.roomId = roomId;
		} else if (roomName) {
			// Only roomName defined: apply selected match mode
			filter.roomName = buildStringMatchFilter(roomName, roomNameMatchMode, roomNameCaseInsensitive);
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
	findAllByRoomId(roomId: string): Promise<MeetRecordingInfo[]> {
		return this.findAll({ roomId });
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
		const result = await this.model.findOne({ recordingId }).select({ _id: 0, accessSecrets: 1 }).exec();

		if (!result || !result.accessSecrets) {
			return null;
		}

		return {
			publicAccessSecret: result.accessSecrets.public,
			privateAccessSecret: result.accessSecrets.private
		};
	}

	/**
	 * Finds active recordings (status 'ACTIVE' or 'ENDING') with pagination.
	 * This method should be used instead of findActiveRecordings() when dealing with potentially large result sets.
	 * Allows processing active recordings in batches without blocking or loading all into memory at once.
	 *
	 * @param batchSize - Number of recordings to fetch per batch (default: 100)
	 * @param nextPageToken - Optional pagination token from previous call
	 * @returns Object containing current batch of recordings, pagination flag, and optional next page token
	 */
	async findActiveRecordings(batchSize = 100, pageToken?: string): Promise<MeetRecordingPage<MeetRecordingInfo>> {
		const filter: QueryFilter<MeetRecordingDocument> = {
			status: { $in: [MeetRecordingStatus.ACTIVE, MeetRecordingStatus.ENDING] }
		};

		const { items, isTruncated, nextPageToken } = await this.findMany(filter, {
			maxItems: batchSize,
			nextPageToken: pageToken,
			sortField: 'startDate',
			sortOrder: SortOrder.DESC
		});

		return {
			recordings: items,
			isTruncated,
			nextPageToken
		};
	}

	/**
	 * Deletes a recording by its recordingId.
	 *
	 * @param recordingId - The ID of the recording to delete
	 * @throws Error if the recording was not found or could not be deleted
	 */
	deleteByRecordingId(recordingId: string): Promise<void> {
		return this.deleteOne({ recordingId });
	}

	/**
	 * Deletes multiple recordings by their recordingIds.
	 *
	 * @param recordingIds - Array of recording IDs to delete
	 * @throws Error if any recording was not found or could not be deleted
	 */
	deleteByRecordingIds(recordingIds: string[]): Promise<void> {
		return this.deleteMany({ recordingId: { $in: recordingIds } });
	}

	/**
	 * Counts the total number of recordings.
	 */
	countTotal(): Promise<number> {
		return this.count();
	}

	/**
	 * Counts the number of recordings with status 'complete'.
	 */
	countCompleteRecordings(): Promise<number> {
		return this.count({ status: 'complete' });
	}
}
