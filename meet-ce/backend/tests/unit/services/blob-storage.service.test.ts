import { afterEach, describe, expect, it } from '@jest/globals';
// The service modules form a cycle through the DI container module, so it has to be the one that
// starts the graph (see migration.service.test.ts).
import '../../../src/config/dependency-injector.config.js';
import { MEET_ENV } from '../../../src/environment.js';
import { ABSService } from '../../../src/services/storage/providers/abs/abs.service.js';
import { GCSService } from '../../../src/services/storage/providers/gcp/gcs.service.js';
import { S3Service } from '../../../src/services/storage/providers/s3/s3.service.js';
import { S3KeyBuilder } from '../../../src/services/storage/providers/s3/s3-storage-key.builder.js';
import { BlobStorageService } from '../../../src/services/storage/blob-storage.service.js';
import type { StorageProvider } from '../../../src/services/storage/storage.interface.js';

interface KeyedService {
	getKeyPrefix(): string;
	getFullKey(name: string): string;
}

const noopLogger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {}, verbose: () => {} };
const keyBuilder = new S3KeyBuilder();

const blobStorageOver = (service: KeyedService) =>
	new BlobStorageService(
		...([
			noopLogger,
			{
				create: () => ({
					provider: { getKeyPrefix: () => service.getKeyPrefix() } as StorageProvider,
					keyBuilder
				})
			}
		] as unknown as ConstructorParameters<typeof BlobStorageService>)
	);

describe('BlobStorageService.getRecordingOutputPath', () => {
	const original = { ...MEET_ENV };

	afterEach(() => {
		Object.assign(MEET_ENV, original);
	});

	const providers: [string, () => KeyedService][] = [
		['s3', () => Object.create(S3Service.prototype) as KeyedService],
		['abs', () => Object.create(ABSService.prototype) as KeyedService],
		['gcs', () => Object.create(GCSService.prototype) as KeyedService]
	];

	it.each(providers)('writes where %s reads, even when the S3 and Azure prefixes differ', (_mode, create) => {
		MEET_ENV.S3_SUBBUCKET = 's3-prefix';
		MEET_ENV.AZURE_SUBCONTAINER_NAME = 'azure-prefix';
		const service = create();

		const outputPath = blobStorageOver(service).getRecordingOutputPath('room-1', 'room-1--abc');
		const readKey = service.getFullKey(keyBuilder.buildBinaryRecordingKey('room-1--EG_x--abc'));

		expect(`${outputPath}.mp4`).toBe(readKey);
	});

	it('uses the Azure prefix with abs and the S3 prefix with s3 and gcs', () => {
		MEET_ENV.S3_SUBBUCKET = 's3-prefix';
		MEET_ENV.AZURE_SUBCONTAINER_NAME = 'azure-prefix';

		expect(blobStorageOver(providers[1][1]()).getRecordingOutputPath('r', 'r--1')).toBe(
			'azure-prefix/recordings/r/r--1'
		);
		expect(blobStorageOver(providers[0][1]()).getRecordingOutputPath('r', 'r--1')).toBe(
			's3-prefix/recordings/r/r--1'
		);
		expect(blobStorageOver(providers[2][1]()).getRecordingOutputPath('r', 'r--1')).toBe(
			's3-prefix/recordings/r/r--1'
		);
	});
});
