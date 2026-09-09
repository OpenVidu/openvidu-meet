import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Service, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmDialogComponent } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { SpinnerComponent } from '../components/spinner/spinner.component';
import { DialogOptions, NotificationOptions, ShownNotification } from '../models/notification.model';

@Service()
export class NotificationService {
	private snackBar = inject(MatSnackBar);
	private dialog = inject(MatDialog);
	private overlay = inject(Overlay);

	private spinnerRef: any;

	private lastNotificationId = 0;
	private readonly notificationTimers = new Map<number, ReturnType<typeof setTimeout>>();

	private readonly _notifications = signal<ShownNotification[]>([]);

	/**
	 * The notifications currently pinned in the layout, oldest first. Rendered by the
	 * `ov-notifications` outlet, which the host places wherever they belong.
	 */
	readonly notifications = this._notifications.asReadonly();

	showSpinner() {
		if (!this.spinnerRef) {
			const overlayRef = this.overlay.create({
				positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
				panelClass: 'spinner-overlay'
			});

			this.spinnerRef = overlayRef.attach(new ComponentPortal(SpinnerComponent));
		}
	}

	hideSpinner(): void {
		if (this.spinnerRef) {
			this.spinnerRef.detach();
			this.spinnerRef = null;
		}
	}

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

	showSnackbar(message: string, duration = 3000): void {
		this.snackBar.open(message, 'Close', {
			duration,
			verticalPosition: 'top',
			horizontalPosition: 'right',
			panelClass: 'custom-snackbar'
		});
	}

	showDialog(options: DialogOptions): void {
		this.dialog.open(ConfirmDialogComponent, {
			data: options,
			width: '450px',
			disableClose: true
		});
	}

	showAlert(message: string): void {
		this.dialog.open(ConfirmDialogComponent, {
			data: {
				message,
				confirmText: 'OK'
			},
			width: '300px',
			disableClose: true
		});
	}
}
