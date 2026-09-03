import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { MeetingEndingSoonService } from '../../services/meeting-ending-soon/meeting-ending-soon.service';

/**
 * Transient notice announcing that a duration-limited meeting is about to end. It never blocks the
 * meeting: the countdown chip in the status rail is what carries the warning for the rest of the
 * window, so this only has to be seen once.
 */
@Component({
	selector: 'ov-ending-soon-notice',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './ending-soon-notice.component.html',
	styleUrl: './ending-soon-notice.component.scss'
})
export class EndingSoonNoticeComponent {
	private readonly endingSoonService = inject(MeetingEndingSoonService);

	protected readonly noticeMinutes = this.endingSoonService.noticeMinutes;

	protected readonly messageKey = computed(() =>
		this.noticeMinutes() === 1 ? 'ROOM.ENDING_SOON_ONE_MINUTE' : 'ROOM.ENDING_SOON_MANY_MINUTES'
	);

	protected dismiss(): void {
		this.endingSoonService.dismissNotice();
	}
}
