import type {
	MeetRecordingConfig,
	MeetRecordingEncodingOptions,
	MeetRecordingEncodingPreset,
	MeetRecordingField,
	MeetRecordingInfo,
	MeetRecordingLayout,
	MeetRoomMemberPermissions
} from '@openvidu-meet/typings';
import { MeetRecordingStatus } from '@openvidu-meet/typings';
import type { Archiver } from 'archiver';
import { ZipArchive } from 'archiver';
import { inject, injectable } from 'inversify';
import type { ParticipantInfo, Room, RoomCompositeOptions } from 'livekit-server-sdk';
import { EgressStatus, EncodedFileOutput, EncodedFileType } from 'livekit-server-sdk';
import ms from 'ms';
import type { Readable } from 'stream';
import { uid } from 'uid';
import { container } from '../config/dependency-injector.config.js';
import { INTERNAL_CONFIG } from '../config/internal-config.js';
import { MEET_ENV } from '../environment.js';
import { EncodingConverter } from '../helpers/encoding-converter.helper.js';
import { RecordingHelper } from '../helpers/recording.helper.js';
import { MeetLock } from '../helpers/redis.helper.js';
import {
	errorAnonymousAccessDisabled,
	errorInsufficientPermissions,
	errorRecordingAlreadyStarted,
	errorRecordingAlreadyStopped,
	errorRecordingAutoStartDisabled,
	errorRecordingNotFound,
	errorRecordingNotStopped,
	errorRecordingNotStreamable,
	errorRecordingStopInProgress,
	errorRoomHasNoParticipants,
	OpenViduMeetError
} from '../models/error.model.js';
import type { RedisLock } from '../models/redis-lock.model.js';
import { RecordingRepository } from '../repositories/recording.repository.js';
import type {
	MeetRecordingPage,
	ProjectedRecording,
	RecordingQuery,
	RecordingQueryWithFields,
	RecordingQueryWithProjection
} from '../types/recording-projection.types.js';
import { runConcurrently } from '../utils/concurrency.utils.js';
import { getBaseUrl } from '../utils/url.utils.js';
import { FrontendEventService } from './frontend-event.service.js';
import { LiveKitService } from './livekit.service.js';
import { LoggerService } from './logger.service.js';
import { MutexService } from './mutex.service.js';
import { RecordingAutoStartStateService } from './recording-auto-start-state.service.js';
import { RequestSessionService } from './request-session.service.js';
import type { RoomService } from './room.service.js';
import { BlobStorageService } from './storage/blob-storage.service.js';

@injectable()
export class RecordingService {
	constructor(
		@inject(LiveKitService) protected livekitService: LiveKitService,
		@inject(MutexService) protected mutexService: MutexService,
		@inject(RecordingRepository) protected recordingRepository: RecordingRepository,
		@inject(RequestSessionService) protected requestSessionService: RequestSessionService,
		@inject(BlobStorageService) protected blobStorageService: BlobStorageService,
		@inject(FrontendEventService) protected frontendEventService: FrontendEventService,
		@inject(RecordingAutoStartStateService) protected recAutoStartStateService: RecordingAutoStartStateService,
		@inject(LoggerService) protected logger: LoggerService
	) {}

	/**
	 * TODO: Prevent circular imports when refactoring backend code
	 */
	private async getRoomService(): Promise<RoomService> {
		const { RoomService } = await import('./room.service.js');
		return container.get(RoomService);
	}

