import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MeetWaitingRoomParticipantType } from '@openvidu-meet/typings';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import { ParticipantAvatarComponent } from '../../openvidu-components/components/participant-avatar/participant-avatar.component';
import { WaitingRoomAdminService, WaitingRoomWaiter } from '../waiting-room-admin.service';

interface Row extends WaitingRoomWaiter {
	/** Another row has the same name, so this one also shows when they asked to join. */
	sharesName: boolean;
	viaSharedLink: boolean;
}

/**
 * The "Waiting to join" section atop the participants panel, for whoever may let participants in: who
 * waits, in arrival order, with Admit and Deny on each row, and from two waiting the decisions on all
 * of them at once.
 */
@Component({
	selector: 'ov-waiting-room-panel-section',
	imports: [DatePipe, MatButtonModule, MatIconModule, ParticipantAvatarComponent, TranslatePipe],
	templateUrl: './waiting-room-panel-section.component.html',
	styleUrl: './waiting-room-panel-section.component.scss'
})
export class WaitingRoomPanelSectionComponent {
	private readonly waitingRoomAdmin = inject(WaitingRoomAdminService);
	private readonly dialogService = inject(DialogService);
	private readonly translateService = inject(TranslateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingRoomPanelSection');

	protected readonly availablePlaces = this.waitingRoomAdmin.availablePlaces;
	protected readonly admittable = this.waitingRoomAdmin.admittable;
	protected readonly isBusy = signal(false);

	protected readonly rows = computed<Row[]>(() => {
		const waiting = this.waitingRoomAdmin.waiting();
		const names = waiting.map(({ name }) => name);

		return waiting.map((waiter) => ({
			...waiter,
			sharesName: names.indexOf(waiter.name) !== names.lastIndexOf(waiter.name),
			viaSharedLink: waiter.participant.type === MeetWaitingRoomParticipantType.ANONYMOUS
		}));
	});

	protected admit(waiter: WaitingRoomWaiter): void {
		void this.decide(() => this.waitingRoomAdmin.admit([waiter.participant.participantIdentity]));
	}

	protected deny(waiter: WaitingRoomWaiter): void {
		void this.decide(() => this.waitingRoomAdmin.reject([waiter.participant.participantIdentity]));
	}

	protected admitShown(): void {
		void this.decide(() => this.waitingRoomAdmin.admitShown());
	}

	/** Denies everyone waiting when the confirmation arrives, whoever joined or left the line meanwhile. */
	protected confirmDenyAll(): void {
		this.dialogService.showDialog({
			icon: 'person_off',
			title: this.translateService.translate('WAITING_ROOM.ADMIN.DENY_ALL_TITLE'),
			message: this.translateService.translate('WAITING_ROOM.ADMIN.DENY_ALL_MESSAGE'),
			confirmText: this.translateService.translate('WAITING_ROOM.ADMIN.DENY_ALL'),
			cancelText: this.translateService.translate('WAITING_ROOM.ADMIN.CANCEL'),
			confirmCallback: () => void this.decide(() => this.waitingRoomAdmin.reject())
		});
	}

	private async decide(decision: () => Promise<unknown>): Promise<void> {
		if (this.isBusy()) return;

		this.isBusy.set(true);

		try {
			await decision();
		} catch (error) {
			this.log.w('The waiting room decision was refused:', error);
		} finally {
			this.isBusy.set(false);
		}
	}
}
