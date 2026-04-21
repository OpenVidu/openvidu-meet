import { PutObjectCommandInput, ServerSideEncryption } from '@aws-sdk/client-s3';

export const SSE_TYPE_S3 = 'SSE-S3';
export const SSE_TYPE_KMS = 'SSE-KMS';

export interface S3SSEConfig {
	type: string;
	kmsKeyId: string;
	kmsEncryptionContext: string;
}

export type SSEParams = Pick<PutObjectCommandInput, 'ServerSideEncryption' | 'SSEKMSKeyId' | 'SSEKMSEncryptionContext'>;

export function isSSEConfigEmpty(sse: S3SSEConfig): boolean {
	return !sse.type && !sse.kmsKeyId && !sse.kmsEncryptionContext;
}

/**
 * Validates an S3 SSE configuration: type must be "SSE-S3" or "SSE-KMS";
 * SSE-KMS requires a key id; kmsEncryptionContext, if set, must be valid
 * JSON object and only valid with SSE-KMS.
 */
export function validateSSEConfig(sse: S3SSEConfig): void {
	if (isSSEConfigEmpty(sse)) {
		return;
	}

	if (!sse.type) {
		throw new Error(
			's3 sse: MEET_S3_SSE_TYPE is required when MEET_S3_SSE_KMS_KEY_ID or MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT is set'
		);
	}

	switch (sse.type) {
		case SSE_TYPE_S3:
			if (sse.kmsKeyId) {
				throw new Error(`s3 sse: MEET_S3_SSE_KMS_KEY_ID must not be set when type is ${SSE_TYPE_S3}`);
			}

			if (sse.kmsEncryptionContext) {
				throw new Error(
					`s3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must not be set when type is ${SSE_TYPE_S3}`
				);
			}

			return;
		case SSE_TYPE_KMS:
			if (!sse.kmsKeyId) {
				throw new Error(`s3 sse: MEET_S3_SSE_KMS_KEY_ID is required when type is ${SSE_TYPE_KMS}`);
			}

			if (sse.kmsEncryptionContext) {
				let parsed: unknown;

				try {
					parsed = JSON.parse(sse.kmsEncryptionContext);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					throw new Error(`s3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be valid JSON: ${msg}`);
				}

				if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
					throw new Error('s3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be a JSON object');
				}
			}

			return;
		default:
			throw new Error(
				`s3 sse: unsupported type "${sse.type}" (expected "${SSE_TYPE_S3}" or "${SSE_TYPE_KMS}")`
			);
	}
}

export function buildSSEParams(sse: S3SSEConfig): SSEParams {
	if (isSSEConfigEmpty(sse)) {
		return {};
	}

	switch (sse.type) {
		case SSE_TYPE_S3:
			return { ServerSideEncryption: ServerSideEncryption.AES256 };

		case SSE_TYPE_KMS: {
			const params: SSEParams = {
				ServerSideEncryption: ServerSideEncryption.aws_kms,
				SSEKMSKeyId: sse.kmsKeyId
			};

			if (sse.kmsEncryptionContext) {
				params.SSEKMSEncryptionContext = Buffer.from(sse.kmsEncryptionContext).toString('base64');
			}

			return params;
		}

		default:
			return {};
	}
}
