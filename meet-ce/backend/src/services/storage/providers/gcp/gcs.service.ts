import { Bucket, File, GetFilesOptions, Storage } from '@google-cloud/storage';
import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import { INTERNAL_CONFIG } from '../../../../config/internal-config.js';
import { MEET_S3_BUCKET, MEET_S3_SUBBUCKET } from '../../../../environment.js';
import { errorS3NotAvailable, internalError } from '../../../../models/error.model.js';
import { LoggerService } from '../../../index.js';

@injectable()
export class GCSService {
	protected storage: Storage;
	protected bucket: Bucket;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		this.storage = new Storage();
		this.bucket = this.storage.bucket(MEET_S3_BUCKET); // Use S3_BUCKET as GCS bucket name
		this.logger.debug('GCS Storage Client initialized');
	}

	/**
	 * Checks if a file exists in the specified GCS bucket.
	 */
	async exists(name: string, bucket: string = MEET_S3_BUCKET): Promise<boolean> {
		try {
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));
			const [exists] = await file.exists();

			if (exists) {
				this.logger.verbose(`GCS exists: file '${this.getFullKey(name)}' found in bucket '${bucket}'`);
			} else {
				this.logger.warn(`GCS exists: file '${this.getFullKey(name)}' not found in bucket '${bucket}'`);
			}

			return exists;
		} catch (error) {
			this.logger.warn(
				`GCS exists: error checking file '${this.getFullKey(name)}' in bucket '${bucket}': ${error}`
			);
			return false;
		}
	}

	/**
	 * Saves an object to a GCS bucket.
	 * Uses an internal retry mechanism in case of errors.
	 */
	async saveObject(name: string, body: Record<string, unknown>, bucket: string = MEET_S3_BUCKET): Promise<any> {
		const fullKey = this.getFullKey(name);

		try {
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(fullKey);
			const result = await this.retryOperation(async () => {
				await file.save(JSON.stringify(body), {
					metadata: {
						contentType: 'application/json'
					}
				});
				return { success: true };
			});

			this.logger.verbose(`GCS saveObject: successfully saved object '${fullKey}' in bucket '${bucket}'`);
			return result;
		} catch (error: any) {
			this.logger.error(`GCS saveObject: error saving object '${fullKey}' in bucket '${bucket}': ${error}`);

			if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
				throw errorS3NotAvailable(error); // Reuse S3 error for compatibility
			}

			throw internalError('saving object to GCS Storage');
		}
	}

	/**
	 * Bulk deletes objects from GCS Storage.
	 * @param keys Array of object keys to delete
	 * @param bucket GCS bucket name (default: MEET_S3_BUCKET)
	 */
	async deleteObjects(keys: string[], bucket: string = MEET_S3_BUCKET): Promise<any> {
		try {
			this.logger.verbose(
				`GCS deleteObjects: attempting to delete ${keys.length} objects from bucket '${bucket}'`
			);

			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const deletePromises = keys.map((key) => {
				const file = bucketObj.file(this.getFullKey(key));
				return file.delete();
			});

			await Promise.all(deletePromises);

			this.logger.verbose(`Successfully deleted objects: [${keys.join(', ')}]`);
			this.logger.info(`Successfully deleted ${keys.length} objects from bucket '${bucket}'`);
			return {
				Deleted: keys.map((key) => ({ Key: this.getFullKey(key) })), // S3-like response format
				Errors: []
			};
		} catch (error) {
			this.logger.error(`GCS deleteObjects: error deleting objects in bucket '${bucket}': ${error}`);
			throw internalError('deleting objects from GCS Storage');
		}
	}

	/**
	 * List objects with pagination.
	 *
	 * @param additionalPrefix Additional prefix relative to the subbucket.
	 * @param maxKeys Maximum number of objects to return. Defaults to 50.
	 * @param continuationToken Token to retrieve the next page.
	 * @param bucket Optional bucket name. Defaults to MEET_S3_BUCKET.
	 *
	 * @returns S3-compatible response object.
	 */
	async listObjectsPaginated(
		additionalPrefix = '',
		maxResults = 50,
		continuationToken?: string,
		bucket: string = MEET_S3_BUCKET
	): Promise<{
		items: Array<{ Key?: string; LastModified?: Date; Size?: number; ETag?: string }>;
		continuationToken?: string;
		isTruncated?: boolean;
	}> {
		const basePrefix = this.getFullKey(additionalPrefix);
		this.logger.verbose(`GCS listObjectsPaginated: listing objects with prefix '${basePrefix}'`);

		try {
			maxResults = Number(maxResults);
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);

			const options: GetFilesOptions = {
				prefix: basePrefix,
				maxResults: maxResults,
				autoPaginate: false
			};

			if (continuationToken && continuationToken !== 'undefined') {
				options.pageToken = continuationToken;
			}

			const [files, , response] = await bucketObj.getFiles(options);

			const items = files.map((file: File) => ({
				Key: file.name,
				LastModified: file.metadata.updated ? new Date(file.metadata.updated) : undefined,
				Size: file.metadata.size ? parseInt(file.metadata.size as string) : undefined,
				ETag: file.metadata.etag || undefined
			}));

			let NextContinuationToken = (response as any)?.nextPageToken;
			let isTruncated = NextContinuationToken !== undefined;

			// Check if next page has items, similar to ABS implementation
			if (NextContinuationToken) {
				const nextOptions: GetFilesOptions = {
					prefix: basePrefix,
					maxResults: 1,
					autoPaginate: false,
					pageToken: NextContinuationToken
				};

				const [nextFiles] = await bucketObj.getFiles(nextOptions);

				if (nextFiles.length === 0) {
					NextContinuationToken = undefined;
					isTruncated = false;
				}
			}

			return {
				items: items,
				continuationToken: NextContinuationToken,
				isTruncated: isTruncated
			};
		} catch (error) {
			this.logger.error(`GCS listObjectsPaginated: error listing objects with prefix '${basePrefix}': ${error}`);
			throw internalError('listing objects from GCS Storage');
		}
	}

	async getObjectAsJson(name: string, bucket: string = MEET_S3_BUCKET): Promise<object | undefined> {
		try {
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));

			const [exists] = await file.exists();

			if (!exists) {
				this.logger.warn(`GCS getObjectAsJson: object '${name}' does not exist in bucket ${bucket}`);
				return undefined;
			}

			const [content] = await file.download();
			const parsed = JSON.parse(content.toString());

			this.logger.verbose(
				`GCS getObjectAsJson: successfully retrieved and parsed object ${name} from bucket ${bucket}`
			);
			return parsed;
		} catch (error: any) {
			if (error.code === 404) {
				this.logger.warn(`GCS getObjectAsJson: object '${name}' does not exist in bucket ${bucket}`);
				return undefined;
			}

			if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
				throw errorS3NotAvailable(error); // Reuse S3 error for compatibility
			}

			this.logger.error(
				`GCS getObjectAsJson: error retrieving object '${name}' from bucket '${bucket}': ${error}`
			);
			throw internalError('getting object as JSON from GCS Storage');
		}
	}

	async getObjectAsStream(
		name: string,
		range?: { start: number; end: number },
		bucket: string = MEET_S3_BUCKET
	): Promise<Readable> {
		try {
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));

			const options: any = {};

			if (range) {
				options.start = range.start;
				options.end = range.end;
			}

			const stream = file.createReadStream(options);

			this.logger.info(
				`GCS getObjectAsStream: successfully retrieved object '${name}' as stream from bucket '${bucket}'`
			);
			return stream;
		} catch (error: any) {
			this.logger.error(
				`GCS getObjectAsStream: error retrieving stream for object '${name}' from bucket '${bucket}': ${error}`
			);

			if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
				throw errorS3NotAvailable(error); // Reuse S3 error for compatibility
			}

			throw internalError('getting object as stream from GCS Storage');
		}
	}

	async getObjectHeaders(name: string, bucket: string = MEET_S3_BUCKET): Promise<any> {
		try {
			const bucketObj = bucket === MEET_S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));
			const [metadata] = await file.getMetadata();

			this.logger.verbose(
				`GCS getObjectHeaders: retrieved headers for object '${this.getFullKey(name)}' in bucket '${bucket}'`
			);

			// Return S3-compatible response format
			return {
				ContentLength: metadata.size,
				LastModified: metadata.updated ? new Date(metadata.updated) : undefined,
				ContentType: metadata.contentType,
				ETag: metadata.etag,
				Metadata: metadata.metadata || {}
			};
		} catch (error) {
			this.logger.error(
				`GCS getObjectHeaders: error retrieving headers for object '${this.getFullKey(name)}' in bucket '${bucket}': ${error}`
			);

			throw internalError('getting object headers from GCS Storage');
		}
	}

	/**
	 * Health check for GCS Storage service and bucket accessibility.
	 * Verifies both service connectivity and bucket existence.
	 */
	async checkHealth(): Promise<{ accessible: boolean; bucketExists: boolean }> {
		try {
			// Check if we can access the bucket by getting its metadata
			await this.bucket.getMetadata();

			// If we reach here, both service and bucket are accessible
			this.logger.verbose(`GCS health check: service accessible and bucket '${MEET_S3_BUCKET}' exists`);
			return { accessible: true, bucketExists: true };
		} catch (error: any) {
			this.logger.error(`GCS health check failed: ${error.message}`);

			// Check if it's a bucket-specific error
			if (error.code === 404) {
				this.logger.error(`GCS bucket '${MEET_S3_BUCKET}' does not exist`);
				return { accessible: true, bucketExists: false };
			}

			// Service is not accessible
			return { accessible: false, bucketExists: false };
		}
	}

	/**
	 * Constructs the full key for a GCS Storage object by ensuring it includes the specified sub-bucket prefix.
	 * If the provided name already starts with the prefix, it is returned as-is.
	 * Otherwise, the prefix is prepended to the name.
	 */
	protected getFullKey(name: string): string {
		const prefix = `${MEET_S3_SUBBUCKET}`; // Use S3_SUBBUCKET for compatibility

		if (name.startsWith(prefix)) {
			return name;
		}

		return `${prefix}/${name}`;
	}

	/**
	 * Retries a given asynchronous operation with exponential backoff.
	 */
	protected async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
		let attempt = 0;
		let delayMs = Number(INTERNAL_CONFIG.S3_INITIAL_RETRY_DELAY_MS); // Reuse S3 config
		const maxRetries = Number(INTERNAL_CONFIG.S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR);

		while (attempt < maxRetries) {
			try {
				this.logger.verbose(`GCS operation: attempt ${attempt + 1}`);
				return await operation();
			} catch (error) {
				attempt++;

				if (attempt >= maxRetries) {
					this.logger.error(`GCS retryOperation: operation failed after ${maxRetries} attempts`);
					throw error;
				}

				this.logger.warn(`GCS retryOperation: attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
				await this.sleep(delayMs);
				// Exponential back off: delay increases by a factor of 2
				delayMs *= 2;
			}
		}

		throw new Error('GCS retryOperation: exceeded maximum retry attempts without success');
	}

	/**
	 * Internal helper to delay execution.
	 */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
