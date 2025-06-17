import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { LoggerService, AzureBlobService } from '../../../index.js';
import { StorageProvider } from '../../storage.interface.js';

/**
 * Basic Azure storage provider that implements only primitive storage operations.
 */
@injectable()
export class AzureStorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(AzureBlobService) protected azureBlobService: AzureBlobService
	) { }

	/**
	 * Retrieves an object from Azure as a JSON object.
	 */
	async getObject<T = Record<string, unknown>>(key: string): Promise<T | null> {
		try {
			this.logger.debug(`Getting object from Azure: ${key}`);
			const result = await this.azureBlobService.getObjectAsJson(key);
			return result as T;
		} catch (error) {
			this.logger.debug(`Object not found in Azure: ${key}`);
			return null;
		}
	}

	/**
	 * Stores an object in Azure as JSON.
	 */
	async putObject<T = Record<string, unknown>>(key: string, data: T): Promise<void> {
		try {
			this.logger.debug(`Storing object in Azure: ${key}`);
			await this.azureBlobService.saveObject(key, data as Record<string, unknown>);
			this.logger.verbose(`Successfully stored object in Azure: ${key}`);
		} catch (error) {
			this.logger.error(`Error storing object in Azure ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a single object from Azure.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from Azure: ${key}`);
			await this.azureBlobService.deleteObjects([key]);
			this.logger.verbose(`Successfully deleted object from Azure: ${key}`);
		} catch (error) {
			this.logger.error(`Error deleting object from Azure ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple objects from Azure.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		try {
			this.logger.debug(`Deleting ${keys.length} objects from Azure`);
			await this.azureBlobService.deleteObjects(keys);
			this.logger.verbose(`Successfully deleted ${keys.length} objects from Azure`);
		} catch (error) {
			this.logger.error(`Error deleting objects from Azure: ${error}`);
			throw error;
		}
	}

	/**
	 * Checks if an object exists in Azure.
	 */
	async exists(key: string): Promise<boolean> {
		try {
			this.logger.debug(`Checking if object exists in Azure: ${key}`);
			return await this.azureBlobService.exists(key);
		} catch (error) {
			this.logger.debug(`Error checking object existence in Azure ${key}: ${error}`);
			return false;
		}
	}

	/**
	 * Lists objects in Azure with a given prefix.
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
			this.logger.debug(`Listing objects in Azure with prefix: ${prefix}`);
			const blobs = await this.azureBlobService.listObjectsPaginated(prefix, maxItems, continuationToken);
			const contents = blobs.items.map((blob) => ({
				Key: blob.name,
				LastModified: blob.properties.lastModified,
				Size: blob.properties.contentLength,
				ETag: blob.properties.etag
			})) as Object[];
			return {
				Contents: contents,
				IsTruncated: blobs.isTruncated,
				NextContinuationToken: blobs.continuationToken
			};
		} catch (error) {
			this.logger.error(`Error listing objects in Azure with prefix ${prefix}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves metadata headers for an object in Azure.
	 */
	async getObjectHeaders(key: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			this.logger.debug(`Getting object headers from Azure: ${key}`);
			const data = await this.azureBlobService.getHeaderObject(key);
			return {
				contentLength: data.ContentLength,
				contentType: data.ContentType
			};
		} catch (error) {
			this.logger.error(`Error fetching object headers from Azure ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves an object from Azure as a readable stream.
	 */
	async getObjectAsStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
		try {
			this.logger.debug(`Getting object stream from Azure: ${key}`);
			return await this.azureBlobService.getObjectAsStream(key, range);
		} catch (error) {
			this.logger.error(`Error fetching object stream from Azure ${key}: ${error}`);
			throw error;
		}
	}
}
