import { inject, Service } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { DialogTemplateComponent } from '../../components/dialogs/dialog.component';

/**
 * @internal
 */
@Service()
export class ActionService {
	public readonly dialog = inject(MatDialog);

	private dialogRef: MatDialogRef<DialogTemplateComponent> | undefined;
	private connectionDialogRef: MatDialogRef<DialogTemplateComponent> | undefined;
	private isConnectionDialogOpen = false;

	constructor() {}

	openDialog(titleMessage: string, descriptionMessage: string, allowClose = true) {
		this.closeDialog();
		const config: MatDialogConfig = {
			minWidth: '250px',
			data: { title: titleMessage, description: descriptionMessage, showActionButtons: allowClose },
			disableClose: !allowClose
		};
		this.dialogRef = this.dialog.open(DialogTemplateComponent, config);
		this.dialogRef.afterClosed().subscribe(() => (this.dialogRef = undefined));
	}

	openConnectionDialog(titleMessage: string, descriptionMessage: string, allowClose = false) {
		if (this.isConnectionDialogOpen) return;

		const config: MatDialogConfig = {
			minWidth: '250px',
			data: { title: titleMessage, description: descriptionMessage, showActionButtons: allowClose },
			disableClose: !allowClose
		};

		this.connectionDialogRef = this.dialog.open(DialogTemplateComponent, config);
		this.isConnectionDialogOpen = true;
		this.connectionDialogRef.afterClosed().subscribe(() => {
			this.isConnectionDialogOpen = false;
			this.connectionDialogRef = undefined;
		});
	}

	closeDialog() {
		if (this.dialogRef) {
			this.dialogRef.close();
			this.dialogRef = undefined;
		}
	}

	closeConnectionDialog() {
		if (this.connectionDialogRef) {
			this.connectionDialogRef.close();
			this.isConnectionDialogOpen = false;
			this.connectionDialogRef = undefined;
		}
	}
}
