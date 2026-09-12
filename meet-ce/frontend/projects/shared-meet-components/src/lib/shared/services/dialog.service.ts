import { inject, Service } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { DialogOptions } from '../models/notification.model';

/**
 * Opens the application's modal dialogs, the ones that stop what the user was doing until they
 * answer. What can be said without stopping them goes through {@link NotificationService} instead.
 *
 * It knows nothing about what any dialog is for: the caller brings the wording, the buttons and
 * what pressing them does.
 */
@Service()
export class DialogService {
	private static readonly WIDTH = '450px';

	private readonly dialog = inject(MatDialog);

	private blockingDialogRef: MatDialogRef<ConfirmDialogComponent> | undefined;

	/** Opens a dialog the user answers, and which closes when they do. */
	showDialog(options: DialogOptions): void {
		this.dialog.open(ConfirmDialogComponent, {
			data: options,
			width: DialogService.WIDTH,
			disableClose: true
		});
	}

	/**
	 * Reports something the user can only wait out: it offers nothing to answer, so only
	 * {@link closeBlockingDialog} takes it away. Asking for a second one while it is up changes
	 * nothing, which is what lets it be raised from an event that repeats.
	 */
	showBlockingDialog(options: DialogOptions): void {
		if (this.blockingDialogRef) return;

		this.blockingDialogRef = this.dialog.open(ConfirmDialogComponent, {
			data: { ...options, showActions: false },
			width: DialogService.WIDTH,
			disableClose: true
		});
		this.blockingDialogRef.afterClosed().subscribe(() => (this.blockingDialogRef = undefined));
	}

	/** Closes the blocking dialog, if one is up. */
	closeBlockingDialog(): void {
		this.blockingDialogRef?.close();
		this.blockingDialogRef = undefined;
	}
}
