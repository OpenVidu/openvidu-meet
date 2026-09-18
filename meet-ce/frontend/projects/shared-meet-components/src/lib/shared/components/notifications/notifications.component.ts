import { Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
	NotificationPlacement,
	NotificationText,
	NotificationTone,
	ShownNotification
} from '../../models/notification.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslateService } from '../../services/i18n/translate.service';
import { NotificationService } from '../../services/notification.service';

/** A notification with its copy already resolved into the participant's language. */
interface NotificationView {
	id: number;
	kind: string;
	icon: string;
	tone: NotificationTone;
	title?: string;
	message: string;
	action?: { label: string; run: () => void };
}

/**
 * Renders the notifications stacked where this outlet is, newest last. Where that is belongs to
 * whoever places the outlet: the meeting hangs one under its status rail, and
 * {@link NotificationService} hangs the corner one itself.
 */
@Component({
	selector: 'ov-notifications',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './notifications.component.html',
	styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
	private readonly notificationService = inject(NotificationService);
	private readonly translateService = inject(TranslateService);

	/** Which of the stacks this outlet renders. */
	readonly placement = input<NotificationPlacement>('pinned');

	protected readonly notifications = computed<NotificationView[]>(() =>
		this.notificationService
			.notifications()
			.filter((notification) => (notification.placement ?? 'corner') === this.placement())
			.map((notification) => this.toView(notification))
	);

	protected dismiss(id: number): void {
		this.notificationService.dismissNotification(id);
	}

	/** Acting on a notification answers it, so it goes away with the action. */
	protected run(notification: NotificationView): void {
		this.dismiss(notification.id);
		notification.action?.run();
	}

	private toView(notification: ShownNotification): NotificationView {
		return {
			id: notification.id,
			kind: notification.kind,
			icon: notification.icon,
			tone: notification.tone ?? 'neutral',
			title: this.resolve(notification.title),
			message: this.resolve(notification.message)!,
			action: notification.action && {
				label: this.resolve(notification.action.label)!,
				run: notification.action.run
			}
		};
	}

	private resolve(text: NotificationText | undefined): string | undefined {
		if (text === undefined || typeof text === 'string') return text;

		// Read the way the translate pipe does, so copy resolves again once a language finishes loading.
		this.translateService.translationsLoaded();
		return this.translateService.translate(text.key, text.params);
	}
}
