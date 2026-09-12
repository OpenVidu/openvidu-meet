import { inject, Service, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationOptions, ShownNotification } from '../models/notification.model';

/**
 * Says things to the user without stopping what they are doing: notifications pinned in the layout
 * by whoever hosts the `ov-notifications` outlet, and snackbars in the corner. What has to stop
 * them until they answer is a dialog, and belongs to {@link DialogService}.
 */
@Service()
export class NotificationService {
	private readonly snackBar = inject(MatSnackBar);

	private lastNotificationId = 0;
	private readonly notificationTimers = new Map<number, ReturnType<typeof setTimeout>>();

	private readonly _notifications = signal<ShownNotification[]>([]);

	/**
	 * The notifications currently pinned in the layout, oldest first. Rendered by the
	 * `ov-notifications` outlet, which the host places wherever they belong.
	 */
	readonly notifications = this._notifications.asReadonly();

	/**
	 * Pins a notification in the layout and returns its id, which the caller keeps to take it away
	 * again. One with no `durationMs` stays until it is dismissed, by the participant or by whoever
	 * raised it.
	 */
	showNotification(options: NotificationOptions): number {
		const id = ++this.lastNotificationId;
		this._notifications.update((notifications) => [...notifications, { ...options, id }]);

		if (options.durationMs !== undefined) {
			this.notificationTimers.set(
				id,
				setTimeout(() => this.dismissNotification(id), options.durationMs)
			);
		}

		return id;
	}

	/** Takes a notification away. Dismissing one that is already gone does nothing. */
	dismissNotification(id: number): void {
		const timer = this.notificationTimers.get(id);

		if (timer !== undefined) {
			clearTimeout(timer);
			this.notificationTimers.delete(id);
		}

		this._notifications.update((notifications) => notifications.filter((notification) => notification.id !== id));
	}

	/** A message in the corner, for a screen with nowhere to pin one. */
	showSnackbar(message: string, duration = 3000): void {
		this.snackBar.open(message, 'Close', {
			duration,
			verticalPosition: 'top',
			horizontalPosition: 'right',
			panelClass: 'custom-snackbar'
		});
	}
}
