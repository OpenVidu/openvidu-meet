import { inject, Service } from '@angular/core';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import type { ILogger } from '../../../shared/models/logger.model';
import { EntityListState } from '../../../shared/models/entity-list.model';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { DialogPresetsService } from '../../../shared/services/dialog-presets.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { parseBulkDeleteError } from '../../../shared/utils/bulk-delete.utils';
import { RecordingTableAction, RecordingTableFilter } from '../models/recording-list.model';
import { RecordingService } from './recording.service';

/**
 * The recording list a {@link RecordingTableAction} operates on, provided by
 * the hosting page: the standalone recordings page, the room recordings page
 * and the room-detail recordings tab all render the same table and share the
 * same action semantics.
 */
export interface RecordingListContext {
	list: EntityListState<MeetRecordingInfo, RecordingTableFilter>;
	log: ILogger;
	/**
	 * Whether the viewer already has recording access when sharing a link
	 * (console pages pass `true`; the room-member view resolves access from the
	 * share dialog itself).
	 */
	hasRecordingAccess?: boolean;
}

/**
 * Handles the {@link RecordingTableAction}s emitted by recording list tables —
 * play/download/share plus the delete flows with their confirmation dialogs —
 * so every page hosting the table behaves identically. Stateless: the target
 * list and logger arrive with each call, following {@link RoomDeletionService}.
 */
@Service()
export class RecordingActionsService {
	private readonly recordingService = inject(RecordingService);
	private readonly notificationService = inject(NotificationService);
	private readonly dialogPresetsService = inject(DialogPresetsService);
	private readonly translateService = inject(TranslateService);

	async handle(action: RecordingTableAction, context: RecordingListContext): Promise<void> {
		switch (action.action) {
			case 'play':
				await this.recordingService.playRecording(action.recordings[0].recordingId);
				break;
			case 'download':
				this.recordingService.downloadRecording(action.recordings[0]);
				break;
			case 'shareLink':
				this.recordingService.openShareRecordingDialog(
					action.recordings[0].recordingId,
					context.hasRecordingAccess
				);
				break;
			case 'delete':
				this.deleteRecording(action.recordings[0], context);
				break;
			case 'bulkDelete':
				this.bulkDeleteRecordings(action.recordings, context);
				break;
			case 'bulkDownload':
				this.recordingService.downloadRecordingsAsZip(action.recordings.map((r) => r.recordingId));
				break;
		}
	}

	private deleteRecording(recording: MeetRecordingInfo, { list, log }: RecordingListContext): void {
		const deleteCallback = async () => {
			try {
				await this.recordingService.deleteRecording(recording.recordingId);

				list.remove((r) => r.recordingId === recording.recordingId);
				this.notificationService.showSnackbar(
					this.translateService.translate('RECORDINGS.ERRORS.RECORDING_DELETED')
				);
				await list.autoLoadIfEmpty();
			} catch (error) {
				log.e('Error deleting recording:', error);
				this.notificationService.showSnackbar(this.translateService.translate('RECORDINGS.ERRORS.DELETE_FAILED'));
			}
		};

		this.notificationService.showDialog({
			...this.dialogPresetsService.getDeleteRecordingDialogPreset(recording.recordingId),
			confirmCallback: deleteCallback
		});
	}

	private bulkDeleteRecordings(recordings: MeetRecordingInfo[], { list, log }: RecordingListContext): void {
		const bulkDeleteCallback = async () => {
			try {
				const recordingIds = recordings.map((r) => r.recordingId);
				const { deleted } = await this.recordingService.bulkDeleteRecordings(recordingIds);

				list.remove((r) => deleted.includes(r.recordingId));
				this.notificationService.showSnackbar(
					`${deleted.length} ${this.translateService.translate(
						deleted.length > 1
							? 'RECORDINGS.ERRORS.RECORDINGS_DELETED_SUFFIX_PLURAL'
							: 'RECORDINGS.ERRORS.RECORDINGS_DELETED_SUFFIX_SINGULAR'
					)}`
				);
				await list.autoLoadIfEmpty();
			} catch (error) {
				log.e('Error deleting recordings:', error);

				const { deleted, failed } = parseBulkDeleteError<{ recordingId: string; error: string }>(error);

				// Nothing structured to report (401, 500, network drop): plain failure.
				if (deleted.length === 0 && failed.length === 0) {
					this.notificationService.showSnackbar(
						this.translateService.translate('RECORDINGS.ERRORS.DELETE_RECORDINGS_FAILED')
					);
					return;
				}

				// Partial result: some recordings were deleted, some not.
				list.remove((r) => deleted.includes(r.recordingId));

				let msg = '';

				if (deleted.length > 0) {
					msg += `${deleted.length} ${this.translateService.translate(
						deleted.length > 1
							? 'RECORDINGS.ERRORS.RECORDINGS_DELETED_DOT_SUFFIX_PLURAL'
							: 'RECORDINGS.ERRORS.RECORDINGS_DELETED_DOT_SUFFIX_SINGULAR'
					)}`;
				}

				if (failed.length > 0) {
					msg += `${failed.length} ${this.translateService.translate(
						failed.length > 1
							? 'RECORDINGS.ERRORS.RECORDINGS_FAILED_SUFFIX_PLURAL'
							: 'RECORDINGS.ERRORS.RECORDINGS_FAILED_SUFFIX_SINGULAR'
					)}`;
				}

				this.notificationService.showSnackbar(msg.trim());
				await list.autoLoadIfEmpty();
			}
		};

		this.notificationService.showDialog({
			...this.dialogPresetsService.getBulkDeleteRecordingsDialogPreset(recordings.length),
			confirmCallback: bulkDeleteCallback
		});
	}
}
