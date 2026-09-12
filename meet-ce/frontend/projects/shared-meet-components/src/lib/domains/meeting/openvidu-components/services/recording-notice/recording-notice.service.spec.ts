import { Overlay } from '@angular/cdk/overlay';
import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { RecordingState, RecordingStateInfo } from '../../models/recording.model';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { RecordingService } from '../recording/recording.service';
import { RecordingNoticeService } from './recording-notice.service';

describe('RecordingNoticeService', () => {
	const NOTICE_DURATION_MS = 10_000;

	let notificationService: NotificationService;
	let recordingStatus: WritableSignal<RecordingStateInfo>;
	/** A room that has media to record, which is the only one the toolbar lets you record. */
	let hasRoomTracksPublished: boolean;

	/** What the room is being told about the recording, read off the notification on screen. */
	const announcement = (): string | undefined => {
		const shown = notificationService
			.notifications()
			.find((notification) => notification.kind.startsWith('recording-'));

		return shown?.kind.replace('recording-', '');
	};

	/** Closes the notification the way a participant does. */
	const closeAnnouncement = (): void => {
		for (const notification of notificationService.notifications()) {
			notificationService.dismissNotification(notification.id);
		}
	};

	/** Drives the service the only way the app does: by moving the recording state. */
	const moveTo = (status: RecordingState) => {
		recordingStatus.set({ status });
		TestBed.tick();
	};

	beforeEach(() => {
		jasmine.clock().install();
		jasmine.clock().mockDate();

		recordingStatus = signal<RecordingStateInfo>({ status: RecordingState.STOPPED });
		hasRoomTracksPublished = true;

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				RecordingNoticeService,
				NotificationService,
				{ provide: RecordingService, useValue: { recordingStatus } },
				{
					provide: MeetingLiveKitService,
					useValue: {
						isInitialized: () => true,
						hasRoomTracksPublished: () => hasRoomTracksPublished
					}
				},
				// The real notification service is exercised here through its caller; only its
				// Material collaborators, which this never reaches, are stubbed out.
				{ provide: MatSnackBar, useValue: {} },
				{ provide: MatDialog, useValue: {} },
				{ provide: Overlay, useValue: {} }
			]
		});

		// Instantiated for its own sake: what it does is watch the recording state and announce it
		TestBed.inject(RecordingNoticeService);
		notificationService = TestBed.inject(NotificationService);
		TestBed.tick();
	});

	afterEach(() => {
		jasmine.clock().uninstall();
	});

	it('announces nothing in a meeting that is not recording', () => {
		expect(announcement()).toBeUndefined();
	});

	it('announces the start to everyone, whoever pressed the button', () => {
		moveTo(RecordingState.STARTED);

		expect(announcement()).toBe('started');
	});

	it('announces a recording that was already running when this client joined', () => {
		// The state arrives from the SFU rather than from a local click, which is the same
		// transition as far as this service is concerned.
		moveTo(RecordingState.STARTED);

		expect(announcement()).toBe('started');
	});

	it('does not announce a start that never made it', () => {
		moveTo(RecordingState.STARTING);
		expect(announcement()).toBeUndefined();

		moveTo(RecordingState.FAILED);
		expect(announcement()).toBeUndefined();
	});

	it('announces the start once, when starting resolves into recording', () => {
		moveTo(RecordingState.STARTING);
		moveTo(RecordingState.STARTED);

		expect(announcement()).toBe('started');
	});

	it('keeps quiet while a recording is stopping, which is still capturing', () => {
		moveTo(RecordingState.STARTED);
		closeAnnouncement();

		moveTo(RecordingState.STOPPING);

		expect(announcement()).toBeUndefined();
	});

	it('announces the stop, which is the half the REC chip cannot carry', () => {
		moveTo(RecordingState.STARTED);
		moveTo(RecordingState.STOPPING);
		moveTo(RecordingState.STOPPED);

		expect(announcement()).toBe('stopped');
	});

	it('announces the stop when a running recording fails instead of ending cleanly', () => {
		moveTo(RecordingState.STARTED);
		moveTo(RecordingState.FAILED);

		expect(announcement()).toBe('stopped');
	});

	it('takes itself away, so it never sits on top of the meeting', () => {
		moveTo(RecordingState.STARTED);

		jasmine.clock().tick(NOTICE_DURATION_MS - 1);
		expect(announcement()).toBe('started');

		jasmine.clock().tick(1);
		expect(announcement()).toBeUndefined();
	});

	it('can be dismissed by hand before it takes itself away', () => {
		moveTo(RecordingState.STARTED);

		closeAnnouncement();

		expect(announcement()).toBeUndefined();
	});

	it('replaces a notice still on screen instead of queueing behind it', () => {
		moveTo(RecordingState.STARTED);
		jasmine.clock().tick(NOTICE_DURATION_MS - 500);

		moveTo(RecordingState.STOPPED);
		expect(announcement()).toBe('stopped');

		// The first notice's timer must not carry the second one away early.
		jasmine.clock().tick(600);
		expect(announcement()).toBe('stopped');

		jasmine.clock().tick(NOTICE_DURATION_MS);
		expect(announcement()).toBeUndefined();
	});

	describe('a recording that has nothing to record yet', () => {
		beforeEach(() => {
			hasRoomTracksPublished = false;
		});

		it('announces that the recording is waiting for a device to be turned on', () => {
			moveTo(RecordingState.STARTING);

			expect(announcement()).toBe('waiting-for-media');
		});

		it('announces the wait once, however many times the start is reported', () => {
			moveTo(RecordingState.STARTING);
			closeAnnouncement();

			moveTo(RecordingState.STARTING);

			expect(announcement()).toBeUndefined();
		});

		it('replaces the wait with the start once the first track arrives', () => {
			moveTo(RecordingState.STARTING);
			hasRoomTracksPublished = true;

			moveTo(RecordingState.STARTED);

			expect(announcement()).toBe('started');
		});

		it('stays on screen, so the room cannot miss what it is waiting for', () => {
			moveTo(RecordingState.STARTING);

			jasmine.clock().tick(NOTICE_DURATION_MS * 10);

			expect(announcement()).toBe('waiting-for-media');
		});

		it('can still be closed by hand', () => {
			moveTo(RecordingState.STARTING);

			closeAnnouncement();

			expect(announcement()).toBeUndefined();
		});

		it('goes away when the recording gives up instead of starting', () => {
			moveTo(RecordingState.STARTING);

			moveTo(RecordingState.FAILED);

			expect(announcement()).toBeUndefined();
		});

		it('announces the wait again for a later attempt', () => {
			moveTo(RecordingState.STARTING);
			closeAnnouncement();
			moveTo(RecordingState.FAILED);

			moveTo(RecordingState.STARTING);

			expect(announcement()).toBe('waiting-for-media');
		});
	});
});
