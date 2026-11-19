import { inject, injectable } from 'inversify';
import type { Readable } from 'stream';
import { LoggerService } from '../../../logger.service.js';
import type { StorageProvider } from '../../storage.interface.js';
import { GCSService } from './gcs.service.js';

/**
 * Basic GCS storage provider that implements only primitive storage operations.
 */
@injectable()
export class GCSStorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(GCSService) protected gcsService: GCSService
	) {}

	getKeyPrefix(): string {
		return this.gcsService.getKeyPrefix();
	}

	/**
	 * Deletes a single object from GCS Storage.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from GCS Storage: ${key}`);
			await this.gcsService.deleteObjects([key]);
		} catch (error) {
			this.logger.debug(`Error deleting object from GCS Storage ${key}`, error);
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
		} catch (error) {
			this.logger.debug('Error deleting objects from GCS Storage', error);
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
			this.logger.debug(`Error fetching object headers from GCS Storage ${key}`, error);
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
			this.logger.debug(`Error fetching object stream from GCS Storage ${key}`, error);
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
			this.logger.debug('GCS storage health check failed', error);
			return {
				accessible: false,
				bucketExists: false
			};
		}
	}
}
