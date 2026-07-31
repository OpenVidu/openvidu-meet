import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRecordingInfo } from '@openvidu-meet/typings';
import type { ILogger } from '../../../shared/models/logger.model';
import { EntityListState } from '../../../shared/models/entity-list.model';
import { TranslateService } from '../../../shared/services/i18n/translate.service';
import { DialogPresetsService } from '../../../shared/services/dialog-presets.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { RecordingTableFilter } from '../models/recording-list.model';
import { RecordingActionsService } from './recording-actions.service';
import { RecordingService } from './recording.service';

const recording = (recordingId: string): MeetRecordingInfo => ({ recordingId }) as MeetRecordingInfo;

describe('RecordingActionsService', () => {
	let service: RecordingActionsService;
	let recordingService: jasmine.SpyObj<RecordingService>;
	let notificationService: jasmine.SpyObj<NotificationService>;
	let list: EntityListState<MeetRecordingInfo, RecordingTableFilter>;
	let log: ILogger;
	/** confirmCallback captured from the last confirmation dialog opened. */
	let confirmDialog: () => Promise<void>;

	const listIds = () => list.items().map((r) => r.recordingId);

	beforeEach(() => {
		recordingService = jasmine.createSpyObj<RecordingService>('RecordingService', [
			'playRecording',
			'downloadRecording',
			'openShareRecordingDialog',
			'deleteRecording',
			'bulkDeleteRecordings',
			'downloadRecordingsAsZip'
		]);
		notificationService = jasmine.createSpyObj<NotificationService>('NotificationService', [
			'showSnackbar',
			'showDialog'
		]);
		notificationService.showDialog.and.callFake((options) => {
			confirmDialog = options.confirmCallback as () => Promise<void>;
		});

		const dialogPresetsStub = {
			getDeleteRecordingDialogPreset: () => ({}),
			getBulkDeleteRecordingsDialogPreset: () => ({})
		};
		// Translation returns the key itself, so assertions can match on keys.
		const translateStub = { translate: (key: string) => key };

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: RecordingService, useValue: recordingService },
				{ provide: NotificationService, useValue: notificationService },
				{ provide: DialogPresetsService, useValue: dialogPresetsStub as unknown as DialogPresetsService },
				{ provide: TranslateService, useValue: translateStub as unknown as TranslateService }
			]
		});

		service = TestBed.inject(RecordingActionsService);

		list = new EntityListState<MeetRecordingInfo, RecordingTableFilter>({
			initialFilters: {} as RecordingTableFilter,
			fetchPage: () => Promise.resolve({ items: [], hasMore: false }),
			onLoadError: () => {}
		});
		list.update(() => [recording('r1'), recording('r2'), recording('r3')]);

		log = { e: jasmine.createSpy('log.e') } as unknown as ILogger;
	});

	it('forwards the share action with the context access flag', async () => {
		await service.handle(
			{ action: 'shareLink', recordings: [recording('r1')] },
			{ list, log, hasRecordingAccess: true }
		);

		expect(recordingService.openShareRecordingDialog).toHaveBeenCalledWith('r1', true);
	});

	it('deletes a recording after confirmation, removes it from the list and notifies', async () => {
		recordingService.deleteRecording.and.resolveTo();

		await service.handle({ action: 'delete', recordings: [recording('r2')] }, { list, log });
		await confirmDialog();

		expect(recordingService.deleteRecording).toHaveBeenCalledWith('r2');
		expect(listIds()).toEqual(['r1', 'r3']);
		expect(notificationService.showSnackbar).toHaveBeenCalledWith('RECORDINGS.ERRORS.RECORDING_DELETED');
	});

	it('bulk delete removes the deleted recordings and reports the count', async () => {
		recordingService.bulkDeleteRecordings.and.resolveTo({ deleted: ['r1', 'r2'], failed: [], message: '' });

		await service.handle({ action: 'bulkDelete', recordings: [recording('r1'), recording('r2')] }, { list, log });
		await confirmDialog();

		expect(listIds()).toEqual(['r3']);
		expect(notificationService.showSnackbar).toHaveBeenCalledWith(
			'2 RECORDINGS.ERRORS.RECORDINGS_DELETED_SUFFIX_PLURAL'
		);
	});

	it('bulk delete reports a partial result: removes the deleted half and mentions both halves', async () => {
		recordingService.bulkDeleteRecordings.and.rejectWith({
			error: { deleted: ['r1'], failed: [{ recordingId: 'r2', error: 'in_use' }] }
		});

		await service.handle({ action: 'bulkDelete', recordings: [recording('r1'), recording('r2')] }, { list, log });
		await confirmDialog();

		expect(listIds()).toEqual(['r2', 'r3']);
		const message = notificationService.showSnackbar.calls.mostRecent().args[0];
		expect(message).toContain('1 RECORDINGS.ERRORS.RECORDINGS_DELETED_DOT_SUFFIX_SINGULAR');
		expect(message).toContain('1 RECORDINGS.ERRORS.RECORDINGS_FAILED_SUFFIX_SINGULAR');
	});

	it('bulk delete survives an unstructured failure (the old TypeError-in-catch bug) and shows the generic error', async () => {
		recordingService.bulkDeleteRecordings.and.rejectWith(new Error('network down'));

		await service.handle({ action: 'bulkDelete', recordings: [recording('r1')] }, { list, log });
		await expectAsync(confirmDialog()).toBeResolved();

		expect(listIds()).toEqual(['r1', 'r2', 'r3']);
		expect(notificationService.showSnackbar).toHaveBeenCalledWith('RECORDINGS.ERRORS.DELETE_RECORDINGS_FAILED');
	});
});
