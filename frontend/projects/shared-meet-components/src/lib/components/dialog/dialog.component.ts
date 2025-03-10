import { ChangeDetectionStrategy, Component, Inject, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef } from '@angular/material/dialog';
import type { DialogOptions } from '../../models';

@Component({
	selector: 'ov-dialog',
	standalone: true,
	imports: [MatButtonModule, MatDialogActions, MatDialogContent],
	template: ` <h2 mat-dialog-title class="dialog-title">{{ data.title }}</h2>
		<mat-dialog-content> {{ data.message }} </mat-dialog-content>
		<mat-dialog-actions class="dialog-action">
			<button mat-button mat-dialog-close (click)="close('cancel')">{{ data.cancelText }}</button>
			<button mat-flat-button mat-dialog-close cdkFocusInitial (click)="close('confirm')">
				{{ data.confirmText }}
			</button>
		</mat-dialog-actions>`,
	styleUrl: './dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogComponent {
	readonly dialogRef = inject(MatDialogRef<DialogComponent>);

	constructor(@Inject(MAT_DIALOG_DATA) public data: DialogOptions) {}

	close(type: 'confirm' | 'cancel'): void {
		this.dialogRef.close();
		if (type === 'confirm' && this.data.confirmCallback) {
			this.data.confirmCallback();
		} else if (type === 'cancel' && this.data.cancelCallback) {
			this.data.cancelCallback();
		}
	}
}
