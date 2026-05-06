import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { RecordingDialogData } from '../../models/dialog.model';
import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * @internal
 */
@Component({
    selector: 'app-recording-dialog',
	imports: [MatButtonModule, MatDialogModule, TranslatePipe],
    template: `
		<div mat-dialog-content>
			<video #videoElement controls autoplay [src]="src()" (error)="handleError()"></video>
		</div>
		@if (showActionButtons()) {
			<div mat-dialog-actions align="end">
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
			video {
				max-height: 64vh;
				max-width: 100%;
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
export class RecordingDialogComponent {
	private readonly dialogRef = inject(MatDialogRef<RecordingDialogComponent>);
	private readonly data = signal(inject<RecordingDialogData>(MAT_DIALOG_DATA));
	readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');
	readonly src = computed(() => this.data().src);
	readonly showActionButtons = computed(() => this.data().showActionButtons);

	close() {
		this.dialogRef.close({ manageError: false, error: null });
	}

	handleError() {
		const videoElement = this.videoElement();
		if (!videoElement) return;
		this.dialogRef.close({ manageError: true, error: videoElement.nativeElement.error });
	}
}
