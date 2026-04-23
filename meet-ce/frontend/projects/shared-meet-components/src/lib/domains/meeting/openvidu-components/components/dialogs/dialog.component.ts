import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { DialogData } from '../../models/dialog.model';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * @internal
 */

@Component({
    selector: 'ov-dialog-template',
	imports: [MatButtonModule, MatDialogModule, TranslatePipe],
    template: `
		<h1 mat-dialog-title>{{ title() }}</h1>
		<div mat-dialog-content id="openvidu-dialog">{{ description() }}</div>
		@if (showActionButtons()) {
			<div mat-dialog-actions>
				<button mat-button [disableRipple]="true" (click)="close()">{{ 'PANEL.CLOSE' | translate }}</button>
			</div>
		}
	`,
    styles: [
        `
			::ng-deep .mat-mdc-dialog-content {
				color: var(--ov-text-surface-color) !important;
			}

			::ng-deep .mat-mdc-dialog-surface {
				background-color: var(--ov-surface-color);
				border-radius: var(--ov-surface-radius);
			}
			.mat-mdc-button,
			.mat-mdc-button:not(:disabled),
			::ng-deep .mat-mdc-button .mat-mdc-button-persistent-ripple::before {
				color: var(--ov-text-primary-color);
				background-color: var(--ov-primary-action-color) !important;
				border-radius: var(--ov-surface-radius);
			}
		`
    ],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogTemplateComponent {
	private readonly dialogRef = inject(MatDialogRef<DialogTemplateComponent>);
	private readonly data = signal(inject<DialogData>(MAT_DIALOG_DATA));
	readonly title = computed(() => this.data().title);
	readonly description = computed(() => this.data().description);
	readonly showActionButtons = computed(() => this.data().showActionButtons);

	close() {
		this.dialogRef.close();
	}
}