	/**
	 * Starts a recording in the room. The request completes as soon as LiveKit accepts the egress:
	 * the recording is `starting` until the first track is published and LiveKit reports it active,
	 * which can take as long as the participants take to publish. `autoStartMeetingId` marks the
	 * request as a recording auto-start on behalf of that meeting (the LiveKit room sid): the
	 * deliberate-stop latch is re-checked once the `recording_active` lock is held. A stop writes the
	 * latch before its `egress_ended` releases the lock, so a stop that completed after the caller's
	 * own latch check is always visible here and cannot be overridden.
	 */
	async startRecording(
		roomId: string,
		configOverride?: {
			layout?: MeetRecordingLayout;
			encoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
		},
		autoStartMeetingId?: string
	): Promise<MeetRecordingInfo> {
		const acquiredLock = await this.acquireRoomRecordingActiveLock(roomId);

		if (!acquiredLock) throw errorRecordingAlreadyStarted(roomId);

		try {
			if (autoStartMeetingId && (await this.recAutoStartStateService.isDisabled(roomId, autoStartMeetingId))) {
				throw errorRecordingAutoStartDisabled(roomId);
			}

			const roomRecordingConfig = await this.validateRoomForStartRecording(roomId);
			const options = this.generateCompositeOptionsFromRequest(roomRecordingConfig, configOverride);
			const output = this.generateFileOutputFromRequest(roomId);
			const egressInfo = await this.livekitService.startRoomComposite(roomId, output, options);
			const recordingInfo = await RecordingHelper.toRecordingInfo(egressInfo);

			this.logger.info(`Recording '${recordingInfo.recordingId}' started for room '${roomId}'`);
			return recordingInfo;
		} catch (error) {
			this.logger.debug(`Error starting recording in room '${roomId}'`, error);

			try {
				await this.releaseRecordingLockIfNoEgress(roomId);
			} catch (releaseError) {
				this.logger.warn(`Failed to release recording lock for room '${roomId}'`, releaseError);
			}

			throw error;
		}
	}

	/**
	 * Starts the room's recording when its config declares `autoStart` and the meeting's live state
	 * meets the configured threshold. Triggered by a join or by a promotion to moderator.
	 */
	async startAutoRecordingIfNeeded(
		{ name: roomId, sid: meetingId }: Room,
		candidate: ParticipantInfo
	): Promise<void> {
		try {
			const roomService = await this.getRoomService();
			const room = await roomService.getMeetRoom(roomId, ['config']);
			const { recording, e2ee } = room.config;

			if (!recording.enabled || !recording.autoStart || e2ee.enabled) return;

			// A deliberate stop during this meeting disarms the auto-start until the meeting ends
			const recWasStoppedManually = await this.recAutoStartStateService.isDisabled(roomId, meetingId);

			if (recWasStoppedManually) {
				this.logger.verbose(
					`Skipping recording auto-start in room '${roomId}': disabled by a deliberate stop during this meeting`
				);
				return;
			}

			const autoStartConfig = RecordingHelper.getAutoStartConfig(recording.autoStart);
			const participants = await this.livekitService.listStandardParticipants(roomId);
			const thresholdReached = this.recAutoStartStateService.hasReachedAutoStartThreshold(
				roomId,
				autoStartConfig,
				candidate,
				participants
			);

			if (!thresholdReached) return;

			const recordingInfo = await this.startRecording(roomId, undefined, meetingId);
			this.logger.info(`Recording '${recordingInfo.recordingId}' auto-started in room '${roomId}'`);
		} catch (error) {
			// 404: the room was deleted between the webhook firing and this check running.
			// 409: the recording is already active (started by another join in the meantime),
			// or a deliberate stop disarmed the auto-start while this candidate was evaluated.
			if (error instanceof OpenViduMeetError && [404, 409].includes(error.statusCode)) {
				this.logger.verbose(`Skipping recording auto-start in room '${roomId}': ${error.message}`);
				return;
			}

			this.logger.error(`Error auto-starting recording in room '${roomId}':`, error);
		}
	}

	/**
	 * Reactivates the room's recording auto-start. Called when a meeting ends (`room_finished`), so
	 * the next meeting in the same room auto-starts its recording again. `meetingId` (the finishing
	 * meeting's sid) scopes the reactivation to that meeting's own flag — see
	 * {@link RecordingAutoStartStateService#activateAutoStart}. Never throws: the `room_finished`
	 * handler must not be aborted by flag bookkeeping.
	 */
	async reactivateAutoRecording(roomId: string, meetingId?: string): Promise<void> {
		await this.recAutoStartStateService.activateAutoStart(roomId, meetingId);
	}

