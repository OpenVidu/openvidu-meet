import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { errorRecordingNotFound, errorRecordingRangeNotSatisfiable } from '../../models/error.model.js';
import { LoggerService } from '../logger.service.js';
import { StorageFactory } from './storage.factory.js';
import { StorageKeyBuilder, StorageProvider } from './storage.interface.js';

/**
 * Service responsible for managing binary files (blobs) in object storage.
 * Handles recording media files stored in S3, ABS, or GCS.
 *
 * This service focuses exclusively on blob operations, delegating metadata
 * management to the appropriate repositories.
 */
@injectable()
export class BlobStorageService {
	protected storageProvider: StorageProvider;
	protected keyBuilder: StorageKeyBuilder;

	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(StorageFactory) protected storageFactory: StorageFactory
	) {
		const { provider, keyBuilder } = this.storageFactory.create();
		this.storageProvider = provider;
		this.keyBuilder = keyBuilder;
	}

	/**
	 * Performs a health check on the blob storage system.
	 * Verifies both service connectivity and container/bucket existence.
	 */
	async checkHealth(): Promise<void> {
		try {
			this.logger.verbose('Performing blob storage health check...');
			const healthStatus = await this.storageProvider.checkHealth();

			if (!healthStatus.accessible) {
				this.logger.error('Blob storage service is not accessible. Terminating process...');
				process.exit(1);
			}

			if (!healthStatus.bucketExists && !healthStatus.containerExists) {
				this.logger.error('Blob storage bucket/container does not exist. Terminating process...');
				process.exit(1);
			}

			this.logger.info('Blob storage health check passed successfully');
		} catch (error) {
			this.logger.error('Blob storage health check failed:', error);
			this.logger.error('Terminating process due to storage health check failure...');
			process.exit(1);
		}
	}

	// ==========================================
	// RECORDING MEDIA OPERATIONS
	// ==========================================

	/**
	 * Retrieves recording media file as a stream.
	 * Supports partial content requests via HTTP range headers.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @param range - Optional range specification for partial content
	 * @returns Stream of the recording file with metadata
	 */
	async getRecordingMedia(
		recordingId: string,
		range?: { start: number; end: number }
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		try {
			const storageKey = this.keyBuilder.buildBinaryRecordingKey(recordingId);
			this.logger.debug(`Getting recording media for '${recordingId}' from storage: ${storageKey}`);

			const fileSize = await this.getRecordingFileSize(storageKey, recordingId);
			const adjustedRange = this.validateAndAdjustRange(range, fileSize, recordingId);
			const fileStream = await this.storageProvider.getObjectAsStream(storageKey, adjustedRange);

			return {
				fileSize,
				fileStream,
				start: adjustedRange?.start,
				end: adjustedRange?.end
			};
		} catch (error) {
			this.logger.error(`Error getting recording media for '${recordingId}':`, error);
			throw error;
		}
	}

	/**
	 * Deletes a recording media file from blob storage.
	 *
	 * @param recordingId - The unique identifier of the recording to delete
	 */
	async deleteRecordingMedia(recordingId: string): Promise<void> {
		try {
			const storageKey = this.keyBuilder.buildBinaryRecordingKey(recordingId);
			this.logger.debug(`Deleting recording media for '${recordingId}' from storage: ${storageKey}`);

			await this.storageProvider.deleteObject(storageKey);
			this.logger.verbose(`Recording media deleted for '${recordingId}'`);
		} catch (error) {
			this.logger.error(`Error deleting recording media for '${recordingId}':`, error);
			throw error;
		}
	}

	/**
	 * Deletes multiple recording media files from blob storage in batch.
	 *
	 * @param recordingIds - Array of recording identifiers to delete
	 */
	async deleteRecordingMediaBatch(recordingIds: string[]): Promise<void> {
		if (recordingIds.length === 0) {
			this.logger.debug('No recording media to delete');
			return;
		}

		try {
			const storageKeys = recordingIds.map((recordingId) => this.keyBuilder.buildBinaryRecordingKey(recordingId));

			this.logger.debug(`Deleting ${storageKeys.length} recording media files from storage`);
			await this.storageProvider.deleteObjects(storageKeys);
			this.logger.verbose(`Deleted ${storageKeys.length} recording media files`);
		} catch (error) {
			this.logger.error('Error deleting recording media batch:', error);
			throw error;
		}
	}

	/**
	 * Checks if a recording media file exists in blob storage.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @returns True if the recording media exists, false otherwise
	 */
	async recordingMediaExists(recordingId: string): Promise<boolean> {
		try {
			const storageKey = this.keyBuilder.buildBinaryRecordingKey(recordingId);
			return await this.storageProvider.exists(storageKey);
		} catch (error) {
			this.logger.error(`Error checking if recording media exists for '${recordingId}':`, error);
			return false;
		}
	}

	// ==========================================
	// PRIVATE HELPER METHODS
	// ==========================================

	/**
	 * Gets the file size of a recording media file.
	 *
	 * @param key - The storage key for the recording
	 * @param recordingId - The recording identifier (for error messages)
	 * @returns The file size in bytes
	 */
	protected async getRecordingFileSize(key: string, recordingId: string): Promise<number> {
		const { contentLength: fileSize } = await this.storageProvider.getObjectHeaders(key);

		if (!fileSize) {
			this.logger.error(`Recording media not found for recording ${recordingId}`);
			throw errorRecordingNotFound(recordingId);
		}

		return fileSize;
	}

	/**
	 * Validates and adjusts the requested range against the actual file size.
	 *
	 * @param range - The requested range
	 * @param fileSize - The actual file size
	 * @param recordingId - The recording identifier
	 * @returns The validated and adjusted range, or undefined if no range was requested
	 */
	protected validateAndAdjustRange(
		range: { start: number; end: number } | undefined,
		fileSize: number,
		recordingId: string
	): { start: number; end: number } | undefined {
		if (!range) return undefined;

		const { start, end: originalEnd } = range;

		// Validate input values
		if (isNaN(start) || isNaN(originalEnd) || start < 0) {
			this.logger.warn(`Invalid range values for recording ${recordingId}: start=${start}, end=${originalEnd}`);
			this.logger.warn(`Returning full stream for recording ${recordingId}`);
			return undefined;
		}

		// Check if start is beyond file size
		if (start >= fileSize) {
			this.logger.error(
				`Invalid range: start=${start} exceeds fileSize=${fileSize} for recording ${recordingId}`
			);
			throw errorRecordingRangeNotSatisfiable(recordingId, fileSize);
		}

		// Adjust end to not exceed file bounds
		const adjustedEnd = Math.min(originalEnd, fileSize - 1);

		// Validate final range
		if (start > adjustedEnd) {
			this.logger.warn(
				`Invalid range after adjustment: start=${start}, end=${adjustedEnd} for recording ${recordingId}`
			);
			return undefined;
		}

		this.logger.debug(
			`Valid range for recording ${recordingId}: start=${start}, end=${adjustedEnd}, fileSize=${fileSize}`
		);
		return { start, end: adjustedEnd };
	}
}
