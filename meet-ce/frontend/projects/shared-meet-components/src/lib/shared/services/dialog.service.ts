import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { DialogOptions } from '../models/notification.model';

/**
 * Opens the application's modal dialogs, the ones that stop what the user was doing until they
 * answer. What can be said without stopping them goes through {@link NotificationService} instead.
 *
 * The wording of each dialog lives in {@link DialogPresetsService}.
 */
@Service()
export class DialogService {
	private readonly dialog = inject(MatDialog);

	showDialog(options: DialogOptions): void {
		this.dialog.open(ConfirmDialogComponent, {
			data: options,
			width: '450px',
			disableClose: true
		});
	}
}
