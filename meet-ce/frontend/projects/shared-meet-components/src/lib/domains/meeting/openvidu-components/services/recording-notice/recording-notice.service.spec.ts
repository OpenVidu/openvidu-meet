import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { RecordingService } from '../recording/recording.service';
import { RecordingNoticeService } from './recording-notice.service';

describe('RecordingNoticeService', () => {
	const NOTICE_DURATION_MS = 10_000;

	let service: RecordingNoticeService;
	let recordingStatus: WritableSignal<RecordingStateInfo>;

	/** Drives the service the only way the app does: by moving the recording state. */
	const moveTo = (status: RecordingState) => {
		recordingStatus.set({ status });
		TestBed.tick();
	};

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate();

		recordingStatus = signal<RecordingStateInfo>({ status: RecordingState.STOPPED });

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RecordingNoticeService,
				{ provide: RecordingService, useValue: { recordingStatus } }
			]
		});

		service = TestBed.inject(RecordingNoticeService);
		TestBed.tick();
	});

	afterEach(() => {
		jasmine.clock().uninstall();
	});

	it('announces nothing in a meeting that is not recording', () => {
		expect(service.announcement()).toBeUndefined();
	});

	it('announces the start to everyone, whoever pressed the button', () => {
		moveTo(RecordingState.STARTED);

		expect(service.announcement()).toBe('started');
	});

	it('announces a recording that was already running when this client joined', () => {
		// The state arrives from the SFU rather than from a local click, which is the same
		// transition as far as this service is concerned.
		moveTo(RecordingState.STARTED);

		expect(service.announcement()).toBe('started');
	});

	it('does not announce a start that never made it', () => {
		moveTo(RecordingState.STARTING);
		expect(service.announcement()).toBeUndefined();

		moveTo(RecordingState.FAILED);
		expect(service.announcement()).toBeUndefined();
	});

	it('announces the start once, when starting resolves into recording', () => {
		moveTo(RecordingState.STARTING);
		moveTo(RecordingState.STARTED);

		expect(service.announcement()).toBe('started');
	});

	it('keeps quiet while a recording is stopping, which is still capturing', () => {
		moveTo(RecordingState.STARTED);
		service.dismiss();

		moveTo(RecordingState.STOPPING);

		expect(service.announcement()).toBeUndefined();
	});

	it('announces the stop, which is the half the REC chip cannot carry', () => {
		moveTo(RecordingState.STARTED);
		moveTo(RecordingState.STOPPING);
		moveTo(RecordingState.STOPPED);

		expect(service.announcement()).toBe('stopped');
	});

	it('announces the stop when a running recording fails instead of ending cleanly', () => {
		moveTo(RecordingState.STARTED);
		moveTo(RecordingState.FAILED);

		expect(service.announcement()).toBe('stopped');
	});

	it('takes itself away, so it never sits on top of the meeting', () => {
		moveTo(RecordingState.STARTED);

		jasmine.clock().tick(NOTICE_DURATION_MS - 1);
		expect(service.announcement()).toBe('started');

		jasmine.clock().tick(1);
		expect(service.announcement()).toBeUndefined();
	});

	it('can be dismissed by hand before it takes itself away', () => {
		moveTo(RecordingState.STARTED);

		service.dismiss();

		expect(service.announcement()).toBeUndefined();
	});

	it('replaces a notice still on screen instead of queueing behind it', () => {
		moveTo(RecordingState.STARTED);
		jasmine.clock().tick(NOTICE_DURATION_MS - 500);

		moveTo(RecordingState.STOPPED);
		expect(service.announcement()).toBe('stopped');

		// The first notice's timer must not carry the second one away early.
		jasmine.clock().tick(600);
		expect(service.announcement()).toBe('stopped');

		jasmine.clock().tick(NOTICE_DURATION_MS);
		expect(service.announcement()).toBeUndefined();
	});
});
