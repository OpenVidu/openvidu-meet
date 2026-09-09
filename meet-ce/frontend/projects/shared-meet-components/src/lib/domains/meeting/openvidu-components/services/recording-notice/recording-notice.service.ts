import { effect, inject, Service, signal } from '@angular/core';
import { RecordingState } from '../../models/recording.model';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { RecordingService } from '../recording/recording.service';

/** Which transition the room is being told about. */
export type RecordingAnnouncement = 'started' | 'stopped' | 'waiting-for-media';

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
	private static readonly NOTICE_DURATION_MS = 10_000;

	private readonly recordingService = inject(RecordingService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);

	private wasRecording = false;
	private wasWaitingForMedia = false;
	private dismissHandle: ReturnType<typeof setTimeout> | undefined;

	private readonly _announcement = signal<RecordingAnnouncement | undefined>(undefined);

	/** The transition to announce, `undefined` once the notice is gone. */
	readonly announcement = this._announcement.asReadonly();

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

	dismiss(): void {
		clearTimeout(this.dismissHandle);
		this.dismissHandle = undefined;
		this._announcement.set(undefined);
	}

	/** Answered off this client's own room, which is where a track publication is already known. */
	private hasRoomTracksPublished(): boolean {
		return this.meetingLiveKitService.isInitialized() && this.meetingLiveKitService.hasRoomTracksPublished();
	}

	private announce(announcement: RecordingAnnouncement): void {
		this.dismiss();
		this._announcement.set(announcement);

		if (announcement === 'waiting-for-media') return;

		this.dismissHandle = setTimeout(() => this.dismiss(), RecordingNoticeService.NOTICE_DURATION_MS);
	}
}
