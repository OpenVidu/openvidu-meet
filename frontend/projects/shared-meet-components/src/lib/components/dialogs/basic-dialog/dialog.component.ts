import { ChangeDetectionStrategy, Component, Inject, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogActions, MatDialogContent, MatDialogRef, MatDialogTitle } from '@angular/material/dialog';
import type { DialogOptions } from '@lib/models';

@Component({
	selector: 'ov-dialog',
	standalone: true,
	imports: [FormsModule, MatButtonModule, MatIconModule, MatCheckboxModule, MatDialogActions, MatDialogContent, MatDialogTitle],
	template: ` <div class="dialog-container">
		<h2 mat-dialog-title class="dialog-title ov-text-center">
			<mat-icon class="dialog-icon">{{ getDialogIcon() }}</mat-icon>
			{{ data.title }}
		</h2>
		<mat-dialog-content>
			<div class="dialog-message" [innerHTML]="data.message"></div>
			@if (data.showForceCheckbox) {
				<div class="force-checkbox-container">
					<mat-checkbox
						[(ngModel)]="forceDelete"
						class="force-checkbox"
						color="warn"
					>
						<span class="checkbox-text">{{ data.forceCheckboxText }}</span>
					</mat-checkbox>
					<div class="checkbox-warning">
						<mat-icon class="warning-icon">warning</mat-icon>
						<span class="warning-text">{{ data.forceCheckboxDescription }}</span>
					</div>
				</div>
			}
		</mat-dialog-content>
		<mat-dialog-actions class="dialog-action">
			<button mat-button mat-dialog-close (click)="close('cancel')" class="cancel-button">
				{{ data.cancelText }}
			</button>
			<button
				mat-flat-button
				mat-dialog-close
				cdkFocusInitial
				(click)="close('confirm')"
				class="confirm-button"
				[class.force-delete]="forceDelete"
			>
				{{ data.confirmText }}
			</button>
		</mat-dialog-actions>
	</div>`,
	styleUrl: './dialog.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogComponent {
	readonly dialogRef = inject(MatDialogRef<DialogComponent>);
	forceDelete = false;

	constructor(@Inject(MAT_DIALOG_DATA) public data: DialogOptions) {}

	close(type: 'confirm' | 'cancel'): void {
		this.dialogRef.close();
		if (type === 'confirm') {
			if (this.forceDelete && this.data.forceConfirmCallback) {
				this.data.forceConfirmCallback();
			} else if (this.data.confirmCallback) {
				this.data.confirmCallback();
			}
		} else if (type === 'cancel' && this.data.cancelCallback) {
			this.data.cancelCallback();
		}
	}

	getDialogIcon(): string {
		if (this.data.title?.toLowerCase().includes('delete')) {
			return 'delete_outline';
		}
		if (this.data.title?.toLowerCase().includes('warning')) {
			return 'warning';
		}
		if (this.data.title?.toLowerCase().includes('error')) {
			return 'error_outline';
		}
		return 'help_outline';
	}
}
