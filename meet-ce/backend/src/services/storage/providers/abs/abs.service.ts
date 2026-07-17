import type {
	BlobItem,
	BlockBlobClient,
	BlockBlobUploadResponse,
	ContainerClient,
	ContainerListBlobFlatSegmentResponse
} from '@azure/storage-blob';
import { BlobServiceClient } from '@azure/storage-blob';
import { inject, injectable } from 'inversify';
import type { Readable } from 'stream';
import { INTERNAL_CONFIG } from '../../../../config/internal-config.js';
import { MEET_ENV } from '../../../../environment.js';
import { errorAzureNotAvailable, internalError } from '../../../../models/error.model.js';
import { runConcurrently } from '../../../../utils/concurrency.utils.js';
import { LoggerService } from '../../../logger.service.js';

/** Type guard: narrows an unknown error to one exposing a matching `code` property. */
const hasErrorCode = (error: unknown, code: string): boolean =>
	typeof error === 'object' && error !== null && 'code' in error && error.code === code;

@injectable()
export class ABSService {
	private blobServiceClient: BlobServiceClient;
	private containerClient: ContainerClient;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		if (!MEET_ENV.AZURE_ACCOUNT_NAME || !MEET_ENV.AZURE_ACCOUNT_KEY || !MEET_ENV.AZURE_CONTAINER_NAME) {
			throw new Error('Azure Blob Storage configuration is incomplete');
		}

		const AZURE_STORAGE_CONNECTION_STRING = `DefaultEndpointsProtocol=https;AccountName=${MEET_ENV.AZURE_ACCOUNT_NAME};AccountKey=${MEET_ENV.AZURE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`;
		this.blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
		this.containerClient = this.blobServiceClient.getContainerClient(MEET_ENV.AZURE_CONTAINER_NAME);

