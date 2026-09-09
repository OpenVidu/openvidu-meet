import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../pipes/translate.pipe';
import {
	RecordingAnnouncement,
	RecordingNoticeService
} from '../../services/recording-notice/recording-notice.service';

/** What each announcement puts on the notice. */
const NOTICE_COPY: Record<RecordingAnnouncement, { titleKey: string; messageKey: string; icon: string }> = {
	started: {
		titleKey: 'ROOM.RECORDING_STARTED_TITLE',
		messageKey: 'ROOM.RECORDING_STARTED_MESSAGE',
		icon: 'radio_button_checked'
	},
	stopped: {
		titleKey: 'ROOM.RECORDING_STOPPED_TITLE',
		messageKey: 'ROOM.RECORDING_STOPPED_MESSAGE',
		icon: 'radio_button_checked'
	},
	'waiting-for-media': {
		titleKey: 'ROOM.RECORDING_WAITING_MEDIA_TITLE',
		messageKey: 'ROOM.RECORDING_WAITING_MEDIA_MESSAGE',
		icon: 'hourglass_top'
	}
};

/**
 * Transient notice telling the whole room that the recording has started, is waiting for something
 * to record, or has stopped. It never blocks the meeting: while a recording runs, the REC chip in
 * the status rail is what carries it, so this only has to be seen once. The stop half matters most,
 * because that chip disappears when the recording ends and nothing else would say why.
 */
@Component({
	selector: 'ov-recording-notice',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './recording-notice.component.html',
	styleUrl: './recording-notice.component.scss'
})
export class RecordingNoticeComponent {
	private readonly recordingNotice = inject(RecordingNoticeService);

	protected readonly announcement = this.recordingNotice.announcement;

	protected readonly copy = computed(() => {
		const announcement = this.announcement();
		return announcement ? NOTICE_COPY[announcement] : undefined;
	});

	protected dismiss(): void {
		this.recordingNotice.dismiss();
	}
}
