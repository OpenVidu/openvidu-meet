import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { ABSService, LoggerService } from '../../../index.js';
import { StorageProvider } from '../../storage.interface.js';

/**
 * Basic Azure Blob Storage provider that implements only primitive storage operations.
 */
@injectable()
export class ABSStorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(ABSService) protected azureBlobService: ABSService
	) {}

	/**
	 * Retrieves an object from ABS as a JSON object.
	 */
	async getObject<T = Record<string, unknown>>(key: string): Promise<T | null> {
		try {
			this.logger.debug(`Getting object from ABS: ${key}`);
			const result = await this.azureBlobService.getObjectAsJson(key);
			return result as T;
		} catch (error) {
			this.logger.debug(`Object not found in ABS: ${key}`);
			return null;
		}
	}

	/**
	 * Stores an object in ABS as JSON.
	 */
	async putObject<T = Record<string, unknown>>(key: string, data: T): Promise<void> {
		try {
			this.logger.debug(`Storing object in ABS: ${key}`);
			await this.azureBlobService.saveObject(key, data as Record<string, unknown>);
			this.logger.verbose(`Successfully stored object in ABS: ${key}`);
		} catch (error) {
			this.logger.error(`Error storing object in ABS ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a single object from ABS.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from ABS: ${key}`);
			await this.azureBlobService.deleteObjects([key]);
			this.logger.verbose(`Successfully deleted object from ABS: ${key}`);
		} catch (error) {
			this.logger.error(`Error deleting object from ABS ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple objects from ABS.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		try {
			this.logger.debug(`Deleting ${keys.length} objects from ABS`);
			await this.azureBlobService.deleteObjects(keys);
			this.logger.verbose(`Successfully deleted ${keys.length} objects from ABS`);
		} catch (error) {
			this.logger.error(`Error deleting objects from ABS: ${error}`);
			throw error;
		}
	}

	/**
	 * Checks if an object exists in ABS.
	 */
	async exists(key: string): Promise<boolean> {
		try {
			this.logger.debug(`Checking if object exists in ABS: ${key}`);
			return await this.azureBlobService.exists(key);
		} catch (error) {
			this.logger.debug(`Error checking object existence in ABS ${key}: ${error}`);
			return false;
		}
	}

	/**
	 * Lists objects in ABS with a given prefix.
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
			this.logger.debug(`Listing objects in ABS with prefix: ${prefix}`);
			const response = await this.azureBlobService.listObjectsPaginated(prefix, maxItems, continuationToken);
			const contents = response.items.map((blob) => ({
				Key: blob.name,
				LastModified: blob.properties.lastModified,
				Size: blob.properties.contentLength,
				ETag: blob.properties.etag
			})) as object[];
			return {
				Contents: contents,
				IsTruncated: response.isTruncated,
				NextContinuationToken: response.continuationToken
			};
		} catch (error) {
			this.logger.error(`Error listing objects in ABS with prefix ${prefix}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves metadata headers for an object in ABS.
	 */
	async getObjectHeaders(key: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			this.logger.debug(`Getting object headers from ABS: ${key}`);
			const data = await this.azureBlobService.getObjectHeaders(key);
			return {
				contentLength: data.ContentLength,
				contentType: data.ContentType
			};
		} catch (error) {
			this.logger.error(`Error fetching object headers from ABS ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves an object from ABS as a readable stream.
	 */
	async getObjectAsStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
		try {
			this.logger.debug(`Getting object stream from ABS: ${key}`);
			return await this.azureBlobService.getObjectAsStream(key, range);
		} catch (error) {
			this.logger.error(`Error fetching object stream from ABS ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Performs a health check on the Azure Blob Storage provider.
	 */
	async checkHealth(): Promise<{ accessible: boolean; bucketExists?: boolean; containerExists?: boolean }> {
		try {
			this.logger.debug('Performing ABS storage health check');
			const healthResult = await this.azureBlobService.checkHealth();
			return {
				accessible: healthResult.accessible,
				containerExists: healthResult.containerExists
			};
		} catch (error) {
			this.logger.error(`ABS storage health check failed: ${error}`);
			return {
				accessible: false,
				containerExists: false
			};
		}
	}
}
