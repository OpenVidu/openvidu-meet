import { inject, injectable } from 'inversify';
import type { Readable } from 'stream';
import { LoggerService } from '../../../logger.service.js';
import type { StorageProvider } from '../../storage.interface.js';
import { ABSService } from './abs.service.js';

/**
 * Basic Azure Blob Storage provider that implements only primitive storage operations.
 */
@injectable()
export class ABSStorageProvider implements StorageProvider {
	constructor(
		@inject(LoggerService) protected logger: LoggerService,
		@inject(ABSService) protected azureBlobService: ABSService
	) {}

	getKeyPrefix(): string {
		return this.azureBlobService.getKeyPrefix();
	}

	/**
	 * Deletes a single object from ABS.
	 */
	async deleteObject(key: string): Promise<void> {
		try {
			this.logger.debug(`Deleting object from ABS: ${key}`);
			await this.azureBlobService.deleteObjects([key]);
		} catch (error) {
			this.logger.debug(`Error deleting object from ABS ${key}`, error);
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
		} catch (error) {
			this.logger.debug('Error deleting objects from ABS', error);
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
			this.logger.debug(`Error fetching object headers from ABS ${key}`, error);
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
			this.logger.debug(`Error fetching object stream from ABS ${key}`, error);
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
			this.logger.debug('ABS storage health check failed', error);
			return {
				accessible: false,
				containerExists: false
			};
		}
	}
}
