import { Component, DestroyRef, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotificationOptions, NotificationText } from '../../../../shared/models/notification.model';
import { LoggerService } from '../../../../shared/services/logger.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { nameHiddenParticipants } from '../../openvidu-components/models/layout/smart-layout.model';
import { PanelType } from '../../openvidu-components/models/panel.model';
import { PanelService } from '../../openvidu-components/services/panel/panel.service';
import { WaitingRoomAdminService, WaitingRoomWaiter } from '../waiting-room-admin.service';

/**
 * Tells whoever may let participants in that someone asked to join, below the status rail, while the
 * participants panel, which lists them, is closed. One person is named, with Deny and Admit; several
 * are counted, with View, which opens the panel. Opening the panel takes it away. It renders nothing
 * itself: the notification goes up in the meeting's notification stack.
 */
@Component({
	selector: 'ov-waiting-room-notice',
	template: ''
})
export class WaitingRoomNoticeComponent {
	private readonly waitingRoomAdmin = inject(WaitingRoomAdminService);
	private readonly notificationService = inject(NotificationService);
	private readonly panelService = inject(PanelService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - WaitingRoomNotice');

	/** The identities the notification on screen announces, in arrival order. */
	private announced: string[] = [];
	private noticeId?: number;

	constructor() {
		this.waitingRoomAdmin.arrivals$.pipe(takeUntilDestroyed()).subscribe((arrived) => this.announce(arrived));

		effect(() => {
			const waiting = this.waitingRoomAdmin.waiting();
			untracked(() => this.show(waiting));
		});

		effect(() => {
			if (this.panelService.isParticipantsPanelOpened()) untracked(() => this.dismiss());
		});

		inject(DestroyRef).onDestroy(() => this.dismiss());
	}

	private announce(arrived: WaitingRoomWaiter[]): void {
		if (this.panelService.isParticipantsPanelOpened()) return;

		this.forgetIfClosed();
		this.announced.push(...arrived.map(({ participant }) => participant.participantIdentity));
		this.show(this.waitingRoomAdmin.waiting());
	}

	/** Follows the line: whoever the notification announces and no longer waits drops out of it. */
	private show(waiting: WaitingRoomWaiter[]): void {
		this.forgetIfClosed();
		const waiters = this.announced
			.map((identity) => waiting.find(({ participant }) => participant.participantIdentity === identity))
			.filter((waiter): waiter is WaitingRoomWaiter => waiter !== undefined);

		this.announced = waiters.map(({ participant }) => participant.participantIdentity);

		if (waiters.length === 0) return this.dismiss();

		const options = this.options(waiters);

		if (this.noticeId === undefined) {
			this.noticeId = this.notificationService.showNotification(options);
		} else {
			this.notificationService.updateNotification(this.noticeId, options);
		}
	}

	private options(waiters: WaitingRoomWaiter[]): NotificationOptions {
		const notice = { kind: 'waiting-room-knock', icon: 'hourglass_top' };

		if (waiters.length > 1) {
			return {
				...notice,
				title: { key: 'WAITING_ROOM.ADMIN.WAITING_COUNT', params: { count: waiters.length } },
				message: this.namesOf(waiters),
				action: { label: { key: 'WAITING_ROOM.ADMIN.VIEW' }, run: () => this.openPanel() }
			};
		}

		const [{ name, participant }] = waiters;
		const identities = [participant.participantIdentity];

		return {
			...notice,
			title: name,
			message: { key: 'WAITING_ROOM.ADMIN.WANTS_TO_JOIN' },
			secondaryAction: {
				label: { key: 'WAITING_ROOM.ADMIN.DENY' },
				run: () => this.decide(this.waitingRoomAdmin.reject(identities))
			},
			action: {
				label: { key: 'WAITING_ROOM.ADMIN.ADMIT' },
				run: () => this.decide(this.waitingRoomAdmin.admit(identities))
			}
		};
	}

	private namesOf(waiters: WaitingRoomWaiter[]): NotificationText {
		const names = nameHiddenParticipants(
			waiters.map(({ name }) => name),
			waiters.length
		)!;

		return names.remaining > 0
			? { key: 'HIDDEN_PARTICIPANTS.NAMES_AND_MORE', params: { names: names.shown, count: names.remaining } }
			: names.shown;
	}

	private decide(decision: Promise<unknown>): void {
		decision.catch((error) => this.log.w('The waiting room decision was refused:', error));
	}

	private openPanel(): void {
		if (!this.panelService.isParticipantsPanelOpened()) this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}

	/** A notification the participant closed, or answered, announces nobody any more. */
	private forgetIfClosed(): void {
		const closed =
			this.noticeId !== undefined &&
			!this.notificationService.notifications().some(({ id }) => id === this.noticeId);

		if (closed) this.dismiss();
	}

	private dismiss(): void {
		if (this.noticeId !== undefined) this.notificationService.dismissNotification(this.noticeId);

		this.noticeId = undefined;
		this.announced = [];
	}
}
