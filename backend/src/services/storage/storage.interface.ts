import { Readable } from 'stream';

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
	 * Retrieves an object from storage as a JSON object.
	 *
	 * @param key - The storage key/path of the object
	 * @returns A promise that resolves to the parsed JSON object, or null if not found
	 */
	getObject<T = Record<string, unknown>>(key: string): Promise<T | null>;

	/**
	 * Stores an object in storage as JSON.
	 *
	 * @param key - The storage key/path where the object should be stored
	 * @param data - The object to store (will be serialized to JSON)
	 * @returns A promise that resolves when the object is successfully stored
	 */
	putObject<T = Record<string, unknown>>(key: string, data: T): Promise<void>;

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
	 * Checks if an object exists in storage.
	 *
	 * @param key - The storage key/path to check
	 * @returns A promise that resolves to true if the object exists, false otherwise
	 */
	exists(key: string): Promise<boolean>;

	/**
	 * Lists objects in storage with a given prefix (acts like a folder).
	 *
	 * @param prefix - The prefix to filter objects by
	 * @param maxItems - Maximum number of items to return (optional)
	 * @param continuationToken - Token for pagination (optional)
	 * @returns A promise that resolves to a paginated list of objects
	 */
	listObjects(
		prefix: string,
		maxItems?: number,
		continuationToken?: string
	): Promise<{
		Contents?: Array<{
			Key?: string;
			LastModified?: Date;
			Size?: number;
			ETag?: string;
		}>;
		IsTruncated?: boolean;
		NextContinuationToken?: string;
	}>;

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
	 * Builds the key for global preferences storage.
	 */
	buildGlobalPreferencesKey(): string;

	/**
	 * Builds the key for a specific room.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 */
	buildMeetRoomKey(roomId: string): string;

	/**
	 * Builds the key for all meeting rooms.
	 *
	 * @param roomName - Optional name of the meeting room to filter by
	 */
	buildAllMeetRoomsKey(roomName?: string): string;

	/**
	 * Builds the key for archived room metadata.
	 *
	 * @param roomId - The unique identifier of the meeting room
	 */
	buildArchivedMeetRoomKey(roomId: string): string;

	/**
	 * Builds the key for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 */
	buildBinaryRecordingKey(recordingId: string): string;

	/**
	 * Builds the key for a specific recording metadata.
	 *
	 * @param recordingId - The unique identifier of the recording
	 */
	buildMeetRecordingKey(recordingId: string): string;

	/**
	 * Builds the key for all recordings in a room or globally.
	 *
	 * @param roomId - Optional room identifier to filter recordings by room
	 */
	buildAllMeetRecordingsKey(roomId?: string): string;

	/**
	 * Builds the key for access recording secrets.
	 *
	 * @param recordingId - The unique identifier of the recording
	 */
	buildAccessRecordingSecretsKey(recordingId: string): string;

	/**
	 * Builds the key for a specific user
	 *
	 * @param userId - The unique identifier of the user
	 */
	buildUserKey(userId: string): string;

	/**
	 * Builds Api Key
	 */
	buildApiKeysKey(): string;
}
