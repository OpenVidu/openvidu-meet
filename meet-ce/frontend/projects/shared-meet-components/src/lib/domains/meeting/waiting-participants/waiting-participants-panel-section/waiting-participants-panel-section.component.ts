import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MeetParticipantType } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { ParticipantAvatarComponent } from '../../openvidu-components/components/participant-avatar/participant-avatar.component';
import { WaitingParticipantsAdminService, WaitingParticipantView } from '../waiting-participants-admin.service';

interface Row extends WaitingParticipantView {
	/** Another row has the same name, so this one also shows when they asked to join. */
	sharesName: boolean;
	viaSharedLink: boolean;
}

/**
 * The "Waiting to join" section atop the participants panel, for whoever may let participants in: who
 * waits, by the time they asked, with Admit and Deny on each row, and from two waiting the decisions on all
 * of them at once.
 */
@Component({
	selector: 'ov-waiting-participants-panel-section',
	imports: [DatePipe, MatButtonModule, MatIconModule, ParticipantAvatarComponent, TranslatePipe],
	templateUrl: './waiting-participants-panel-section.component.html',
	styleUrl: './waiting-participants-panel-section.component.scss'
})
export class WaitingParticipantsPanelSectionComponent {
	private readonly waitingAdmin = inject(WaitingParticipantsAdminService);
	private readonly dialogService = inject(DialogService);
	private readonly translateService = inject(TranslateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingParticipantsPanelSection');

	protected readonly freePlaces = this.waitingAdmin.freePlaces;
	protected readonly canAdmitAll = this.waitingAdmin.canAdmitAll;
	protected readonly isBusy = signal(false);

	protected readonly rows = computed<Row[]>(() => {
		const waiting = this.waitingAdmin.waiting();
		const names = waiting.map(({ name }) => name);

		return waiting.map((waiter) => ({
			...waiter,
			sharesName: names.indexOf(waiter.name) !== names.lastIndexOf(waiter.name),
			viaSharedLink: waiter.participant.type === MeetParticipantType.ANONYMOUS
		}));
	});

	protected admit(waiter: WaitingParticipantView): void {
		void this.decide(() => this.waitingAdmin.admit(waiter.participant.participantIdentity));
	}

	protected deny(waiter: WaitingParticipantView): void {
		void this.decide(() => this.waitingAdmin.reject(waiter.participant.participantIdentity));
	}

	protected admitAll(): void {
		void this.decide(() => this.waitingAdmin.admitAll());
	}

	/** Denies everyone the list shows waiting when the confirmation arrives. */
	protected confirmDenyAll(): void {
		this.dialogService.showDialog({
			icon: 'person_off',
			title: this.translateService.translate('WAITING_PARTICIPANTS.ADMIN.DENY_ALL_TITLE'),
			message: this.translateService.translate('WAITING_PARTICIPANTS.ADMIN.DENY_ALL_MESSAGE'),
			confirmText: this.translateService.translate('WAITING_PARTICIPANTS.ADMIN.DENY_ALL'),
			cancelText: this.translateService.translate('WAITING_PARTICIPANTS.ADMIN.CANCEL'),
			confirmCallback: () => void this.decide(() => this.waitingAdmin.rejectAll())
		});
	}

	private async decide(decision: () => Promise<unknown>): Promise<void> {
		if (this.isBusy()) return;

		this.isBusy.set(true);

		try {
			await decision();
		} catch (error) {
			this.log.w('The decision on waiting participants was refused:', error);
		} finally {
			this.isBusy.set(false);
		}
	}
}
