import {
	BlobServiceClient,
	ContainerClient,
	BlockBlobClient,
	ContainerListBlobsOptions,
	BlobItem,
	BlockBlobUploadResponse,
	BlobLeaseClient
} from '@azure/storage-blob';
import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import {
	MEET_AZURE_SUBCONATAINER_NAME,
	MEET_AZURE_ACCOUNT_NAME,
	MEET_AZURE_ACCOUNT_KEY,
	MEET_AZURE_CONTAINER_NAME,
} from '../../../../environment.js';
import { errorAzureNotAvailable, internalError } from '../../../../models/error.model.js';
import { LoggerService } from '../../../index.js';

@injectable()
export class AzureBlobService {
	private blobServiceClient: BlobServiceClient;
	private containerClient: ContainerClient;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		if (!MEET_AZURE_ACCOUNT_NAME || !MEET_AZURE_ACCOUNT_KEY || !MEET_AZURE_CONTAINER_NAME) {
			throw new Error('Azure Blob Storage configuration is incomplete');
		}

		const AZURE_STORAGE_CONNECTION_STRING = `DefaultEndpointsProtocol=https;AccountName=${MEET_AZURE_ACCOUNT_NAME};AccountKey=${MEET_AZURE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`;
		this.blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
		this.containerClient = this.blobServiceClient.getContainerClient(MEET_AZURE_CONTAINER_NAME);

