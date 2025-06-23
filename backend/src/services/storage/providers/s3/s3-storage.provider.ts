import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { LoggerService, S3Service } from '../../../index.js';
import { StorageProvider } from '../../storage.interface.js';

/**
 * Basic S3 storage provider that implements only primitive storage operations.
 */
@injectable()
export class S3StorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(S3Service) protected s3Service: S3Service
	) {}

	/**
	 * Retrieves an object from S3 as a JSON object.
	 */
	async getObject<T = Record<string, unknown>>(key: string): Promise<T | null> {
		try {
			this.logger.debug(`Getting object from S3: ${key}`);
			const result = await this.s3Service.getObjectAsJson(key);
			return result as T;
		} catch (error) {
			this.logger.debug(`Object not found in S3: ${key}`);
			return null;
		}
	}

	/**
	 * Stores an object in S3 as JSON.
	 */
	async putObject<T = Record<string, unknown>>(key: string, data: T): Promise<void> {
		try {
			this.logger.debug(`Storing object in S3: ${key}`);
			await this.s3Service.saveObject(key, data as Record<string, unknown>);
			this.logger.verbose(`Successfully stored object in S3: ${key}`);
		} catch (error) {
			this.logger.error(`Error storing object in S3 ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes a single object from S3.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from S3: ${key}`);
			await this.s3Service.deleteObjects([key]);
			this.logger.verbose(`Successfully deleted object from S3: ${key}`);
		} catch (error) {
			this.logger.error(`Error deleting object from S3 ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Deletes multiple objects from S3.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		try {
			this.logger.debug(`Deleting ${keys.length} objects from S3`);
			await this.s3Service.deleteObjects(keys);
			this.logger.verbose(`Successfully deleted ${keys.length} objects from S3`);
		} catch (error) {
			this.logger.error(`Error deleting objects from S3: ${error}`);
			throw error;
		}
	}

	/**
	 * Checks if an object exists in S3.
	 */
	async exists(key: string): Promise<boolean> {
		try {
			this.logger.debug(`Checking if object exists in S3: ${key}`);
			return await this.s3Service.exists(key);
		} catch (error) {
			this.logger.debug(`Error checking object existence in S3 ${key}: ${error}`);
			return false;
		}
	}

	/**
	 * Lists objects in S3 with a given prefix.
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
			this.logger.debug(`Listing objects in S3 with prefix: ${prefix}`);
			return await this.s3Service.listObjectsPaginated(prefix, maxItems, continuationToken);
		} catch (error) {
			this.logger.error(`Error listing objects in S3 with prefix ${prefix}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves metadata headers for an object in S3.
	 */
	async getObjectHeaders(key: string): Promise<{ contentLength?: number; contentType?: string }> {
		try {
			this.logger.debug(`Getting object headers from S3: ${key}`);
			const data = await this.s3Service.getObjectHeaders(key);
			return {
				contentLength: data.ContentLength,
				contentType: data.ContentType
			};
		} catch (error) {
			this.logger.error(`Error fetching object headers from S3 ${key}: ${error}`);
			throw error;
		}
	}

	/**
	 * Retrieves an object from S3 as a readable stream.
	 */
	async getObjectAsStream(key: string, range?: { start: number; end: number }): Promise<Readable> {
		try {
			this.logger.debug(`Getting object stream from S3: ${key}`);
			return await this.s3Service.getObjectAsStream(key, range);
		} catch (error) {
			this.logger.error(`Error fetching object stream from S3 ${key}: ${error}`);
			throw error;
		}
	}
}