		this.logger.debug('Azure Client initialized');
	}

	/**
	 * Checks if a file exists in the ABS container.
	 *
	 * @param blobName - The name of the blob to be checked.
	 * @returns A boolean indicating whether the file exists or not.
	 */
	async exists(blobName: string): Promise<boolean> {
		const fullKey = this.getFullKey(blobName);

		try {
			const blobClient = this.containerClient.getBlobClient(fullKey);
			const exists = await blobClient.exists();
			this.logger.verbose(`ABS exists: file '${fullKey}' ${exists ? 'found' : 'not found'}`);
			return exists;
		} catch (error) {
			this.logger.warn(`ABS exists: error checking file '${fullKey}'`, error);
			return false;
		}
	}

	/**
	 * Saves an object to the ABS container.
	 *
	 * @param blobName - The name of the blob to be saved.
	 * @param body - The object to be saved as a blob.
	 * @returns A promise that resolves to the result of the upload operation.
	 */
	async saveObject(blobName: string, body: Record<string, unknown>): Promise<BlockBlobUploadResponse> {
		const fullKey = this.getFullKey(blobName);

		try {
			const blockBlob: BlockBlobClient = this.containerClient.getBlockBlobClient(fullKey);
			const data = JSON.stringify(body);
			const result = await blockBlob.upload(data, Buffer.byteLength(data));
			this.logger.verbose(`ABS saveObject: successfully saved object '${fullKey}'`);
			return result;
		} catch (error) {
			this.logger.error(`Error saving object '${fullKey}'`, error);

			if (hasErrorCode(error, 'ECONNREFUSED')) {
				throw errorAzureNotAvailable(error);
			}

			throw internalError('saving object to ABS');
		}
	}

	/**
	 * Deletes multiple objects from the ABS container.
	 *
	 * @param keys - An array of blob names to be deleted.
	 * @returns A promise that resolves when all blobs are deleted.
	 */
	async deleteObjects(keys: string[]): Promise<void> {
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_DELETE_STORAGE;

		try {
			this.logger.verbose(`Azure deleteObjects: attempting to delete ${keys.length} blobs`);
			await runConcurrently(
				keys,
				async (key) => {
					await this.deleteObject(this.getFullKey(key));
				},
				{ concurrency, failFast: true }
			);
			this.logger.verbose(`Successfully deleted ${keys.length} objects`);
		} catch (error) {
			this.logger.error('Error deleting objects', error);
			throw internalError('deleting objects from ABS');
		}
	}

	/**
	 * Deletes a blob object from the ABS container.
	 *
	 * @param blobName - The name of the object to delete.
	 */
	protected async deleteObject(blobName: string): Promise<void> {
		try {
			const blobClient = this.containerClient.getBlobClient(blobName);
			const exists = await blobClient.exists();

			if (!exists) {
				throw new Error(`Blob '${blobName}' does not exist`);
			}

			await blobClient.delete();
		} catch (error) {
			this.logger.error(`Error deleting blob '${blobName}'`, error);
			throw error;
		}
	}

	/**
	 * Lists objects in the ABS container with a specific prefix.
	 *
	 * @param additionalPrefix - Additional prefix relative to the subcontainer.
	 * @param maxResults - Maximum number of objects to return. Defaults to 50.
	 * @param continuationToken - Token to retrieve the next page of results.
	 * @returns An object containing the list of blobs, continuation token and truncation status.
	 */
	async listObjectsPaginated(
		additionalPrefix = '',
		maxResults = 50,
		continuationToken?: string
	): Promise<{
		items: BlobItem[];
		continuationToken?: string;
		isTruncated?: boolean;
	}> {
		const basePrefix = this.getFullKey(additionalPrefix);
		this.logger.verbose(`ABS listObjectsPaginated: listing objects with prefix '${basePrefix}'`);

		try {
			maxResults = Number(maxResults);
			const iterator = this.containerClient.listBlobsFlat({ prefix: basePrefix }).byPage({
				maxPageSize: maxResults,
				continuationToken:
					continuationToken && continuationToken !== 'undefined' ? continuationToken : undefined
			});

			const segment = await this.getFirstPage(iterator);

			let NextContinuationToken =
				segment?.continuationToken === ''
					? undefined
					: segment?.continuationToken === continuationToken
						? undefined
						: segment?.continuationToken;
			let isTruncated = NextContinuationToken !== undefined;

			// We need to check if the next page has items, if not we set isTruncated to false
			const iterator2 = this.containerClient
				.listBlobsFlat({ prefix: basePrefix })
				.byPage({ maxPageSize: maxResults, continuationToken: NextContinuationToken });

			const segment2 = await this.getFirstPage(iterator2);

			if (segment2?.segment.blobItems.length === 0) {
				NextContinuationToken = undefined;
				isTruncated = false;
			}

			return {
				items: segment?.segment.blobItems ?? [],
				continuationToken: NextContinuationToken,
				isTruncated: isTruncated
			};
		} catch (error) {
			this.logger.error(`Error listing objects with prefix '${basePrefix}'`, error);
			throw internalError('listing objects from ABS');
		}
	}

	/**
	 * Reads the first page from a paged blob-listing iterator, preserving the strongly-typed
	 * segment shape (the raw `IteratorResult.value` is typed as `any`, which we avoid here).
	 *
	 * @returns The first page segment, or `undefined` if the iterator produced no page.
	 */
	protected async getFirstPage(
		iterator: AsyncIterableIterator<ContainerListBlobFlatSegmentResponse>
	): Promise<ContainerListBlobFlatSegmentResponse | undefined> {
		const result = await iterator.next();
		return result.done ? undefined : result.value;
	}

	async getObjectAsJson(blobName: string): Promise<object | undefined> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);
			const exists = await blobClient.exists();

			if (!exists) {
				this.logger.debug(`ABS getObjectAsJson: object '${fullKey}' does not exist`);
				return undefined;
			}

			const downloadResp = await blobClient.download();
			const downloaded = await this.streamToString(downloadResp.readableStreamBody!);
			const parsed = JSON.parse(downloaded) as Record<string, unknown>;
			this.logger.verbose(`ABS getObjectAsJson: successfully retrieved and parsed object '${fullKey}'`);
			return parsed;
		} catch (error) {
			this.logger.error(`Error retrieving object '${blobName}'`, error);

			if (hasErrorCode(error, 'ECONNREFUSED')) {
				throw errorAzureNotAvailable(error);
			}

			throw internalError('getting object as JSON from ABS');
		}
	}

	async getObjectAsStream(blobName: string, range?: { start: number; end: number }): Promise<Readable> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);

			const offset = range ? range.start : 0;
			const count = range ? (range.start === 0 && range.end === 0 ? 1 : range.end - range.start + 1) : undefined;

			const downloadResp = await blobClient.download(offset, count);

			if (!downloadResp.readableStreamBody) {
				throw new Error('No readable stream body found in the download response');
			}

			this.logger.verbose(`ABS getObjectAsStream: successfully retrieved object '${fullKey}' as stream`);
			return downloadResp.readableStreamBody as Readable;
		} catch (error) {
			this.logger.error(`Error retrieving stream for object '${blobName}'`, error);

			if (hasErrorCode(error, 'ECONNREFUSED')) {
				throw errorAzureNotAvailable(error);
			}

			throw internalError('getting object as stream from ABS');
		}
	}

	/**
	 * Gets the properties (headers/metadata) of a blob object.
	 *
	 * @param blobName - The name of the blob.
	 * @returns The properties of the blob.
	 */
	async getObjectHeaders(blobName: string): Promise<{
		ContentType?: string;
		ContentLength?: number;
		LastModified?: Date;
		Etag?: string;
		Metadata?: Record<string, string>;
	}> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);
			this.logger.verbose(`ABS getObjectHeaders: requesting headers for object '${fullKey}'`);
			const properties = await blobClient.getProperties();
			// Return only headers/metadata relevant info
			return {
				ContentType: properties.contentType,
				ContentLength: properties.contentLength,
				LastModified: properties.lastModified,
				Etag: properties.etag,
				Metadata: properties.metadata
			};
		} catch (error) {
			this.logger.error(`Error retrieving headers for object '${blobName}'`, error);
			throw internalError('getting object headers from ABS');
		}
	}

	protected async streamToString(readable: NodeJS.ReadableStream): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			readable.on('data', (data: string | Buffer) => chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
			readable.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			readable.on('error', reject);
		});
	}

	protected getFullKey(name: string): string {
		const prefix = `${MEET_ENV.AZURE_SUBCONTAINER_NAME}`;

		if (name.startsWith(prefix)) {
			return name;
		}

		return `${prefix}/${name}`;
	}

	/**
	 * Health check for Azure Blob Storage service and container accessibility.
	 * Verifies both service connectivity and container existence.
	 */
	async checkHealth(): Promise<{ accessible: boolean; containerExists: boolean }> {
		try {
			// Check if we can access the container by checking if it exists
			const exists = await this.containerClient.exists();

			if (exists) {
				this.logger.verbose(
					`ABS health check: service accessible and container '${MEET_ENV.AZURE_CONTAINER_NAME}' exists`
				);
				return { accessible: true, containerExists: true };
			} else {
				this.logger.error(`ABS container '${MEET_ENV.AZURE_CONTAINER_NAME}' does not exist`);
				return { accessible: true, containerExists: false };
			}
		} catch (error) {
			this.logger.error('ABS health check failed', error);
			return { accessible: false, containerExists: false };
		}
	}
}
