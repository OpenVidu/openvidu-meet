import type {
	DeleteObjectsCommandOutput,
	GetObjectCommandOutput,
	HeadObjectCommandOutput,
	S3ClientConfig,
	ServiceInputTypes,
	ServiceOutputTypes
} from '@aws-sdk/client-s3';
import {
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	S3Client
} from '@aws-sdk/client-s3';
import type { SmithyResolvedConfiguration } from '@smithy/core/client';
import type { Command, HttpHandlerOptions } from '@smithy/types';
import { inject, injectable } from 'inversify';
import type { Readable } from 'stream';
import { MEET_ENV } from '../../../../environment.js';
import {
	buildSSEParams,
	S3SSEConfig,
	SSEParams,
	validateSSEConfig
} from '../../../../helpers/s3-sse.helper.js';
import { errorS3NotAvailable, internalError } from '../../../../models/error.model.js';
import { withKeyPrefix } from '../../../../utils/storage-key.utils.js';
import { LoggerService } from '../../../logger.service.js';

/** Type guard: narrows an unknown error to one exposing a matching `code` property. */
const hasErrorCode = (error: unknown, code: string): boolean =>
	typeof error === 'object' && error !== null && 'code' in error && error.code === code;

/** Type guard: narrows an unknown error to one exposing a matching `name` property. */
const hasErrorName = (error: unknown, name: string): boolean =>
	typeof error === 'object' && error !== null && 'name' in error && error.name === name;

@injectable()
export class S3Service {
	protected s3: S3Client;
	protected sseConfig: S3SSEConfig;

	constructor(@inject(LoggerService) protected logger: LoggerService) {
		// Trim env-var values so stray whitespace from .env / compose files doesn't silently break matching.
		this.sseConfig = {
			type: MEET_ENV.S3_SSE_TYPE.trim(),
			kmsKeyId: MEET_ENV.S3_SSE_KMS_KEY_ID.trim(),
			kmsEncryptionContext: MEET_ENV.S3_SSE_KMS_ENCRYPTION_CONTEXT.trim()
		};
		validateSSEConfig(this.sseConfig);

		const config: S3ClientConfig = {
			region: MEET_ENV.AWS_REGION,
			endpoint: MEET_ENV.S3_SERVICE_ENDPOINT,
			forcePathStyle: MEET_ENV.S3_WITH_PATH_STYLE_ACCESS === 'true'
		};

		// Configure credentials only if both access key and secret key are provided
		// This allow IAM Role usage without hardcoding credentials
		if (MEET_ENV.S3_ACCESS_KEY && MEET_ENV.S3_SECRET_KEY) {
			config.credentials = {
				accessKeyId: MEET_ENV.S3_ACCESS_KEY,
				secretAccessKey: MEET_ENV.S3_SECRET_KEY
			};
		}

		this.s3 = new S3Client(config);
		this.logger.debug('S3 Client initialized');
	}

	protected sseParams(): SSEParams {
		return buildSSEParams(this.sseConfig);
	}

	/**
	 * Bulk deletes objects from S3.
	 * @param keys Array of object keys to delete
	 * @param bucket S3 bucket name (default: S3_BUCKET)
	 */
	async deleteObjects(keys: string[], bucket: string = MEET_ENV.S3_BUCKET): Promise<DeleteObjectsCommandOutput> {
		try {
			this.logger.verbose(
				`Attempting to delete ${keys.length} objects from bucket '${bucket}'`
			);
			const command = new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: {
					Objects: keys.map((key) => ({ Key: this.getFullKey(key) })),
					Quiet: false
				}
			});
			const result = await this.run(command);
			this.logger.verbose(`Successfully deleted ${keys.length} objects from bucket '${bucket}'`);
			return result;
		} catch (error) {
			this.logger.error(`Error deleting objects in bucket '${bucket}'`, error);
			throw internalError('deleting objects from S3');
		}
	}

	async getObjectAsStream(
		name: string,
		range?: { start: number; end: number },
		bucket: string = MEET_ENV.S3_BUCKET
	): Promise<Readable> {
		try {
			const obj = await this.getObject(name, bucket, range);

			if (!obj.Body) {
				throw new Error('Empty body response');
			}

			this.logger.verbose(
				`S3 getObjectAsStream: successfully retrieved object '${name}' as stream from bucket '${bucket}'`
			);
			return obj.Body as Readable;
		} catch (error) {
			this.logger.error(`Error retrieving stream for object '${name}' from bucket '${bucket}'`, error);

			if (hasErrorCode(error, 'ECONNREFUSED')) {
				throw errorS3NotAvailable(error);
			}

			throw internalError('getting object as stream from S3');
		}
	}

	async getObjectHeaders(name: string, bucket: string = MEET_ENV.S3_BUCKET): Promise<HeadObjectCommandOutput> {
		try {
			const fullKey = this.getFullKey(name);
			const headParams: HeadObjectCommand = new HeadObjectCommand({
				Bucket: bucket,
				Key: fullKey
			});
			this.logger.verbose(`Requesting headers for object '${fullKey}' in bucket '${bucket}'`);
			return await this.run(headParams);
		} catch (error) {
			this.logger.error(
				`Error retrieving headers for object '${this.getFullKey(name)}' in bucket '${bucket}'`,
				error
			);

			throw internalError('getting object headers from S3');
		}
	}

	/**
	 * Health check for S3 service and bucket accessibility.
	 * Verifies both service connectivity and bucket existence.
	 */
	async checkHealth(): Promise<{ accessible: boolean; bucketExists: boolean }> {
		try {
			// Check if we can access the S3 service by listing objects with a small limit
			await this.run(
				new ListObjectsV2Command({
					Bucket: MEET_ENV.S3_BUCKET,
					MaxKeys: 1
				})
			);

			// If we reach here, both service and bucket are accessible
			this.logger.verbose(`S3 health check: service accessible and bucket '${MEET_ENV.S3_BUCKET}' exists`);
			return { accessible: true, bucketExists: true };
		} catch (error) {
			this.logger.error('S3 health check failed', error);

			// Check if it's a bucket-specific error
			if (hasErrorName(error, 'NoSuchBucket')) {
				this.logger.error(`S3 bucket '${MEET_ENV.S3_BUCKET}' does not exist`);
				return { accessible: true, bucketExists: false };
			}

			// Service is not accessible
			return { accessible: false, bucketExists: false };
		}
	}

	getKeyPrefix(): string {
		return MEET_ENV.S3_SUBBUCKET;
	}

	protected getFullKey(name: string): string {
		return withKeyPrefix(this.getKeyPrefix(), name);
	}

	protected async getObject(
		name: string,
		bucket: string = MEET_ENV.S3_BUCKET,
		range?: { start: number; end: number }
	): Promise<GetObjectCommandOutput> {
		const fullKey = this.getFullKey(name);

		const command = new GetObjectCommand({
			Bucket: bucket,
			Key: fullKey,
			Range: range ? `bytes=${range.start}-${range.end}` : undefined
		});
		this.logger.verbose(`S3 getObject: requesting object '${fullKey}' from bucket '${bucket}'`);

		return await this.run(command);
	}

	protected async run<InputType extends ServiceInputTypes, OutputType extends ServiceOutputTypes>(
		command: Command<
			ServiceInputTypes,
			InputType,
			ServiceOutputTypes,
			OutputType,
			SmithyResolvedConfiguration<HttpHandlerOptions>
		>
	): Promise<OutputType> {
		return this.s3.send(command);
	}
}
