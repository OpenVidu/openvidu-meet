import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetBroadcastDestination } from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../shared/components/platform-icon/platform-icon.component';
import { E2eeExclusionWarningComponent } from '../../../../components/e2ee-exclusion-warning/e2ee-exclusion-warning.component';
import { LayoutPickerComponent } from '../../../../components/layout-picker/layout-picker.component';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import { DestinationEditor } from '../../../../../../shared/utils/broadcast-destination-editor';
import { detectBroadcastPlatform } from '../../../../../../shared/utils/broadcast-platform.utils';
import { BROADCAST_MBPS_PER_DESTINATION, broadcastUploadMbps } from '../../../../../../shared/models/broadcast.model';
import { BroadcastFormGroup, BroadcastFormValue } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

const NEW_DESTINATION = 'new';

@Component({
	selector: 'ov-broadcast-config',
	imports: [
		NgTemplateOutlet,
		ReactiveFormsModule,
		MatButtonModule,
		MatFormFieldModule,
		MatIconModule,
		MatInputModule,
		MatSlideToggleModule,
		MatTooltipModule,
		PlatformIconComponent,
		E2eeExclusionWarningComponent,
		LayoutPickerComponent,
		TranslatePipe
	],
	templateUrl: './broadcast-config.component.html',
	styleUrl: './broadcast-config.component.scss'
})
export class BroadcastConfigComponent {
	private readonly wizardService = inject(RoomWizardStateService);
	private readonly formBuilder = inject(FormBuilder);

	readonly broadcastForm: BroadcastFormGroup;
	readonly mbpsPerDestination = BROADCAST_MBPS_PER_DESTINATION;

	readonly editor = new DestinationEditor(this.formBuilder);
	readonly editing = signal<MeetBroadcastDestination | typeof NEW_DESTINATION | null>(null);
	readonly isEditorOpen = computed(() => this.editing() !== null);
	readonly isAddingNew = computed(() => this.editing() === NEW_DESTINATION);
	readonly destinations = signal<MeetBroadcastDestination[]>([]);
	readonly estimatedMbps = computed(() => broadcastUploadMbps(this.destinations().length));
	readonly canAddDestination = computed(() => !this.isEditorOpen());

	constructor() {
		const broadcastStep = this.wizardService.getStepById(WizardStepId.BROADCAST);

		if (!broadcastStep) {
			throw new Error('broadcast step not found in wizard state');
		}

		this.broadcastForm = broadcastStep.formGroup;
		this.destinations.set(this.broadcastForm.controls.destinations.value);

		this.broadcastForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
			const value = this.broadcastForm.getRawValue();
			this.destinations.set(value.destinations);
			this.saveFormData(value);
		});
	}

	get isBroadcastEnabled(): boolean {
		return this.broadcastForm.controls.broadcastEnabled.value;
	}

	get isE2EEEnabled(): boolean {
		return this.wizardService.isE2EEEnabled();
	}

	platformOf(url: string) {
		return detectBroadcastPlatform(url);
	}

	openAdd(): void {
		this.editor.open();
		this.editing.set(NEW_DESTINATION);
	}

	openEdit(destination: MeetBroadcastDestination): void {
		this.editor.open({ name: destination.name, url: destination.url }, destination.url);
		this.editing.set(destination);
	}

	closeEditor(): void {
		this.editing.set(null);
	}

	submitDestination(): void {
		const editing = this.editing();
		const edited = this.editor.submit();

		if (editing === null || !edited) return;

		this.setDestinations(
			editing === NEW_DESTINATION
				? [...this.destinations(), edited]
				: this.destinations().map((destination) =>
						destination === editing ? { ...destination, ...edited } : destination
					)
		);
		this.closeEditor();
	}

	removeDestination(removed: MeetBroadcastDestination): void {
		this.setDestinations(this.destinations().filter((destination) => destination !== removed));

		if (this.editing() === removed) {
			this.closeEditor();
		}
	}

	goToRoomAccess(): void {
		this.wizardService.goToStepById(WizardStepId.ROOM_ACCESS);
	}

	onBroadcastToggleChange(event: MatSlideToggleChange): void {
		this.wizardService.setFeatureEnabled('broadcast', event.checked);
	}

	private setDestinations(destinations: MeetBroadcastDestination[]): void {
		this.broadcastForm.controls.destinations.setValue(destinations);
		this.broadcastForm.controls.destinations.markAsDirty();
	}

	private saveFormData(formValue: BroadcastFormValue): void {
		this.wizardService.updateStepData({
			config: {
				broadcast: {
					enabled: formValue.broadcastEnabled,
					destinations: formValue.destinations,
					layout: formValue.layout
				}
			}
		});
	}
}
