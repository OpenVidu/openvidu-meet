import { LiveAnnouncer } from '@angular/cdk/a11y';
import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AssetsService } from '../../../../shared/services/assets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { MeetingJoinService } from '../../services/meeting-join.service';
import { WaitingRoomOutcome, WaitingRoomService } from '../waiting-room.service';

/** After a rejection, asking again stays off this long. The server has no pause of its own. */
export const ASK_AGAIN_PAUSE_AFTER_REJECTION_MS = 15_000;

const OUTCOME_COPY: Record<WaitingRoomOutcome, { titleKey: string; messageKey: string }> = {
	rejected: { titleKey: 'WAITING_ROOM.REJECTED_TITLE', messageKey: 'WAITING_ROOM.REJECTED_MESSAGE' },
	left: { titleKey: 'WAITING_ROOM.LEFT_TITLE', messageKey: 'WAITING_ROOM.LEFT_MESSAGE' },
	expired: { titleKey: 'WAITING_ROOM.EXPIRED_TITLE', messageKey: 'WAITING_ROOM.EXPIRED_MESSAGE' },
	meeting_ended: { titleKey: 'WAITING_ROOM.ENDED_TITLE', messageKey: 'WAITING_ROOM.ENDED_MESSAGE' },
	full: { titleKey: 'WAITING_ROOM.FULL_TITLE', messageKey: 'WAITING_ROOM.FULL_MESSAGE' }
};

/** Tells the participant how their wait ended without being let in, and lets them ask again or leave. */
@Component({
	selector: 'ov-waiting-outcome',
	imports: [MatButtonModule, MatIconModule, TranslatePipe],
	templateUrl: './waiting-outcome.component.html',
	styleUrl: './waiting-outcome.component.scss'
})
export class WaitingOutcomeComponent {
	private readonly waitingRoom = inject(WaitingRoomService);
	protected readonly joinService = inject(MeetingJoinService);
	private readonly liveAnnouncer = inject(LiveAnnouncer);
	private readonly translateService = inject(TranslateService);
	private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

	protected readonly logoUrl = inject(AssetsService).logo;
	protected readonly outcome = computed(() => this.waitingRoom.outcome() ?? 'expired');
	protected readonly copy = computed(() => OUTCOME_COPY[this.outcome()]);
	protected readonly askAgainPaused = signal(this.outcome() === 'rejected');

	constructor() {
		if (this.askAgainPaused()) {
			const pause = setTimeout(() => this.askAgainPaused.set(false), ASK_AGAIN_PAUSE_AFTER_REJECTION_MS);
			inject(DestroyRef).onDestroy(() => clearTimeout(pause));
		}

		afterNextRender(() => {
			this.heading().nativeElement.focus();
			this.liveAnnouncer
				.announce(this.translateService.translate(this.copy().titleKey), 'assertive')
				.catch(() => undefined);
		});
	}

	protected askAgain(): void {
		this.waitingRoom.askAgain();
	}
}
