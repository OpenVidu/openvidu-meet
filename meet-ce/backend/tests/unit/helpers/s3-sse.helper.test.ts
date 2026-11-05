import { describe, expect, it } from '@jest/globals';
import { ServerSideEncryption } from '@aws-sdk/client-s3';
import type { S3SSEConfig } from '../../../src/helpers/s3-sse.helper.js';
import { buildSSEParams, validateSSEConfig } from '../../../src/helpers/s3-sse.helper.js';

const sse = (overrides: Partial<S3SSEConfig> = {}): S3SSEConfig => ({
	type: '',
	kmsKeyId: '',
	kmsEncryptionContext: '',
	...overrides
});

describe('S3 server-side encryption configuration', () => {
	it.each([
		['no encryption', sse()],
		['SSE-S3', sse({ type: 'SSE-S3' })],
		['SSE-KMS with a key', sse({ type: 'SSE-KMS', kmsKeyId: 'key-1' })],
		[
			'SSE-KMS with a key and a context',
			sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: '{"tenant":"a"}' })
		]
	])('accepts %s', (_case, config) => {
		expect(() => validateSSEConfig(config)).not.toThrow();
	});

	it.each([
		[
			'a key without a type',
			sse({ kmsKeyId: 'key-1' }),
			's3 sse: MEET_S3_SSE_TYPE is required when MEET_S3_SSE_KMS_KEY_ID or MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT is set'
		],
		[
			'a context without a type',
			sse({ kmsEncryptionContext: '{}' }),
			's3 sse: MEET_S3_SSE_TYPE is required when MEET_S3_SSE_KMS_KEY_ID or MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT is set'
		],
		[
			'SSE-S3 with a key',
			sse({ type: 'SSE-S3', kmsKeyId: 'key-1' }),
			's3 sse: MEET_S3_SSE_KMS_KEY_ID must not be set when type is SSE-S3'
		],
		[
			'SSE-S3 with a context',
			sse({ type: 'SSE-S3', kmsEncryptionContext: '{}' }),
			's3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must not be set when type is SSE-S3'
		],
		[
			'SSE-KMS without a key',
			sse({ type: 'SSE-KMS' }),
			's3 sse: MEET_S3_SSE_KMS_KEY_ID is required when type is SSE-KMS'
		],
		[
			'a context that is not JSON',
			sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: '{tenant' }),
			's3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be valid JSON: '
		],
		[
			'a context that is a JSON array',
			sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: '["a"]' }),
			's3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be a JSON object'
		],
		[
			'a context that is JSON null',
			sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: 'null' }),
			's3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be a JSON object'
		],
		[
			'a context that is a JSON string',
			sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: '"a"' }),
			's3 sse: MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT must be a JSON object'
		],
		['an unknown type', sse({ type: 'SSE-C' }), 's3 sse: unsupported type "SSE-C" (expected "SSE-S3" or "SSE-KMS")']
	])('refuses %s', (_case, config, message) => {
		expect(() => validateSSEConfig(config)).toThrow(message);
	});

	it('sends no encryption parameters when none is configured', () => {
		expect(buildSSEParams(sse())).toEqual({});
		expect(buildSSEParams(sse({ type: 'SSE-C' }))).toEqual({});
	});

	it('asks S3 to encrypt with its own keys for SSE-S3', () => {
		expect(buildSSEParams(sse({ type: 'SSE-S3' }))).toEqual({ ServerSideEncryption: ServerSideEncryption.AES256 });
	});

	it('asks S3 to encrypt with the KMS key, and the context in base64 when there is one, for SSE-KMS', () => {
		expect(buildSSEParams(sse({ type: 'SSE-KMS', kmsKeyId: 'key-1' }))).toEqual({
			ServerSideEncryption: ServerSideEncryption.aws_kms,
			SSEKMSKeyId: 'key-1'
		});
		expect(
			buildSSEParams(sse({ type: 'SSE-KMS', kmsKeyId: 'key-1', kmsEncryptionContext: '{"tenant":"a"}' }))
		).toEqual({
			ServerSideEncryption: ServerSideEncryption.aws_kms,
			SSEKMSKeyId: 'key-1',
			SSEKMSEncryptionContext: Buffer.from('{"tenant":"a"}').toString('base64')
		});
	});
});