	/**
	 * Stops a recording, whether it is already recording or still waiting for its first track. A
	 * stop is a deliberate decision, so it also disables the room's recording auto-start for the rest
	 * of the meeting.
	 *
	 * Serialized per room while it runs, so a second stop is rejected with a 409 instead of racing
	 * this one in LiveKit.
	 */
	async stopRecording(recordingId: string): Promise<MeetRecordingInfo> {
		const { roomId, egressId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		const lockKey = MeetLock.getRecordingStopLock(roomId);

		const recordingInfo = await this.mutexService.withLock(
			lockKey,
			ms(INTERNAL_CONFIG.RECORDING_STOP_LOCK_TTL),
			async () => {
				try {
					const [egress] = await this.livekitService.getEgress(roomId, egressId);

					if (!egress) {
						throw errorRecordingNotFound(egressId);
					}

					const isStoppable = [EgressStatus.EGRESS_ACTIVE, EgressStatus.EGRESS_STARTING].includes(
						egress.status
					);

					if (!isStoppable) {
						throw errorRecordingAlreadyStopped(recordingId);
					}

					// Written BEFORE stopping the egress: the flag is guaranteed to be visible on
					// every replica before the egress_ended webhook releases the recording-active lock.
					await this.recAutoStartStateService.markDisabled(roomId, egress.roomId);

					const egressInfo = await this.livekitService.stopEgress(egressId);

					this.logger.info(`Recording stopped successfully for room '${roomId}'`);
					return await RecordingHelper.toRecordingInfo(egressInfo);
				} catch (error) {
					this.logger.debug(`Error stopping recording '${recordingId}'`, error);
					throw error;
				}
			}
		);

		if (!recordingInfo) throw errorRecordingStopInProgress(recordingId);

		return recordingInfo;
	}

	/**
	 * Synchronizes room-derived access metadata on existing recordings for a room.
	 */
	updateRoomRecordingsAccessScopeMetadata(
		roomId: string,
		updates: { roomOwner?: string; roomUserAccess?: boolean }
	): Promise<void> {
		return this.recordingRepository.updateAccessScopeMetadataByRoomId(roomId, updates);
	}

	/**
	 * Retrieves a list of recordings based on the provided filtering, pagination, and sorting options.
	 *
	 * If the request is made with a room member token, only recordings for the associated room are returned.
	 * If the request is made by an authenticated user, access is determined by the user's role and permissions:
	 * - ADMIN: Can see all recordings
	 * - ROOM_MANAGER: Can see recordings from rooms they own OR where they are members with recordingList permission
	 * - ROOM_MEMBER: Can see recordings from rooms where they are members with recordingList permission
	 *
	 * @param filters - Filtering, pagination and sorting options
	 * @returns A promise that resolves to an object containing:
	 * - `recordings`: An array of `MeetRecordingInfo` objects representing the recordings.
	 * - `isTruncated`: A boolean indicating whether there are more items to retrieve.
	 * - `nextPageToken`: (Optional) A token to retrieve the next page of results, if available.
	 * @throws Will throw an error if there is an issue retrieving the recordings.
	 */
	async getAllRecordings(filters?: RecordingQuery): Promise<MeetRecordingPage<MeetRecordingInfo>>;

	async getAllRecordings<const TFields extends readonly MeetRecordingField[]>(
		filters: RecordingQueryWithProjection<TFields>
	): Promise<MeetRecordingPage<ProjectedRecording<TFields>>>;

	async getAllRecordings(
		filters: RecordingQueryWithFields
	): Promise<MeetRecordingPage<MeetRecordingInfo | Partial<MeetRecordingInfo>>>;

	async getAllRecordings(
		filters: RecordingQueryWithFields = {}
	): Promise<MeetRecordingPage<MeetRecordingInfo | ProjectedRecording<readonly MeetRecordingField[]>>> {
		try {
			const response = await this.recordingRepository.find(filters);
			this.logger.verbose(`Retrieved ${response.recordings.length} recordings`);
			return response;
		} catch (error) {
			this.logger.debug(`Error getting recordings`, error);
			throw error;
		}
	}

	/**
	 * Validates if the authenticated user has permission to access a specific recording.
	 * First checks if the recording exists, then validates user permissions.
	 *
	 * @param recordingId The recording identifier to validate.
	 * @param permission The permission to check.
	 * @returns The recording info if accessible.
	 * @throws Error if recording not found or insufficient permissions.
	 */
	async validateRecordingAccess(
		recordingId: string,
		permission: keyof MeetRoomMemberPermissions
	): Promise<MeetRecordingInfo>;

	async validateRecordingAccess<const TFields extends readonly MeetRecordingField[]>(
		recordingId: string,
		permission: keyof MeetRoomMemberPermissions,
		fields: TFields
	): Promise<ProjectedRecording<TFields>>;

	async validateRecordingAccess(
		recordingId: string,
		permission: keyof MeetRoomMemberPermissions,
		fields?: readonly MeetRecordingField[]
	): Promise<MeetRecordingInfo | Partial<MeetRecordingInfo>> {
		const requestedFields = fields
			? (Array.from(new Set(['roomId', ...fields])) as readonly MeetRecordingField[])
			: undefined;

		// First, check if the recording exists
		const recordingInfo = await this.recordingRepository.findByRecordingId(recordingId, requestedFields);

		if (!recordingInfo) {
			throw errorRecordingNotFound(recordingId);
		}

		// Extract roomId from the recording info
		const { roomId } = recordingInfo;

		if (!roomId) {
			throw errorRecordingNotFound(recordingId);
		}

		// Check room member permissions for the room associated with the recording
		const roomService = await this.getRoomService();
		const permissions = await roomService.getAuthenticatedRoomMemberPermissions(roomId);

		if (!permissions[permission]) {
			this.logger.warn(`Insufficient permissions to access recording '${recordingId}'`);
			throw errorInsufficientPermissions();
		}

		return recordingInfo;
	}

	/**
	 * Deletes multiple recordings in bulk from MongoDB and blob storage.
	 * For each provided recordingId, the metadata and recording file are deleted (only if the status is stopped).
	 *
	 * @param recordingIds Array of recording identifiers.
	 * @returns An object containing:
	 * - `deleted`: An array of successfully deleted recording IDs.
	 * - `failed`: An array of objects containing recording IDs and error messages for those that could not be deleted.
	 */
	async bulkDeleteRecordings(
		recordingIds: string[]
	): Promise<{ deleted: string[]; failed: { recordingId: string; error: string }[] }> {
		type BulkDeleteFailed = { recordingId: string; error: string };
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_DELETE_RECORDINGS;

		const settledResults = await runConcurrently<
			string,
			{ ok: true; recordingId: string } | { ok: false; failed: BulkDeleteFailed }
		>(
			recordingIds,
			async (recordingId) => {
				try {
					// Access validation is handled by HTTP middleware; service keeps business validation (deletable status).
					const { status } = await this.getRecording(recordingId, ['status']);

					// Check if the recording can be deleted (must be stopped)
					if (!RecordingHelper.canBeDeleted(status)) {
						throw errorRecordingNotStopped(recordingId);
					}

					return { ok: true, recordingId };
				} catch (error) {
					// Per-item failures are collected into the `failed` array and returned as an HTTP
					// 400 payload, so they never reach handleError.
					if (error instanceof OpenViduMeetError) {
						this.logger.debug(`Recording '${recordingId}' cannot be deleted: ${error.message}`);
						return { ok: false, failed: { recordingId, error: error.message } };
					}

					this.logger.error(`Unexpected error deleting recording '${recordingId}'`, error);
					return { ok: false, failed: { recordingId, error: 'Unexpected error' } };
				}
			},
			{ concurrency }
		);

		const validRecordingIds = new Set<string>();
		const failedRecordings: BulkDeleteFailed[] = [];

		settledResults.forEach((result) => {
			if (result.status === 'fulfilled') {
				if (result.value.ok) {
					validRecordingIds.add(result.value.recordingId);
				} else {
					failedRecordings.push(result.value.failed);
				}
			}
		});

		const deletedRecordings = Array.from(validRecordingIds);

		if (validRecordingIds.size === 0) {
			this.logger.debug(`No eligible recordings found for deletion`);
			return { deleted: deletedRecordings, failed: failedRecordings };
		}

		const validRecordingIdsArray = Array.from(validRecordingIds);

		// Delete recordings metadata from MongoDB and media files from blob storage
		try {
			await Promise.all([
				this.recordingRepository.deleteByRecordingIds(validRecordingIdsArray),
				this.blobStorageService.deleteRecordingMediaBatch(validRecordingIdsArray)
			]);
			this.logger.info(`Successfully deleted ${validRecordingIds.size} recordings`);
		} catch (error) {
			this.logger.error(`Error performing bulk deletion`, error);
			throw error;
		}

		return {
			deleted: deletedRecordings,
			failed: failedRecordings
		};
	}

	/**
	 * Creates a ZIP archive stream with all recordings
	 *
	 * @param recordingIds Array of recording identifiers requested for ZIP download.
	 * @returns An Archiver instance already populated with recordings.
	 */
	async createRecordingsZipArchive(recordingIds: string[]): Promise<Archiver> {
		const archive = new ZipArchive({ zlib: { level: 0 } });
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_RETRIEVE_RECORDINGS;

		const settledResults = await runConcurrently(
			recordingIds,
			async (recordingId) => {
				this.logger.debug(`Preparing recording '${recordingId}' for ZIP`);

				const [{ filename }, { fileStream }] = await Promise.all([
					this.getRecording(recordingId, ['filename']),
					this.getRecordingAsStream(recordingId)
				]);

				return {
					fileName: filename || `${recordingId}.mp4`,
					fileStream
				};
			},
			{ concurrency, failFast: false }
		);

		for (let index = 0; index < settledResults.length; index++) {
			const result = settledResults[index];
			const recordingId = recordingIds[index];

			if (result.status === 'rejected') {
				this.logger.warn(`Error adding recording '${recordingId}' to ZIP`, result.reason);
				continue;
			}

			archive.append(result.value.fileStream, { name: result.value.fileName });
		}

		return archive;
	}

	/**
	 * Deletes all recordings for a specific room.
	 * If there are active recordings, it will stop them first and then delete all recordings.
	 * This method will retry deletion for any recordings that fail to delete initially.
	 *
	 * @param roomId - The unique identifier of the room whose recordings should be deleted.
	 */
	async deleteAllRoomRecordings(roomId: string): Promise<void> {
		const concurrency = INTERNAL_CONFIG.CONCURRENCY_BULK_DELETE_ROOM_RECORDINGS;

		try {
			this.logger.info(`Starting deletion of all recordings for room '${roomId}'`);

			// Check for active recordings first
			const activeRecordings = await this.livekitService.getInProgressRecordingsEgress(roomId);

			if (activeRecordings.length > 0) {
				this.logger.verbose(
					`Found ${activeRecordings.length} active recording(s) for room '${roomId}', stopping them first`
				);

				await runConcurrently(
					activeRecordings,
					async (egressInfo) => {
						const recordingId = RecordingHelper.extractRecordingIdFromEgress(egressInfo);

						try {
							this.logger.verbose(`Stopping active recording '${recordingId}'`);
							await this.livekitService.stopEgress(egressInfo.egressId);
							// Wait a bit for recording to fully stop
							await new Promise((resolve) => setTimeout(resolve, 1000));

							// Check if the recording has stopped and update status if needed
							const { status } = await this.getRecording(recordingId, ['status']);

							if (status !== MeetRecordingStatus.COMPLETE) {
								this.logger.warn(`Recording '${recordingId}' did not complete successfully`);
								await this.updateRecordingStatus(recordingId, MeetRecordingStatus.ABORTED);
							}

							this.logger.verbose(`Successfully stopped recording '${recordingId}'`);
						} catch (error) {
							this.logger.warn(`Failed to stop recording '${recordingId}'`, error);
							// Continue with deletion anyway
						}
					},
					{ concurrency, failFast: true }
				);
			}

			// Get all recording IDs for the room
			const allRecordingIds = await this.getAllRecordingIdsForRoom(roomId);

			if (allRecordingIds.length === 0) {
				this.logger.verbose(`No recordings found for room '${roomId}'`);
				return;
			}

			this.logger.verbose(
				`Found ${allRecordingIds.length} recordings for room '${roomId}', proceeding with deletion`
			);

			// Delete recordings metadata from MongoDB and media files from blob storage
			await Promise.all([
				this.recordingRepository.deleteByRecordingIds(allRecordingIds),
				this.blobStorageService.deleteRecordingMediaBatch(allRecordingIds)
			]);
			this.logger.info(`Successfully deleted all recordings for room '${roomId}'`);
		} catch (error) {
			this.logger.error(`Error deleting all recordings for room '${roomId}'`, error);
			throw error;
		}
	}

	/**
	 * Helper method to get all recording IDs for a specific room.
	 * Handles pagination to ensure all recordings are retrieved.
	 *
	 * @param roomId - The room ID to get recordings for
	 * @returns Array of all recording IDs for the room
	 */
	protected async getAllRecordingIdsForRoom(roomId: string): Promise<string[]> {
		const recordings = await this.recordingRepository.findAllByRoomId(roomId);
		const recordingIds = recordings.map((recording) => recording.recordingId);
		return recordingIds;
	}

	/**
	 * Retrieves the recording information for a given recording ID.
	 * @param recordingId - The unique identifier of the recording.
	 * @param fields - Array of {@link MeetRecordingField} to include in the response
	 * @returns A promise that resolves to a MeetRecordingInfo object.
	 */
	async getRecording(recordingId: string): Promise<MeetRecordingInfo>;

	async getRecording<const TFields extends readonly MeetRecordingField[]>(
		recordingId: string,
		fields: TFields
	): Promise<ProjectedRecording<TFields>>;

	async getRecording(
		recordingId: string,
		fields?: readonly MeetRecordingField[]
	): Promise<MeetRecordingInfo | Partial<MeetRecordingInfo>>;

	async getRecording(
		recordingId: string,
		fields?: readonly MeetRecordingField[]
	): Promise<MeetRecordingInfo | Partial<MeetRecordingInfo>> {
		const recordingInfo = await this.recordingRepository.findByRecordingId(recordingId, fields);

		if (!recordingInfo) {
			throw errorRecordingNotFound(recordingId);
		}

		return recordingInfo;
	}

	/**
	 * Retrieves the access secrets for a specific recording.
	 *
	 * @param recordingId - The unique identifier of the recording
	 * @returns A promise that resolves to an object containing the public and private access secrets
	 * @throws Will throw an error if the recording is not found
	 */
	async getRecordingAccessSecrets(
		recordingId: string
	): Promise<{ publicAccessSecret: string; privateAccessSecret: string }> {
		const recordingSecrets = await this.recordingRepository.findAccessSecretsByRecordingId(recordingId);

		if (!recordingSecrets) {
			throw errorRecordingNotFound(recordingId);
		}

		return recordingSecrets;
	}

	/**
	 * Generates a recording access URL.
	 *
	 * Public URLs are only generated when anonymous recording access is enabled in the room config.
	 * Private URLs are always allowed and require authenticated access when used.
	 */
	async generateRecordingUrl(recordingId: string, privateAccess: boolean): Promise<string> {
		const { roomId } = RecordingHelper.extractInfoFromRecordingId(recordingId);
		const recordingSecrets = await this.getRecordingAccessSecrets(recordingId);

		if (!privateAccess) {
			const roomService = await this.getRoomService();
			const { access } = await roomService.getMeetRoom(roomId, ['access']);

			if (!access.anonymous.recording.enabled) {
				throw errorAnonymousAccessDisabled(roomId, 'recording');
			}
		}

		const secret = privateAccess ? recordingSecrets.privateAccessSecret : recordingSecrets.publicAccessSecret;
		return `${getBaseUrl()}/recording/${recordingId}?recordingSecret=${secret}`;
	}

	/**
	 * Deletes a recording and its associated metadata from MongoDB and blob storage.
	 *
	 * @param recordingId - The unique identifier of the recording to delete.
	 * @returns The recording information that was deleted.
	 */
	async deleteRecording(recordingId: string): Promise<void> {
		try {
			// Ensure recording exists and fetch only status for deletability validation
			const recordingInfo = await this.getRecording(recordingId, ['status']);

			if (!recordingInfo) {
				throw errorRecordingNotFound(recordingId);
			}

			// Validate the recording status
			if (!RecordingHelper.canBeDeleted(recordingInfo.status)) throw errorRecordingNotStopped(recordingId);

			// Delete recording metadata from MongoDB and media file from blob storage
			await Promise.all([
				this.recordingRepository.deleteByRecordingId(recordingId),
				this.blobStorageService.deleteRecordingMedia(recordingId)
			]);

			this.logger.info(`Successfully deleted recording '${recordingId}'`);
		} catch (error) {
			this.logger.debug(`Error deleting recording '${recordingId}'`, error);
			throw error;
		}
	}

	async getRecordingAsStream(
		recordingId: string,
		rangeHeader?: string
	): Promise<{ fileSize: number | undefined; fileStream: Readable; start?: number; end?: number }> {
		const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

		// Ensure the recording is streamable
		const { status } = await this.getRecording(recordingId, ['status']);

		if (status !== MeetRecordingStatus.COMPLETE) {
			throw errorRecordingNotStreamable(recordingId);
		}

		let validatedRange = undefined;

		// Parse the range header if provided
		if (rangeHeader) {
			const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/)!;
			const endStr = match[2];

			const start = parseInt(match[1], 10);
			const end = endStr ? parseInt(endStr, 10) : start + DEFAULT_CHUNK_SIZE - 1;
			validatedRange = { start, end };
			this.logger.debug(`Streaming partial content for recording '${recordingId}' from ${start} to ${end}.`);
		} else {
			this.logger.debug(`Streaming full content for recording '${recordingId}'.`);
		}

		return this.blobStorageService.getRecordingMedia(recordingId, validatedRange);
	}

