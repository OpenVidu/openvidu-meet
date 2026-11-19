import type { Bucket, CreateReadStreamOptions, FileMetadata } from '@google-cloud/storage';
import { Storage } from '@google-cloud/storage';
import { inject, injectable } from 'inversify';
import type { Readable } from 'stream';
import { INTERNAL_CONFIG } from '../../../../config/internal-config.js';
import { MEET_ENV } from '../../../../environment.js';
import { errorS3NotAvailable, internalError } from '../../../../models/error.model.js';
import { runConcurrently } from '../../../../utils/concurrency.utils.js';
import { withKeyPrefix } from '../../../../utils/storage-key.utils.js';
import { LoggerService } from '../../../logger.service.js';

/**
 * Extracts a `code` property (string or number) from an unknown error value, if present.
 * GCS/Node errors expose an error code that is used to map failures to specific responses.
 */
function getErrorCode(error: unknown): string | number | undefined {
	if (typeof error === 'object' && error !== null && 'code' in error) {
		const code: unknown = (error as Record<string, unknown>).code;

		if (typeof code === 'string' || typeof code === 'number') {
			return code;
		}
	}

	return undefined;
}

@injectable()
export class GCSService {
	protected storage: Storage;
	protected bucket: Bucket;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		this.storage = new Storage();
		this.bucket = this.storage.bucket(MEET_ENV.S3_BUCKET); // Use S3_BUCKET as GCS bucket name
		this.logger.debug('GCS Storage Client initialized');
	}

	/**
	 * Bulk deletes objects from GCS Storage.
	 * @param keys Array of object keys to delete
	 * @param bucket GCS bucket name (default: S3_BUCKET)
	 */
	async deleteObjects(
		keys: string[],
		bucket: string = MEET_ENV.S3_BUCKET
	): Promise<{ Deleted: Array<{ Key: string }>; Errors: unknown[] }> {
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_DELETE_STORAGE;

		try {
			this.logger.verbose(
				`GCS deleteObjects: attempting to delete ${keys.length} objects from bucket '${bucket}'`
			);

			const bucketObj = bucket === MEET_ENV.S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			await runConcurrently(
				keys,
				async (key) => {
					const file = bucketObj.file(this.getFullKey(key));
					await file.delete();
				},
				{ concurrency, failFast: true }
			);

			this.logger.verbose(`Successfully deleted ${keys.length} objects from bucket '${bucket}'`);
			return {
				Deleted: keys.map((key) => ({ Key: this.getFullKey(key) })), // S3-like response format
				Errors: []
			};
		} catch (error) {
			this.logger.error(`Error deleting objects in bucket '${bucket}'`, error);
			throw internalError('deleting objects from GCS Storage');
		}
	}

	getObjectAsStream(
		name: string,
		range?: { start: number; end: number },
		bucket: string = MEET_ENV.S3_BUCKET
	): Promise<Readable> {
		try {
			const bucketObj = bucket === MEET_ENV.S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));

			const options: CreateReadStreamOptions = {};

			if (range) {
				options.start = range.start;
				options.end = range.end;
			}

			const stream = file.createReadStream(options);

			this.logger.verbose(
				`Successfully retrieved object '${name}' as stream from bucket '${bucket}'`
			);
			return Promise.resolve(stream);
		} catch (error) {
			this.logger.error(`Error retrieving stream for object '${name}' from bucket '${bucket}'`, error);

			const code = getErrorCode(error);

			if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
				return Promise.reject(errorS3NotAvailable(error)); // Reuse S3 error for compatibility
			}

			return Promise.reject(internalError('getting object as stream from GCS Storage'));
		}
	}

	async getObjectHeaders(
		name: string,
		bucket: string = MEET_ENV.S3_BUCKET
	): Promise<{
		ContentLength?: number;
		LastModified?: Date;
		ContentType?: string;
		ETag?: string;
		Metadata: NonNullable<FileMetadata['metadata']>;
	}> {
		try {
			const bucketObj = bucket === MEET_ENV.S3_BUCKET ? this.bucket : this.storage.bucket(bucket);
			const file = bucketObj.file(this.getFullKey(name));
			const [metadata] = await file.getMetadata();

			this.logger.verbose(
				`GCS getObjectHeaders: retrieved headers for object '${this.getFullKey(name)}' in bucket '${bucket}'`
			);

			// Return S3-compatible response format
			return {
				ContentLength: metadata.size !== undefined ? Number(metadata.size) : undefined,
				LastModified: metadata.updated ? new Date(metadata.updated) : undefined,
				ContentType: metadata.contentType,
				ETag: metadata.etag,
				Metadata: metadata.metadata || {}
			};
		} catch (error) {
			this.logger.error(
				`Error retrieving headers for object '${this.getFullKey(name)}' in bucket '${bucket}'`,
				error
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
			this.logger.verbose(`GCS health check: service accessible and bucket '${MEET_ENV.S3_BUCKET}' exists`);
			return { accessible: true, bucketExists: true };
		} catch (error) {
			this.logger.error('GCS health check failed', error);

			// Check if it's a bucket-specific error
			if (getErrorCode(error) === 404) {
				this.logger.error(`GCS bucket '${MEET_ENV.S3_BUCKET}' does not exist`);
				return { accessible: true, bucketExists: false };
			}

			// Service is not accessible
			return { accessible: false, bucketExists: false };
		}
	}

	getKeyPrefix(): string {
		// GCS takes its bucket and path from the S3 variables, as documented for MEET_BLOB_STORAGE_MODE=gcs
		return MEET_ENV.S3_SUBBUCKET;
	}

	protected getFullKey(name: string): string {
		return withKeyPrefix(this.getKeyPrefix(), name);
	}
}
