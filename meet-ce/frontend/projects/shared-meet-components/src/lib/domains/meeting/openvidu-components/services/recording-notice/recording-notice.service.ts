import { effect, inject, Service } from '@angular/core';
import { NotificationService } from '../../../../../shared/services/notification.service';
import { RecordingState } from '../../models/recording.model';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { RecordingService } from '../recording/recording.service';

/** Which transition the room is being told about. */
export type RecordingAnnouncement = 'started' | 'stopped' | 'waiting-for-media';

/** Long enough to be read, short enough not to sit on top of the meeting. */
const NOTICE_DURATION_MS = 10_000;

/**
 * What each announcement puts on the notification. The wait is the one with no duration: it has no
 * end of its own, so it stays until it is dismissed.
 */
const ANNOUNCEMENTS = {
	started: {
		icon: 'radio_button_checked',
		tone: 'alert' as const,
		titleKey: 'ROOM.RECORDING_STARTED_TITLE',
		messageKey: 'ROOM.RECORDING_STARTED_MESSAGE',
		durationMs: NOTICE_DURATION_MS
	},
	stopped: {
		icon: 'radio_button_checked',
		tone: 'neutral' as const,
		titleKey: 'ROOM.RECORDING_STOPPED_TITLE',
		messageKey: 'ROOM.RECORDING_STOPPED_MESSAGE',
		durationMs: NOTICE_DURATION_MS
	},
	'waiting-for-media': {
		icon: 'hourglass_top',
		tone: 'neutral' as const,
		titleKey: 'ROOM.RECORDING_WAITING_MEDIA_TITLE',
		messageKey: 'ROOM.RECORDING_WAITING_MEDIA_MESSAGE'
	}
};

/**
 * Announces to every participant that the recording has started or stopped.
 *
 * The panel only tells whoever opens it, so the transition is announced on the meeting stage
 * instead. It is driven off the recording state rather than off the button that was pressed, so it
 * reaches every client: the moderator who started it, a room that started on its own with nobody
 * pressing anything, and anyone who joins while a recording is already running, for whom the state
 * arriving from the SFU is that client's first transition into it.
 *
 * A recording that has started but has nothing to record is announced too: the composite recorder
 * waits for the first published track, so a room where nobody publishes captures nothing until
 * someone does, and only the room can unblock it. That one is not taken away on a timer, because
 * the wait it describes has no end of its own and the room has to read it to end it: it stays until
 * a participant closes it, or until the recording it is about either starts or gives up.
 */
@Service()
export class RecordingNoticeService {
	private readonly recordingService = inject(RecordingService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly notificationService = inject(NotificationService);

	private wasRecording = false;
	private wasWaitingForMedia = false;
	private shownId: number | undefined;

	private readonly announceEffect = effect(() => {
		const { status } = this.recordingService.recordingStatus();
		// A recording that is stopping is still capturing, and a start that never made it does not
		// count as one, so neither edge announces anything on its own.
		const isRecording = status === RecordingState.STARTED || status === RecordingState.STOPPING;

		if (isRecording !== this.wasRecording) {
			this.wasRecording = isRecording;
			this.wasWaitingForMedia = false;
			this.announce(isRecording ? 'started' : 'stopped');
			return;
		}

		const isWaitingForMedia = status === RecordingState.STARTING && !this.hasRoomTracksPublished();

		if (isWaitingForMedia === this.wasWaitingForMedia) return;

		this.wasWaitingForMedia = isWaitingForMedia;

		if (isWaitingForMedia) {
			this.announce('waiting-for-media');
		} else {
			// Reached only by leaving the wait behind, so the notice describing it goes away with it:
			// the recording gave up instead of starting, and what the notice promises cannot happen
			this.dismiss();
		}
	});

	/** Answered off this client's own room, which is where a track publication is already known. */
	private hasRoomTracksPublished(): boolean {
		return this.meetingLiveKitService.isInitialized() && this.meetingLiveKitService.hasRoomTracksPublished();
	}

	private announce(announcement: RecordingAnnouncement): void {
		this.dismiss();
		this.shownId = this.notificationService.showNotification({
			kind: `recording-${announcement}`,
			dismissLabelKey: 'PANEL.CLOSE',
			...ANNOUNCEMENTS[announcement]
		});
	}

	private dismiss(): void {
		if (this.shownId === undefined) return;

		this.notificationService.dismissNotification(this.shownId);
		this.shownId = undefined;
	}
}