	async updateRecordingStatus(recordingId: string, status: MeetRecordingStatus): Promise<void> {
		// Ensure recording exists before updating
		await this.getRecording(recordingId, ['recordingId']);
		await this.recordingRepository.updatePartial(recordingId, { status });
	}

	/**
	 * Helper method to check if a room has recordings
	 *
	 * @param roomId - The ID of the room to check
	 * @returns A promise that resolves to true if the room has recordings, false otherwise
	 */
	async hasRoomRecordings(roomId: string): Promise<boolean> {
		// Intentionally NOT wrapped in try/catch: a failure here must propagate, never be
		// swallowed as "no recordings". This result gates room deletion (withRecordings=FAIL),
		// so treating an infrastructure error as "no recordings" would silently bypass that
		// guard and destroy a room that still has recordings. Letting it throw aborts the
		// deletion; deleteMeetRoom and handleError already log it with context.
		const { recordings } = await this.recordingRepository.find({
			roomId,
			maxItems: 1,
			fields: ['recordingId']
		});
		return recordings.length > 0;
	}

	/**
	 * Validates that a room exists and has participants before starting a recording.
	 *
	 * @param roomId
	 * @returns The MeetRecordingConfig object if validation passes.
	 * @throws Will throw an error if the room does not exist or has no participants.
	 */
	protected async validateRoomForStartRecording(roomId: string): Promise<MeetRecordingConfig> {
		const roomService = await this.getRoomService();
		const { config } = await roomService.getMeetRoom(roomId, ['config']);

		const hasParticipants = await this.livekitService.roomHasParticipants(roomId);

		if (!hasParticipants) throw errorRoomHasNoParticipants(roomId);

		return config.recording;
	}

