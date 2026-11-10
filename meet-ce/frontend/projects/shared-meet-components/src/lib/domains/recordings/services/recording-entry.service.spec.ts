import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { MeetingContextService } from '../../meeting/services/meeting-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RecordingEntryService } from './recording-entry.service';
import { RecordingService } from './recording.service';

describe('RecordingEntryService', () => {
	let service: RecordingEntryService;
	let recordingService: jasmine.SpyObj<RecordingService>;

	beforeEach(() => {
		recordingService = jasmine.createSpyObj<RecordingService>('RecordingService', ['getRecordingLink']);
		const roomAccessService = jasmine.createSpyObj<RoomAccessService>('RoomAccessService', ['validateAccess']);
		roomAccessService.validateAccess.and.resolveTo({ allowed: true });

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: RecordingService, useValue: recordingService },
				{ provide: RoomAccessService, useValue: roomAccessService },
				{ provide: MeetingContextService, useValue: {} },
				{ provide: LeaveRedirectService, useValue: {} }
			]
		});

		service = TestBed.inject(RecordingEntryService);
	});

	it('keeps that a play-and-download secret downloads', async () => {
		recordingService.getRecordingLink.and.resolveTo({ download: true });

		const outcome = await service.validate({ recordingId: 'room--EG_1--abc', recordingSecret: 'secret' });

		expect(outcome).toEqual({ kind: 'ready' });
		expect(service.linkGrantsDownload()).toBeTrue();
	});

	it('keeps that a play-only secret does not download', async () => {
		recordingService.getRecordingLink.and.resolveTo({ download: false });

		const outcome = await service.validate({ recordingId: 'room--EG_1--abc', recordingSecret: 'secret' });

		expect(outcome).toEqual({ kind: 'ready' });
		expect(service.linkGrantsDownload()).toBeFalse();
	});

	it('asks for a login when the secret is private and the visitor has no session', async () => {
		recordingService.getRecordingLink.and.rejectWith({ status: 401 });

		const outcome = await service.validate({ recordingId: 'room--EG_1--abc', recordingSecret: 'secret' });

		expect(outcome).toEqual({ kind: 'login-required' });
	});

	it('reports an unrecognised secret', async () => {
		recordingService.getRecordingLink.and.rejectWith({ status: 400 });

		const outcome = await service.validate({ recordingId: 'room--EG_1--abc', recordingSecret: 'secret' });

		expect(outcome).toEqual({ kind: 'error', reason: NavigationErrorReason.INVALID_RECORDING_SECRET });
	});

	it('does not ask what a secret grants when the visit brings none', async () => {
		const outcome = await service.validate({ recordingId: 'room--EG_1--abc' });

		expect(outcome).toEqual({ kind: 'ready' });
		expect(recordingService.getRecordingLink).not.toHaveBeenCalled();
	});
});
