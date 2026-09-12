import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ShownNotification } from '../../models/notification.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { NotificationService } from '../../services/notification.service';

/**
 * Renders the notifications pinned in the layout, newest last. Where they appear is the host's
 * business: this only stacks them, so the meeting can hang them under its status rail and another
 * screen somewhere else entirely.
 */
@Component({
	selector: 'ov-notifications',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './notifications.component.html',
	styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
	private readonly notificationService = inject(NotificationService);

	protected readonly notifications = this.notificationService.notifications;

	protected dismiss(id: number): void {
		this.notificationService.dismissNotification(id);
	}

	/** Acting on a notification answers it, so it goes away with the action. */
	protected run(notification: ShownNotification): void {
		this.dismiss(notification.id);
		notification.action?.run();
	}
}
