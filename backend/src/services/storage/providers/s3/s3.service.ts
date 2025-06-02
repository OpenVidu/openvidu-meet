import {
	DeleteObjectsCommand,
	DeleteObjectsCommandOutput,
	GetObjectCommand,
	GetObjectCommandOutput,
	HeadObjectCommand,
	HeadObjectCommandOutput,
	ListObjectsV2Command,
	ListObjectsV2CommandOutput,
	PutObjectCommand,
	PutObjectCommandOutput,
	S3Client,
	S3ClientConfig
} from '@aws-sdk/client-s3';
import { inject, injectable } from 'inversify';
import { Readable } from 'stream';
import {
	MEET_AWS_REGION,
	MEET_S3_ACCESS_KEY,
	MEET_S3_BUCKET,
	MEET_S3_SECRET_KEY,
	MEET_S3_SERVICE_ENDPOINT,
	MEET_S3_SUBBUCKET,
	MEET_S3_WITH_PATH_STYLE_ACCESS
} from '../../../../environment.js';
import { errorS3NotAvailable, internalError } from '../../../../models/error.model.js';
import { LoggerService } from '../../../index.js';
import INTERNAL_CONFIG from '../../../../config/internal-config.js';

@injectable()
export class S3Service {
	protected s3: S3Client;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		const config: S3ClientConfig = {
			region: MEET_AWS_REGION,
			credentials: {
				accessKeyId: MEET_S3_ACCESS_KEY,
				secretAccessKey: MEET_S3_SECRET_KEY
			},
			endpoint: MEET_S3_SERVICE_ENDPOINT,
			forcePathStyle: MEET_S3_WITH_PATH_STYLE_ACCESS === 'true'
		};

