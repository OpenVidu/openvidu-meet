import { LiveAnnouncer } from '@angular/cdk/a11y';
import { afterNextRender, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AssetsService } from '../../../../shared/services/assets.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { MeetingJoinService } from '../../services/meeting-join.service';
import { WaitingParticipantOutcome, WaitingParticipantService } from '../waiting-participant.service';

const OUTCOME_COPY: Record<WaitingParticipantOutcome, { titleKey: string; messageKey: string }> = {
	rejected: { titleKey: 'WAITING_PARTICIPANTS.REJECTED_TITLE', messageKey: 'WAITING_PARTICIPANTS.REJECTED_MESSAGE' },
	left: { titleKey: 'WAITING_PARTICIPANTS.LEFT_TITLE', messageKey: 'WAITING_PARTICIPANTS.LEFT_MESSAGE' },
	expired: { titleKey: 'WAITING_PARTICIPANTS.EXPIRED_TITLE', messageKey: 'WAITING_PARTICIPANTS.EXPIRED_MESSAGE' },
	meeting_ended: { titleKey: 'WAITING_PARTICIPANTS.ENDED_TITLE', messageKey: 'WAITING_PARTICIPANTS.ENDED_MESSAGE' },
	full: { titleKey: 'WAITING_PARTICIPANTS.FULL_TITLE', messageKey: 'WAITING_PARTICIPANTS.FULL_MESSAGE' }
};

/** Tells the participant how their wait ended without being let in, and lets them ask again or leave. */
@Component({
	selector: 'ov-waiting-outcome',
	imports: [MatButtonModule, MatIconModule, TranslatePipe],
	templateUrl: './waiting-outcome.component.html',
	styleUrl: './waiting-outcome.component.scss'
})
export class WaitingOutcomeComponent {
	private readonly waitingParticipant = inject(WaitingParticipantService);
	protected readonly joinService = inject(MeetingJoinService);
	private readonly liveAnnouncer = inject(LiveAnnouncer);
	private readonly translateService = inject(TranslateService);
	private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

	protected readonly logoUrl = inject(AssetsService).logo;
	protected readonly outcome = computed(() => this.waitingParticipant.outcome() ?? 'expired');
	protected readonly copy = computed(() => OUTCOME_COPY[this.outcome()]);

	constructor() {
		afterNextRender(() => {
			this.heading().nativeElement.focus();
			this.liveAnnouncer
				.announce(this.translateService.translate(this.copy().titleKey), 'assertive')
				.catch(() => undefined);
		});
	}

	protected askAgain(): void {
		this.waitingParticipant.askAgain();
	}
}
