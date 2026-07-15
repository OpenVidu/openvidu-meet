import { Overlay } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Service } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConfirmDialogComponent } from '../components/dialogs/confirm-dialog/confirm-dialog.component';
import { SpinnerComponent } from '../components/spinner/spinner.component';
import { DialogOptions } from '../models/notification.model';

@Service()
export class NotificationService {
	private snackBar = inject(MatSnackBar);
	private dialog = inject(MatDialog);
	private overlay = inject(Overlay);

	private spinnerRef: any;

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

	showSnackbar(message: string, duration: number = 3000): void {
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