	/**
	 * Acquires a Redis-based lock to indicate that a recording is active for a specific room.
	 *
	 * This lock will be used to prevent multiple recording start requests from being processed
	 * simultaneously for the same room.
	 *
	 * The active recording lock will be released when the recording ends (handleEgressEnded) or when the room is finished (handleMeetingFinished).
	 *
	 * @param roomId - The name of the room to acquire the lock for.
	 */
	protected async acquireRoomRecordingActiveLock(roomId: string): Promise<RedisLock | null> {
		const lockName = MeetLock.getRecordingActiveLock(roomId);

		try {
			// recording_active is a long-lived lock released by a different request (or replica)
			// than the one that took it, which is exactly the cross-instance case the registry
			// variant is documented to still be for.
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			const lock = await this.mutexService.acquireWithRegistry(
				lockName,
				ms(INTERNAL_CONFIG.RECORDING_ACTIVE_LOCK_TTL)
			);
			return lock;
		} catch (error) {
			this.logger.warn(`Error acquiring lock '${lockName}'`, error);
			return null;
		}
	}

	/**
	 * Releases the active recording lock for a specified room, but only if there are no in-progress
	 * recording egress operations.
	 *
	 * This method first checks for any ongoing recording egress for the room, in any in-progress
	 * state (STARTING, ACTIVE or ENDING) — not just ACTIVE: a duplicate/stale `egress_ended` for a
	 * previous egress arriving while a new one is still STARTING must not release the lock a
	 * concurrent request could then re-acquire, starting a second recording.
	 * If any is found, the lock isn't released as recording is still considered active.
	 * Otherwise, it proceeds to release the mutex lock associated with the room's recording.
	 */
	async releaseRecordingLockIfNoEgress(roomId: string): Promise<void> {
		if (roomId) {
			const lockName = MeetLock.getRecordingActiveLock(roomId);
			const egress = await this.livekitService.getInProgressRecordingsEgress(roomId);

			if (egress.length > 0) {
				this.logger.verbose(
					`In-progress recording egress found for room '${roomId}': ${egress.map((e) => e.egressId).join(', ')}`
				);
				this.logger.debug(`Cannot release recording lock for room '${roomId}'. Recording is still active.`);
				return;
			}

			try {
				// Releases the long-lived recording_active lock acquired by another request or
				// replica, so it must go through the Redis registry rather than a local Lock.
				// eslint-disable-next-line @typescript-eslint/no-deprecated
				await this.mutexService.releaseWithRegistry(lockName);
				this.logger.verbose(`Recording active lock released for room '${roomId}'`);
			} catch (error) {
				this.logger.warn(`Error releasing recording lock for room '${roomId}' on egress ended`, error);
			}
		}
	}