		this.s3 = new S3Client(config);
		this.logger.debug('S3 Client initialized');
	}

	/**
	 * Checks if a file exists in the specified S3 bucket.
	 */
	async exists(name: string, bucket: string = MEET_S3_BUCKET): Promise<boolean> {
		try {
			await this.getHeaderObject(name, bucket);
			this.logger.verbose(`S3 exists: file ${this.getFullKey(name)} found in bucket ${bucket}`);
			return true;
		} catch (error) {
			this.logger.warn(`S3 exists: file ${this.getFullKey(name)} not found in bucket ${bucket}`);
			return false;
		}
	}

	/**
	 * Saves an object to a S3 bucket.
	 * Uses an internal retry mechanism in case of errors.
	 */
	async saveObject(
		name: string,
		body: Record<string, unknown>,
		bucket: string = MEET_S3_BUCKET
	): Promise<PutObjectCommandOutput> {
		const fullKey = this.getFullKey(name);

		try {
			const command = new PutObjectCommand({
				Bucket: bucket,
				Key: fullKey,
				Body: JSON.stringify(body)
			});
			const result = await this.retryOperation<PutObjectCommandOutput>(() => this.run(command));
			this.logger.verbose(`S3: successfully saved object '${fullKey}' in bucket '${bucket}'`);
			return result;
		} catch (error: unknown) {
			this.logger.error(`S3: error saving object '${fullKey}' in bucket '${bucket}': ${error}`);

			if (error && typeof error === 'object' && 'code' in error && error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			throw internalError('saving object to S3');
		}
	}

	/**
	 * Bulk deletes objects from S3.
	 * @param keys Array of object keys to delete. Estos keys deben incluir el subbucket (se obtiene con getFullKey).
	 * @param bucket S3 bucket name (default: MEET_S3_BUCKET)
	 */
	async deleteObjects(keys: string[], bucket: string = MEET_S3_BUCKET): Promise<DeleteObjectsCommandOutput> {
		try {
			this.logger.verbose(`S3 delete: attempting to delete ${keys.length} objects from bucket ${bucket}`);
			const command = new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: {
					Objects: keys.map((key) => ({ Key: this.getFullKey(key) })),
					Quiet: false
				}
			});
			const result = await this.run(command);
			this.logger.verbose(`Successfully deleted objects: [${keys.join(', ')}]`);
			this.logger.info(`Successfully deleted ${keys.length} objects from bucket ${bucket}`);
			return result;
		} catch (error: any) {
			this.logger.error(`S3 bulk delete: error deleting objects in bucket ${bucket}: ${error}`);
			throw internalError('deleting objects from S3');
		}
	}

	/**
	 * List objects with pagination.
	 *
	 * @param additionalPrefix Additional prefix relative to the subbucket.
	 *                         Por ejemplo, para listar metadata se pasa ".metadata/".
	 * @param searchPattern Optional regex pattern to filter keys.
	 * @param bucket Optional bucket name.
	 * @param maxKeys Maximum number of objects to return.
	 * @param continuationToken Token to retrieve the next page.
	 *
	 * @returns The ListObjectsV2CommandOutput with Keys and NextContinuationToken.
	 */
	async listObjectsPaginated(
		additionalPrefix = '',
		maxKeys = 50,
		continuationToken?: string,
		bucket: string = MEET_S3_BUCKET
	): Promise<ListObjectsV2CommandOutput> {
		// The complete prefix is constructed by combining the subbucket and the additionalPrefix.
		// Example: if s3Subbucket is "recordings" and additionalPrefix is ".metadata/",
		// it will list objects with keys that start with "recordings/.metadata/".
		const basePrefix = this.getFullKey(additionalPrefix);
		this.logger.verbose(`S3 listObjectsPaginated: listing objects with prefix "${basePrefix}"`);

		const command = new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: basePrefix,
			MaxKeys: maxKeys,
			ContinuationToken: continuationToken && continuationToken !== 'undefined' ? continuationToken : undefined
		});

		try {
			return await this.s3.send(command);
		} catch (error: any) {
			this.logger.error(`S3 listObjectsPaginated: error listing objects with prefix "${basePrefix}": ${error}`);
			throw internalError('listing objects from S3');
		}
	}

	async getObjectAsJson(name: string, bucket: string = MEET_S3_BUCKET): Promise<Object | undefined> {
		try {
			const obj = await this.getObject(name, bucket);
			const str = await obj.Body?.transformToString();
			const parsed = JSON.parse(str as string);
			this.logger.verbose(
				`S3 getObjectAsJson: successfully retrieved and parsed object ${name} from bucket ${bucket}`
			);
			return parsed;
		} catch (error: any) {
			if (error.name === 'NoSuchKey') {
				this.logger.warn(`S3 getObjectAsJson: object '${name}' does not exist in bucket ${bucket}`);
				return undefined;
			}

			if (error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			this.logger.error(`S3 getObjectAsJson: error retrieving object ${name} from bucket ${bucket}: ${error}`);
			throw internalError('getting object as JSON from S3');
		}
	}

	async getObjectAsStream(
		name: string,
		range?: { start: number; end: number },
		bucket: string = MEET_S3_BUCKET
	): Promise<Readable> {
		try {
			const obj = await this.getObject(name, bucket, range);

			if (obj.Body) {
				this.logger.info(
					`S3 getObjectAsStream: successfully retrieved object ${name} stream from bucket ${bucket}`
				);

				return obj.Body as Readable;
			} else {
				throw new Error('Empty body response');
			}
		} catch (error: any) {
			this.logger.error(
				`S3 getObjectAsStream: error retrieving stream for object ${name} from bucket ${bucket}: ${error}`
			);

			if (error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			throw internalError('getting object as stream from S3');
		}
	}

	async getHeaderObject(name: string, bucket: string = MEET_S3_BUCKET): Promise<HeadObjectCommandOutput> {
		try {
			const fullKey = this.getFullKey(name);
			const headParams: HeadObjectCommand = new HeadObjectCommand({
				Bucket: bucket,
				Key: fullKey
			});
			this.logger.verbose(`S3 getHeaderObject: requesting header for object ${fullKey} in bucket ${bucket}`);
			return await this.run(headParams);
		} catch (error) {
			this.logger.error(
				`S3 getHeaderObject: error getting header for object ${this.getFullKey(name)} in bucket ${bucket}: ${error}`
			);

			throw internalError('getting header for object from S3');
		}
	}

	quit() {
		this.s3.destroy();
		this.logger.info('S3 client destroyed');
	}

	/**
	 * Constructs the full key for an S3 object by ensuring it includes the specified sub-bucket prefix.
	 * If the provided name already starts with the prefix, it is returned as-is.
	 * Otherwise, the prefix is prepended to the name.
	 */
	protected getFullKey(name: string): string {
		const prefix = `${MEET_S3_SUBBUCKET}`;

		if (name.startsWith(prefix)) {
			return name;
		}

		return `${prefix}/${name}`;
	}

	protected async getObject(
		name: string,
		bucket: string = MEET_S3_BUCKET,
		range?: { start: number; end: number }
	): Promise<GetObjectCommandOutput> {
		const fullKey = this.getFullKey(name);

		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: fullKey,
			Range: range ? `bytes=${range.start}-${range.end}` : undefined
		});
		this.logger.verbose(`S3 getObject: requesting object ${fullKey} from bucket ${bucket}`);

		return await this.run(command);
	}

	protected async run(command: any) {
		return this.s3.send(command);
	}

	/**
	 * Retries a given asynchronous operation with exponential backoff.
	 */
	protected async retryOperation<T>(operation: () => Promise<T>): Promise<T> {
		let attempt = 0;
		let delayMs = Number(INTERNAL_CONFIG.S3_INITIAL_RETRY_DELAY_MS);
		const maxRetries = Number(INTERNAL_CONFIG.S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR);

		while (true) {
			try {
				this.logger.verbose(`S3 operation: attempt ${attempt + 1}`);
				return await operation();
			} catch (error) {
				attempt++;

				if (attempt >= maxRetries) {
					this.logger.error(`S3 retryOperation: operation failed after ${maxRetries} attempts`);
					throw error;
				}

				this.logger.warn(`S3 retryOperation: attempt ${attempt} failed. Retrying in ${delayMs}ms...`);
				await this.sleep(delayMs);
				// Exponential back off: delay increases by a factor of 2
				delayMs *= 2;
			}
		}
	}

	/**
	 * Internal helper to delay execution.
	 */
	protected sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
