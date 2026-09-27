import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MEET_BROADCAST_MAX_DESTINATIONS, MeetBroadcastDestination } from '@openvidu-meet/typings';
import { PlatformIconComponent } from '../../../../../../shared/components/platform-icon/platform-icon.component';
import { LayoutPickerComponent } from '../../../../components/layout-picker/layout-picker.component';
import { TranslatePipe } from '../../../../../../shared/pipes/translate.pipe';
import {
	BROADCAST_PLATFORM_LABELS,
	detectBroadcastPlatform,
	isRedactedStreamUrl
} from '../../../../../../shared/utils/broadcast-platform.utils';
import { BROADCAST_MBPS_PER_DESTINATION } from '../../../../../../shared/models/broadcast.model';
import { BroadcastFormGroup, BroadcastFormValue } from '../../../../models/wizard-forms.model';
import { WizardStepId } from '../../../../models/wizard.model';
import { RoomWizardStateService } from '../../../../services/wizard-state.service';

const DESTINATION_NAME_MAX_LENGTH = 50;

/** No destination being edited; `-1` is a new one, any other index the destination at that position. */
const NOT_EDITING = null;
const NEW_DESTINATION = -1;

const rtmpUrlValidator = (control: AbstractControl<string>): ValidationErrors | null => {
	const value = control.value.trim();

	if (!value) return null;

	try {
		const { protocol } = new URL(value);
		return protocol === 'rtmp:' || protocol === 'rtmps:' ? null : { rtmpUrl: true };
	} catch {
		return { rtmpUrl: true };
	}
};

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
	readonly maxDestinations = MEET_BROADCAST_MAX_DESTINATIONS;
	readonly mbpsPerDestination = BROADCAST_MBPS_PER_DESTINATION;

	readonly destinationForm = this.formBuilder.nonNullable.group({
		name: ['', [Validators.required, Validators.maxLength(DESTINATION_NAME_MAX_LENGTH)]],
		url: ['', [Validators.required, rtmpUrlValidator]]
	});

	readonly editingIndex = signal<number | null>(NOT_EDITING);
	readonly destinations = signal<MeetBroadcastDestination[]>([]);
	readonly estimatedMbps = computed(() => this.destinations().length * this.mbpsPerDestination);
	readonly canAddDestination = computed(
		() => this.editingIndex() === NOT_EDITING && this.destinations().length < this.maxDestinations
	);

	private readonly editedUrl = toSignal(this.destinationForm.controls.url.valueChanges, { initialValue: '' });
	/** The platform the URL being typed streams to, as soon as its host says so. */
	readonly detectedPlatform = computed(() => detectBroadcastPlatform(this.editedUrl()));
	readonly detectedPlatformLabel = computed(() => BROADCAST_PLATFORM_LABELS[this.detectedPlatform()]);
	/** Editing a saved destination: its URL comes redacted and keeps its stream key unless replaced. */
	readonly keepsSavedKey = computed(() => isRedactedStreamUrl(this.editedUrl()));

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
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);
		return meetingStep?.formGroup.controls.e2eeEnabled.value ?? false;
	}

	platformOf(url: string) {
		return detectBroadcastPlatform(url);
	}

	openAdd(): void {
		this.destinationForm.reset({ name: '', url: '' });
		this.editingIndex.set(NEW_DESTINATION);
	}

	openEdit(index: number): void {
		const { name, url } = this.destinations()[index];
		this.destinationForm.reset({ name, url });
		this.editingIndex.set(index);
	}

	closeEditor(): void {
		this.editingIndex.set(NOT_EDITING);
	}

	submitDestination(): void {
		if (this.destinationForm.invalid) {
			this.destinationForm.markAllAsTouched();
			return;
		}

		const index = this.editingIndex();

		if (index === NOT_EDITING) return;

		const { name, url } = this.destinationForm.getRawValue();
		const destinations = [...this.destinations()];
		const destination = {
			...(index === NEW_DESTINATION ? {} : destinations[index]),
			name: name.trim(),
			url: url.trim()
		};

		if (index === NEW_DESTINATION) {
			destinations.push(destination);
		} else {
			destinations[index] = destination;
		}

		this.setDestinations(destinations);
		this.closeEditor();
	}

	removeDestination(index: number): void {
		this.setDestinations(this.destinations().filter((_, position) => position !== index));

		if (this.editingIndex() === index) {
			this.closeEditor();
		}
	}

	goToRoomAccess(): void {
		this.wizardService.goToStepById(WizardStepId.ROOM_ACCESS);
	}

	onBroadcastToggleChange(event: MatSlideToggleChange): void {
		const meetingStep = this.wizardService.getStepById(WizardStepId.MEETING);

		if (!meetingStep) return;

		const e2eeControl = meetingStep.formGroup.controls.e2eeEnabled;

		if (event.checked) {
			if (e2eeControl.value) {
				this.wizardService.rememberE2EEStateBeforeFeature('broadcast', true);
				this.setE2EEEnabled(e2eeControl, false);
			}

			return;
		}

		const previousE2EEState = this.wizardService.takeE2EEStateBeforeFeature('broadcast');

		if (previousE2EEState !== undefined) {
			this.setE2EEEnabled(e2eeControl, previousE2EEState);
		}
	}

	private setE2EEEnabled(control: AbstractControl<boolean>, enabled: boolean): void {
		control.patchValue(enabled, { emitEvent: true });
		this.wizardService.updateStepData({ config: { e2ee: { enabled } } });
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