	/**
	 * Generates composite options for recording based on the provided room recording configuration.
	 * If configOverride is provided, its values will take precedence over room configuration.
	 *
	 * @param roomRecordingConfig  The recording configuration defined for the room
	 * @param configOverride  Optional configuration override from the request
	 * @returns The generated RoomCompositeOptions object.
	 */
	protected generateCompositeOptionsFromRequest(
		roomRecordingConfig: MeetRecordingConfig,
		configOverride?: {
			layout?: MeetRecordingLayout;
			encoding?: MeetRecordingEncodingPreset | MeetRecordingEncodingOptions;
		}
	): RoomCompositeOptions {
		const layout = configOverride?.layout ?? roomRecordingConfig.layout;
		const encoding = configOverride?.encoding ?? roomRecordingConfig.encoding;
		const encodingOptions = EncodingConverter.toLivekit(encoding);

		return {
			layout,
			encodingOptions
			// customBaseUrl: customLayout,
			// audioOnly: false,
			// videoOnly: false
		};
	}

	/**
	 * Generates a file output object based on the provided room name and file name.
	 * @param recordingId - The recording id.
	 * @param fileName - The name of the file (default is 'recording').
	 * @returns The generated file output object.
	 */
	protected generateFileOutputFromRequest(roomId: string): EncodedFileOutput {
		// Added unique identifier to the file path for avoiding overwriting
		const recordingName = `${roomId}--${uid(10)}`;

		// Generate the file path with the openviud-meet subbucket and the recording prefix
		const filepath = `${MEET_ENV.S3_SUBBUCKET}/recordings/${roomId}/${recordingName}`;

		return new EncodedFileOutput({
			fileType: EncodedFileType.DEFAULT_FILETYPE,
			filepath,
			disableManifest: true
		});
	}
}
