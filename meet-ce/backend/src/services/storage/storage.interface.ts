import type { Readable } from 'stream';

export const STORAGE_TYPES = {
	StorageProvider: Symbol.for('StorageProvider'),
	KeyBuilder: Symbol.for('KeyBuilder')
};

/**
 * Basic storage interface that defines primitive storage operations.
 * This interface follows the Single Responsibility Principle by focusing
 * only on basic CRUD operations for object storage.
 *
 * This allows easy integration of different storage backends (S3, PostgreSQL,
 * FileSystem, etc.) without mixing domain-specific business logic.
 */
export interface StorageProvider {
	/**
	 * The prefix every object of Meet lives under inside the bucket or container, where recordings are
	 * written by the recorder and read, listed and deleted by Meet.
	 */
	getKeyPrefix(): string;

	/**
	 * Deletes a single object from storage.
	 *
	 * @param key - The storage key/path of the object to delete
	 * @returns A promise that resolves when the object is successfully deleted
	 */
	deleteObject(key: string): Promise<void>;

	/**
	 * Deletes multiple objects from storage.
	 *
	 * @param keys - Array of storage keys/paths of the objects to delete
	 * @returns A promise that resolves when all objects are successfully deleted
	 */
	deleteObjects(keys: string[]): Promise<void>;

	/**
	 * Retrieves metadata headers for an object without downloading the content.
	 *
	 * @param key - The storage key/path of the object
	 * @returns A promise that resolves to object metadata
	 */
	getObjectHeaders(key: string): Promise<{
		contentLength?: number;
		contentType?: string;
	}>;

	/**
	 * Retrieves an object as a readable stream.
	 * Useful for large files or when you need streaming access.
	 *
	 * @param key - The storage key/path of the object
	 * @param range - Optional byte range for partial content retrieval
	 * @returns A promise that resolves to a readable stream of the object content
	 */
	getObjectAsStream(key: string, range?: { start: number; end: number }): Promise<Readable>;

	/**
	 * Performs a health check on the storage provider.
	 * Verifies both service connectivity and container/bucket existence.
	 *
	 * @returns A promise that resolves to an object indicating accessibility and container/bucket existence
	 */
	checkHealth(): Promise<{ accessible: boolean; bucketExists?: boolean; containerExists?: boolean }>;
}

/**
 * Interface for building storage keys used throughout the application.
 * Provides methods to generate standardized keys for different types of data storage operations.
 */
export interface StorageKeyBuilder {
	/**
	 * Builds the key for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 */
	buildBinaryRecordingKey(recordingId: string): string;

	/**
	 * Builds the key a recording's output file is written to, without the extension the recorder adds.
	 *
	 * @param roomId - The room being recorded
	 * @param recordingName - The unique name of the recording file
	 */
	buildRecordingOutputKey(roomId: string, recordingName: string): string;
}
