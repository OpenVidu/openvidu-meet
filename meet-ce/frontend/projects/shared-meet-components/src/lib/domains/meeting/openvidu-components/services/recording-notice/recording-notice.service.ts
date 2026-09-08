import { effect, inject, Service, signal } from '@angular/core';
import { RecordingState } from '../../models/recording.model';
import { RecordingService } from '../recording/recording.service';

/** Which transition the room is being told about. */
export type RecordingAnnouncement = 'started' | 'stopped';

/**
 * Announces to every participant that the recording has started or stopped.
 *
 * The panel only tells whoever opens it, so the transition is announced on the meeting stage
 * instead. It is driven off the recording state rather than off the button that was pressed, so it
 * reaches every client: the moderator who started it, a room that started on its own with nobody
 * pressing anything, and anyone who joins while a recording is already running, for whom the state
 * arriving from the SFU is that client's first transition into it.
 */
@Service()
export class RecordingNoticeService {
	private static readonly NOTICE_DURATION_MS = 10_000;

	private readonly recordingService = inject(RecordingService);

	private wasRecording = false;
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
			this.announce(isRecording ? 'started' : 'stopped');
		}
	});

	dismiss(): void {
		clearTimeout(this.dismissHandle);
		this.dismissHandle = undefined;
		this._announcement.set(undefined);
	}

	private announce(announcement: RecordingAnnouncement): void {
		this.dismiss();
		this._announcement.set(announcement);
		this.dismissHandle = setTimeout(() => this.dismiss(), RecordingNoticeService.NOTICE_DURATION_MS);
	}
}