		this.logger.debug('Azure Client initialized');
	}

	/**
	 * Checks if a file exists in the recordings container.
	 *
	 * @param blobName - The name of the blob to be checked.
	 * @returns A boolean indicating whether the file exists or not.
	 */
	async exists(blobName: string): Promise<boolean> {
		try {
			const blobClient = this.containerClient.getBlobClient(blobName);
			return await blobClient.exists();
		} catch (err: any) {
			this.logger.error(`Error checking blob existence: ${err}`);
			return false;
		}
	}

	/** Upload JSON as blob */
	async saveObject(blobName: string, body: any): Promise<BlockBlobUploadResponse> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blockBlob: BlockBlobClient = this.containerClient.getBlockBlobClient(fullKey);
			const data = JSON.stringify(body);
			return await blockBlob.upload(data, Buffer.byteLength(data));
		} catch (err: any) {
			this.logger.error(`Error uploading blob: ${err}`);

			if (err.code === 'ECONNREFUSED') {
				throw errorAzureNotAvailable(err);
			}

			throw internalError(err);
		}
	}

	/**
	 * Deletes a blob object from the recordings container.
	 *
	 * @param blobName - The name of the object to delete.
	 * @returns A promise that resolves to the result of the delete operation.
	 * @throws Throws an error if there was an error deleting the object or if the blob doesnt exists.
	 */
	async deleteObject(blobName: string): Promise<void> {
		try {
			const blobClient = this.containerClient.getBlobClient(blobName);
			const exists = await blobClient.exists();

			if (!exists) {
				throw new Error(`Blob '${blobName}' no existe`);
			}

			await blobClient.delete();
		} catch (err: any) {
			this.logger.error(`Error deleting blob: ${err}`);
			throw internalError(err);
		}
	}

	async deleteObjects(keys: string[]): Promise<void> {
		try {
			const deletePromises = keys.map((key) =>
				this.deleteObject(this.getFullKey(key))
			);
			await Promise.all(deletePromises);
			this.logger.info(`Azure: deleted blobs ${keys.join(', ')}`);
		} catch (err) {
			this.logger.error(`Azure deleteObjects: error deleting ${keys}: ${err}`);
			throw internalError('deleting objects from Azure Blob');
		}
	}

	async listObjectsPaginated(
		additionalPrefix = '',
		maxResults: number = 50,
		continuationToken?: string
	): Promise<{
		items: BlobItem[];
		continuationToken?: string;
		isTruncated?: boolean;
	}> {
		try {
			const basePrefix = this.getFullKey(additionalPrefix);
			this.logger.verbose(`Azure listObjectsPaginated: listing objects with prefix "${basePrefix}"`);

			maxResults = Number(maxResults);
			const iterator = this.containerClient
				.listBlobsFlat({ prefix: basePrefix })
				.byPage({ maxPageSize: maxResults, continuationToken: continuationToken && continuationToken !== 'undefined' ? continuationToken : undefined });

			const response = await iterator.next();
			const segment = response.value;

			let NextContinuationToken = segment.continuationToken === '' ? undefined : segment.continuationToken === continuationToken ? undefined : segment.continuationToken;
			let isTruncated = NextContinuationToken !== undefined;

			const iterator2 = this.containerClient
				.listBlobsFlat({ prefix: basePrefix })
				.byPage({ maxPageSize: maxResults, continuationToken: NextContinuationToken });


			const response2 = await iterator2.next();
			const segment2 = response2.value;

			if (segment2.segment.blobItems.length === 0) {
				NextContinuationToken = undefined;
				isTruncated = false;
			}

			return {
				items: segment.segment.blobItems,
				continuationToken: NextContinuationToken,
				isTruncated: isTruncated,
			};
		} catch (err) {
			this.logger.error(`Azure listObjectsPaginated: error: ${err}`);
			throw internalError('listing objects from Azure Blob');
		}
	}

	async getObjectAsJson(blobName: string): Promise<any | undefined> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);
			const exists = await blobClient.exists();

			if (!exists) {
				this.logger.warn(`Blob '${this.getFullKey(blobName)}' no existe`);
				return undefined;
			}

			const downloadResp = await blobClient.download();
			const downloaded = await this.streamToString(downloadResp.readableStreamBody!);
			return JSON.parse(downloaded);
		} catch (err: any) {
			this.logger.error(`Error getting blob JSON: ${err}`);

			if (err.code === 'ECONNREFUSED') {
				throw errorAzureNotAvailable(err);
			}

			throw internalError(err);
		}
	}

	async getObjectAsStream(blobName: string, range?: { start: number; end?: number }): Promise<Readable> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);

			const offset = range ? range.start : 0;
			const count = range && range.end ? range.end - range.start + 1 : undefined;

			const downloadResp = await blobClient.download(offset, count);

			if (!downloadResp.readableStreamBody) {
				throw new Error('El blob no contiene datos');
			}

			return downloadResp.readableStreamBody as Readable;
		} catch (err: any) {
			this.logger.error(`Error streaming blob: ${err}`);

			if (err.code === 'ECONNREFUSED') {
				throw errorAzureNotAvailable(err);
			}

			throw internalError(err);
		}
	}

	/**
	 * Gets the properties (headers/metadata) of a blob object.
	 *
	 * @param blobName - The name of the blob.
	 * @returns The properties of the blob.
	 */
	async getHeaderObject(blobName: string): Promise<Record<string, any>> {
		try {
			const fullKey = this.getFullKey(blobName);
			const blobClient = this.containerClient.getBlobClient(fullKey);
			const properties = await blobClient.getProperties();
			// Return only headers/metadata relevant info
			return {
				ContentType: properties.contentType,
				ContentLength: properties.contentLength,
				LastModified: properties.lastModified,
				Etag: properties.etag,
				Metadata: properties.metadata
			};
		} catch (error: any) {
			this.logger.error(`Error getting header object from Azure Blob in ${this.getFullKey(blobName)}: ${error}`);
			throw internalError(error);
		}
	}

	protected async streamToString(readable: NodeJS.ReadableStream): Promise<string> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			readable.on('data', (data) => chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data)));
			readable.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
			readable.on('error', reject);
		});
	}

	protected getFullKey(name: string): string {
		const prefix = `${MEET_AZURE_SUBCONATAINER_NAME}`;

		if (name.startsWith(prefix)) {
			return name;
		}

		return `${prefix}/${name}`;
	}
}
