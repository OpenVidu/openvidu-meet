import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DialogData } from '../../models/dialog.model';
import { AppMaterialModule } from '../../openvidu-components-angular.material.module';
import { TranslatePipe } from '../../pipes/translate.pipe';


/**
 * @internal
 */

@Component({
    selector: 'ov-pro-feature-template',
	imports: [AppMaterialModule, TranslatePipe],
    template: `
		<h1 mat-dialog-title>{{ title() }}</h1>
		<div mat-dialog-content>{{ description() }}</div>
		@if (showActionButtons()) {
			<div mat-dialog-actions>
				<button mat-button (click)="seeMore()">
					<span>{{ 'PANEL.SEE_MORE' | translate }}</span>
					<mat-icon>open_in_new</mat-icon>
				</button>
				<button mat-button (click)="close()">{{ 'PANEL.CLOSE' | translate }}</button>
			</div>
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProFeatureDialogTemplateComponent {
	private readonly dialogRef = inject(MatDialogRef<ProFeatureDialogTemplateComponent>);
	private readonly data = signal(inject<DialogData>(MAT_DIALOG_DATA));
	readonly title = computed(() => this.data().title);
	readonly description = computed(() => this.data().description);
	readonly showActionButtons = computed(() => this.data().showActionButtons);

	close() {
		this.dialogRef.close();
	}

	seeMore() {
		window.open('https://openvidu.io/pricing/#openvidu-pro', '_blank')?.focus();
	}
}
