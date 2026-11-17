import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Readable } from 'stream';
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
			{ getKeyPrefix: () => service.getKeyPrefix() } as StorageProvider,
			keyBuilder
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

	const layouts: [string, string][] = [
		['openvidu-meet', 'openvidu-meet/recordings/room-1/room-1--abc'],
		['rec', 'rec/recordings/room-1/room-1--abc'],
		['recordings', 'recordings/recordings/room-1/room-1--abc'],
		['meet/recordings', 'meet/recordings/recordings/room-1/room-1--abc'],
		['', 'recordings/room-1/room-1--abc']
	];
	const cases = providers.flatMap(([mode, create]) =>
		layouts.map(([prefix, path]) => [mode, prefix, path, create] as const)
	);

	it.each(cases)('writes and reads %s recordings under the prefix %j', (_mode, prefix, path, create) => {
		MEET_ENV.S3_SUBBUCKET = prefix;
		MEET_ENV.AZURE_SUBCONTAINER_NAME = prefix;
		const service = create();

		const outputPath = blobStorageOver(service).getRecordingOutputPath('room-1', 'room-1--abc');
		const readKey = service.getFullKey(keyBuilder.buildBinaryRecordingKey('room-1--EG_x--abc'));

		expect(outputPath).toBe(path);
		expect(readKey).toBe(`${path}.mp4`);
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

describe('BlobStorageService reading and deleting recording media', () => {
	const build = (provider: Partial<StorageProvider>) =>
		new BlobStorageService(
			...([noopLogger, provider, keyBuilder] as unknown as ConstructorParameters<typeof BlobStorageService>)
		);

	const mediaOf = (storedFileSize: number | undefined, openStream = () => Readable.from([])) => {
		const reads: unknown[] = [];
		let sizeRequests = 0;
		const service = build({
			getObjectHeaders: async () => {
				sizeRequests++;
				return { contentLength: storedFileSize };
			},
			getObjectAsStream: async (_key: string, range?: unknown) => {
				reads.push(range);
				return openStream();
			}
		} as Partial<StorageProvider>);
		return { service, reads, sizeRequests: () => sizeRequests };
	};

	it.each([
		['the whole file', undefined, undefined],
		['a range inside the file', { start: 10, end: 19 }, { start: 10, end: 19 }],
		['the first bytes', { start: 0, end: 9 }, { start: 0, end: 9 }],
		['a range past the end, cut at the last byte', { start: 90, end: 500 }, { start: 90, end: 99 }],
		['the last byte', { start: 99, end: 99 }, { start: 99, end: 99 }],
		['a range with a negative start, as the whole file', { start: -1, end: 10 }, undefined],
		['a range that is not a number, as the whole file', { start: NaN, end: 10 }, undefined],
		['a range that ends before it starts, as the whole file', { start: 20, end: 10 }, undefined]
	])('reads %s of a 100-byte recording', async (_case, range, expected) => {
		const { service, reads, sizeRequests } = mediaOf(undefined);

		const media = await service.getRecordingMedia('room-1--EG_1--abc', 100, range);

		expect(reads).toEqual([expected]);
		expect(media).toMatchObject({ fileSize: 100, start: expected?.start, end: expected?.end });
		expect(sizeRequests()).toBe(0);
	});

	it('asks the storage for the size of a recording that does not store it', async () => {
		const { service, reads, sizeRequests } = mediaOf(100);

		const media = await service.getRecordingMedia('room-1--EG_1--abc', undefined, { start: 90, end: 500 });

		expect(sizeRequests()).toBe(1);
		expect(reads).toEqual([{ start: 90, end: 99 }]);
		expect(media).toMatchObject({ fileSize: 100, start: 90, end: 99 });
	});

	it('hands over the stream with its content untouched', async () => {
		const { service } = mediaOf(undefined, () => Readable.from([Buffer.from('first'), Buffer.from('second')]));

		const { fileStream } = await service.getRecordingMedia('room-1--EG_1--abc', 11);

		expect(Buffer.concat(await fileStream.toArray()).toString()).toBe('firstsecond');
	});

	it('fails before handing over a stream whose file turns out to be missing when it is first read', async () => {
		const missing = new Error('No such object');
		const { service } = mediaOf(
			undefined,
			() =>
				new Readable({
					read: function () {
						this.destroy(missing);
					}
				})
		);

		await expect(service.getRecordingMedia('room-1--EG_1--abc', 100)).rejects.toBe(missing);
	});

	it('answers 416 to a range that starts past the end of the recording', async () => {
		const { service, reads } = mediaOf(undefined);

		await expect(
			service.getRecordingMedia('room-1--EG_1--abc', 100, { start: 100, end: 150 })
		).rejects.toMatchObject({
			statusCode: 416
		});
		expect(reads).toEqual([]);
	});

	it('answers 404 for a recording without a stored size whose file is missing or empty', async () => {
		const { service, reads } = mediaOf(undefined);

		await expect(service.getRecordingMedia('room-1--EG_1--abc', undefined)).rejects.toMatchObject({
			statusCode: 404
		});
		await expect(mediaOf(0).service.getRecordingMedia('room-1--EG_1--abc', undefined)).rejects.toMatchObject({
			statusCode: 404
		});
		expect(reads).toEqual([]);
	});

	it('deletes recordings by their storage keys, and asks nothing for an empty batch', async () => {
		const deleted: string[][] = [];
		const service = build({
			deleteObject: async (key: string) => void deleted.push([key]),
			deleteObjects: async (keys: string[]) => void deleted.push(keys)
		} as Partial<StorageProvider>);

		await service.deleteRecordingMedia('room-1--EG_1--abc');
		await service.deleteRecordingMediaBatch(['room-1--EG_1--abc', 'room-2--EG_2--def']);
		await service.deleteRecordingMediaBatch([]);

		expect(deleted).toEqual([
			['recordings/room-1/room-1--abc.mp4'],
			['recordings/room-1/room-1--abc.mp4', 'recordings/room-2/room-2--def.mp4']
		]);
	});

	it('passes on a failure to delete', async () => {
		const service = build({
			deleteObject: async () => Promise.reject(new Error('storage down')),
			deleteObjects: async () => Promise.reject(new Error('storage down'))
		} as Partial<StorageProvider>);

		await expect(service.deleteRecordingMedia('room-1--EG_1--abc')).rejects.toThrow('storage down');
		await expect(service.deleteRecordingMediaBatch(['room-1--EG_1--abc'])).rejects.toThrow('storage down');
	});
});

describe('BlobStorageService.checkHealth', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it.each([
		['the storage cannot be reached', async () => ({ accessible: false, bucketExists: true })],
		['the bucket or container does not exist', async () => ({ accessible: true })],
		['the check itself fails', async () => Promise.reject(new Error('storage down'))]
	])('stops the server when %s', async (_case, checkHealth) => {
		const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		const service = new BlobStorageService(
			...([noopLogger, { checkHealth }, keyBuilder] as unknown as ConstructorParameters<
				typeof BlobStorageService
			>)
		);

		await service.checkHealth();

		expect(exit).toHaveBeenCalledWith(1);
	});

	it.each([
		['bucket', { accessible: true, bucketExists: true }],
		['container', { accessible: true, containerExists: true }]
	])('lets the server start when the storage and its %s are there', async (_case, status) => {
		const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
		const service = new BlobStorageService(
			...([noopLogger, { checkHealth: async () => status }, keyBuilder] as unknown as ConstructorParameters<
				typeof BlobStorageService
			>)
		);

		await service.checkHealth();

		expect(exit).not.toHaveBeenCalled();
	});
});
