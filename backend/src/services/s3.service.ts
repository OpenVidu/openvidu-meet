import {
	_Object,
	DeleteObjectCommand,
	DeleteObjectCommandOutput,
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

import {
	MEET_S3_ACCESS_KEY,
	MEET_AWS_REGION,
	MEET_S3_BUCKET,
	MEET_S3_SERVICE_ENDPOINT,
	MEET_S3_SECRET_KEY,
	MEET_S3_WITH_PATH_STYLE_ACCESS,
	MEET_S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR,
	MEET_S3_INITIAL_RETRY_DELAY_MS,
	MEET_S3_SUBBUCKET
} from '../environment.js';
import { errorS3NotAvailable, internalError } from '../models/error.model.js';
import { Readable } from 'stream';
import { LoggerService } from './logger.service.js';
import { inject, injectable } from '../config/dependency-injector.config.js';

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

	// copyObject(
	// 	path: string,
	// 	newFileName: string,
	// 	bucket: string = MEET_AWS_S3_BUCKET
	// ): Promise<CopyObjectCommandOutput> {
	// 	const newKey = path.replace(path.substring(path.lastIndexOf('/') + 1), newFileName);

	// 	const command = new CopyObjectCommand({
	// 		Bucket: bucket,
	// 		CopySource: `${MEET_AWS_S3_BUCKET}/${path}`,
	// 		Key: newKey
	// 	});

	// 	return this.run(command);
	// }

	/**
	 * Saves an object to a S3 bucket.
	 * Uses an internal retry mechanism in case of errors.
	 */
	async saveObject(name: string, body: any, bucket: string = MEET_S3_BUCKET): Promise<PutObjectCommandOutput> {
		const fullKey = this.getFullKey(name);

		try {
			const command = new PutObjectCommand({
				Bucket: bucket,
				Key: fullKey,
				Body: JSON.stringify(body)
			});
			const result = await this.retryOperation<PutObjectCommandOutput>(() => this.run(command));
			this.logger.info(`S3 saveObject: successfully saved object ${fullKey} in bucket ${bucket}`);
			return result;
		} catch (error: any) {
			this.logger.error(`S3 saveObject: error putting object ${fullKey} in bucket ${bucket}: ${error}`);

			if (error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			throw internalError(error);
		}
	}

	/**
	 * Deletes an object from an S3 bucket.
	 *
	 * @param name - The name of the object to delete.
	 * @param bucket - The name of the S3 bucket (optional, defaults to the `${MEET_S3_BUCKET}/${MEET_S3_SUBBUCKET}`
	 * @returns A promise that resolves to the result of the delete operation.
	 * @throws Throws an error if there was an error deleting the object.
	 */
	async deleteObject(name: string, bucket: string = MEET_S3_BUCKET): Promise<DeleteObjectCommandOutput> {
		const fullKey = this.getFullKey(name);

		try {
			this.logger.verbose(`S3 deleteObject: attempting to delete object ${fullKey} in bucket ${bucket}`);
			const command = new DeleteObjectCommand({ Bucket: bucket, Key: name });
			const result = await this.run(command);
			this.logger.info(`S3 deleteObject: successfully deleted object ${fullKey} in bucket ${bucket}`);
			return result;
		} catch (error) {
			this.logger.error(`S3 deleteObject: error deleting object ${fullKey} in bucket ${bucket}: ${error}`);
			throw internalError(error);
		}
	}

	/**
	 * Lists all objects in an S3 bucket with optional subbucket and search pattern filtering.
	 *
	 * @param {string} [subbucket=''] - The subbucket within the main bucket to list objects from.
	 * @param {string} [searchPattern=''] - A regex pattern to filter the objects by their keys.
	 * @param {string} [bucket=MEET_S3_BUCKET] - The name of the S3 bucket. Defaults to MEET_S3_BUCKET.
	 * @param {number} [maxObjects=1000] - The maximum number of objects to retrieve in one request. Defaults to 1000.
	 * @returns {Promise<ListObjectsV2CommandOutput>} - A promise that resolves to the output of the ListObjectsV2Command.
	 * @throws {Error} - Throws an error if there is an issue listing the objects.
	 */
	async listObjects(
		additionalPrefix = '',
		searchPattern = '',
		bucket: string = MEET_S3_BUCKET,
		maxObjects = 1000
	): Promise<ListObjectsV2CommandOutput> {
		const basePrefix = `${MEET_S3_SUBBUCKET}/${additionalPrefix}`.replace(/\/+$/, '');
		let allContents: _Object[] = [];
		let continuationToken: string | undefined = undefined;
		let isTruncated = true;
		let fullResponse: ListObjectsV2CommandOutput | undefined = undefined;

		try {
			this.logger.verbose(`S3 listObjects: starting listing objects with prefix "${basePrefix}"`);

			while (isTruncated) {
				const command = new ListObjectsV2Command({
					Bucket: bucket,
					Prefix: basePrefix,
					MaxKeys: maxObjects,
					ContinuationToken: continuationToken
				});

				const response: ListObjectsV2CommandOutput = await this.run(command);

				if (!fullResponse) {
					fullResponse = response;
				}

				// Filter the objects by the search pattern if it is provided
				let objects = response.Contents || [];

				if (searchPattern) {
					const regex = new RegExp(searchPattern);
					objects = objects.filter((object) => object.Key && regex.test(object.Key));
				}

				// Add the objects to the list of all objects
				allContents = allContents.concat(objects);

				// Update the loop control variables
				isTruncated = response.IsTruncated ?? false;
				continuationToken = response.NextContinuationToken;
				this.logger.verbose(`S3 listObjects: fetched ${objects.length} objects; isTruncated=${isTruncated}`);
			}

			if (fullResponse) {
				fullResponse.Contents = allContents;
				fullResponse.IsTruncated = false;
				fullResponse.NextContinuationToken = undefined;
				fullResponse.MaxKeys = allContents.length;
				fullResponse.KeyCount = allContents.length;
			}

			this.logger.info(`S3 listObjects: total objects found under prefix "${basePrefix}": ${allContents.length}`);
			return fullResponse!;
		} catch (error) {
			this.logger.error(`S3 listObjects: error listing objects under prefix "${basePrefix}": ${error}`);

			if ((error as any).code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			throw internalError(error);
		}
	}

	async getObjectAsJson(name: string, bucket: string = MEET_S3_BUCKET): Promise<Object | undefined> {
		const fullKey = this.getFullKey(name);

		try {
			const obj = await this.getObject(fullKey, bucket);
			const str = await obj.Body?.transformToString();
			const parsed = JSON.parse(str as string);
			this.logger.info(
				`S3 getObjectAsJson: successfully retrieved and parsed object ${fullKey} from bucket ${bucket}`
			);
			return parsed;
		} catch (error: any) {
			if (error.name === 'NoSuchKey') {
				this.logger.warn(`S3 getObjectAsJson: object '${fullKey}' does not exist in bucket ${bucket}`);
				return undefined;
			}

			if (error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			this.logger.error(`S3 getObjectAsJson: error retrieving object ${fullKey} from bucket ${bucket}: ${error}`);
			throw internalError(error);
		}
	}

	async getObjectAsStream(
		name: string,
		bucket: string = MEET_S3_BUCKET,
		range?: { start: number; end: number }
	): Promise<Readable> {
		const fullKey = this.getFullKey(name);

		try {
			const obj = await this.getObject(fullKey, bucket, range);

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
				`S3 getObjectAsStream: error retrieving stream for object ${fullKey} from bucket ${bucket}: ${error}`
			);

			if (error.code === 'ECONNREFUSED') {
				throw errorS3NotAvailable(error);
			}

			throw internalError(error);
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

			throw internalError(error);
		}
	}

	quit() {
		this.s3.destroy();
		this.logger.info('S3 client destroyed');
	}

	/**
	 * Prepares a full key path by prefixing the object's name with the subbucket.
	 * All operations are performed under MEET_S3_BUCKET/MEET_S3_SUBBUCKET.
	 */
	protected getFullKey(name: string): string {
		return `${MEET_S3_SUBBUCKET}/${name}`;
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
		let delayMs = Number(MEET_S3_INITIAL_RETRY_DELAY_MS);
		const maxRetries = Number(MEET_S3_MAX_RETRIES_ATTEMPTS_ON_SAVE_ERROR);

		while (true) {
			try {
				this.logger.verbose(`S3 retryOperation: attempt ${attempt + 1}`);
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
