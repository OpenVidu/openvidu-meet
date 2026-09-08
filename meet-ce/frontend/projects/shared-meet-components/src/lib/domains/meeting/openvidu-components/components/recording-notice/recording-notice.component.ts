import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { RecordingNoticeService } from '../../services/recording-notice/recording-notice.service';

/**
 * Transient notice telling the whole room that the recording has started or stopped. It never
 * blocks the meeting: while a recording runs, the REC chip in the status rail is what carries it,
 * so this only has to be seen once. The stop half matters most, because that chip disappears when
 * the recording ends and nothing else would say why.
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

	protected readonly isStarted = computed(() => this.announcement() === 'started');

	protected readonly titleKey = computed(() =>
		this.isStarted() ? 'ROOM.RECORDING_STARTED_TITLE' : 'ROOM.RECORDING_STOPPED_TITLE'
	);

	protected readonly messageKey = computed(() =>
		this.isStarted() ? 'ROOM.RECORDING_STARTED_MESSAGE' : 'ROOM.RECORDING_STOPPED_MESSAGE'
	);

	protected dismiss(): void {
		this.recordingNotice.dismiss();
	}
}
