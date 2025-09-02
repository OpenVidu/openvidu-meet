import { ChangeDetectionStrategy, Component, Inject, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
	MAT_DIALOG_DATA,
	MatDialogActions,
	MatDialogContent,
	MatDialogRef,
	MatDialogTitle
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { DialogOptions } from '@lib/models';

@Component({
	selector: 'ov-dialog',
	standalone: true,
	imports: [
		FormsModule,
		MatButtonModule,
		MatIconModule,
		MatCheckboxModule,
		MatDialogActions,
		MatDialogContent,
		MatDialogTitle
	],
	templateUrl: './dialog.component.html',
	styleUrl: './dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogComponent {
	readonly dialogRef = inject(MatDialogRef<DialogComponent>);
	force = false;

	constructor(@Inject(MAT_DIALOG_DATA) public data: DialogOptions) {}

	close(type: 'confirm' | 'cancel'): void {
		this.dialogRef.close();

		if (type === 'confirm') {
			if (this.force && this.data.forceConfirmCallback) {
				this.data.forceConfirmCallback();
			} else if (this.data.confirmCallback) {
				this.data.confirmCallback();
			}
		} else if (type === 'cancel' && this.data.cancelCallback) {
			this.data.cancelCallback();
		}
	}
}
