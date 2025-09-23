import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { GCSService, LoggerService } from '../../../index.js';
import { StorageProvider } from '../../storage.interface.js';

/**
 * Basic GCS storage provider that implements only primitive storage operations.
 */
@injectable()
export class GCSStorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GCSService) protected gcsService: GCSService
	) {}

	/**
	 * Retrieves an object from GCS Storage as a JSON object.
	 */
	async getObject<T = Record<string, unknown>>(key: string): Promise<T | null> {
		try {
			this.logger.debug(`Getting object from GCS Storage: ${key}`);
			const result = await this.gcsService.getObjectAsJson(key);
			return result as T;
		} catch (error) {
			this.logger.debug(`Object not found in GCS Storage: ${key}`);
			return null;
		}
	}

	/**
	 * Stores an object in GCS Storage as JSON.
	 */
	async putObject<T = Record<string, unknown>>(key: string, data: T): Promise<void> {
		try {
			this.logger.debug(`Storing object in GCS Storage: ${key}`);
			await this.gcsService.saveObject(key, data as Record<string, unknown>);
			this.logger.verbose(`Successfully stored object in GCS Storage: ${key}`);
		} catch (error) {
			this.logger.error(`Error storing object in GCS Storage ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a single object from GCS Storage.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from GCS Storage: ${key}`);
			await this.gcsService.deleteObjects([key]);
			this.logger.verbose(`Successfully deleted object from GCS Storage: ${key}`);
		} catch (error) {
			this.logger.error(`Error deleting object from GCS Storage ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple objects from GCS Storage.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		try {
			this.logger.debug(`Deleting ${keys.length} objects from GCS Storage`);
			await this.gcsService.deleteObjects(keys);
			this.logger.verbose(`Successfully deleted ${keys.length} objects from GCS Storage`);
		} catch (error) {
			this.logger.error(`Error deleting objects from GCS Storage: ${error}`);
			throw error;
		}
	}

	/**
	 * Checks if an object exists in GCS Storage.
	 */
	async exists(key: string): Promise<boolean> {
		try {
			this.logger.debug(`Checking if object exists in GCS Storage: ${key}`);
			return await this.gcsService.exists(key);
		} catch (error) {
			this.logger.debug(`Error checking object existence in GCS Storage ${key}: ${error}`);
			return false;
		}
	}

	/**
	 * Lists objects in GCS Storage with a given prefix.
	 */
	async listObjects(
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
	}> {
		try {
			this.logger.debug(`Listing objects in GCS Storage with prefix: ${prefix}`);
			const result = await this.gcsService.listObjectsPaginated(prefix, maxItems, continuationToken);

			// Transform GCS response to match the expected interface
			return {
				Contents: result.Contents?.map((item) => ({
					Key: item.Key,
					LastModified: item.LastModified,
					Size: item.Size,
					ETag: undefined // GCS doesn't provide ETag in the same way as S3
				})),
				IsTruncated: !!result.NextContinuationToken,
				NextContinuationToken: result.NextContinuationToken
			};
		} catch (error) {
			this.logger.error(`Error listing objects in GCS Storage with prefix ${prefix}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves metadata headers for an object in GCS Storage.
	 */
	async getObjectHeaders(key: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			this.logger.debug(`Getting object headers from GCS Storage: ${key}`);
			const data = await this.gcsService.getObjectHeaders(key);
			return {
				contentLength: data.ContentLength,
				contentType: data.ContentType
			};
		} catch (error) {
			this.logger.error(`Error fetching object headers from GCS Storage ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves an object from GCS Storage as a readable stream.
	 */
	async getObjectAsStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
		try {
			this.logger.debug(`Getting object stream from GCS Storage: ${key}`);
			return await this.gcsService.getObjectAsStream(key, range);
		} catch (error) {
			this.logger.error(`Error fetching object stream from GCS Storage ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Performs a health check on the GCS storage provider.
	 */
	async checkHealth(): Promise<{ accessible: boolean; bucketExists?: boolean; containerExists?: boolean }> {
		try {
			this.logger.debug('Performing GCS storage health check');
			const healthResult = await this.gcsService.checkHealth();
			return {
				accessible: healthResult.accessible,
				bucketExists: healthResult.bucketExists
			};
		} catch (error) {
			this.logger.error(`GCS storage health check failed: ${error}`);
			return {
				accessible: false,
				bucketExists: false
			};
		}
	}
}
