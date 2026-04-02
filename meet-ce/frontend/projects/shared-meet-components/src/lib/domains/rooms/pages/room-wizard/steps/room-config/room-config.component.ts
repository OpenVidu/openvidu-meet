import { Component, OnDestroy } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MeetRoomMediaMode, MeetScreenShareAccess } from '@openvidu-meet/typings';
import { Subject, takeUntil } from 'rxjs';
import { RoomWizardStateService } from '../../../../services';

@Component({
	selector: 'ov-room-config',
	imports: [
		ReactiveFormsModule,
		MatCardModule,
		MatIconModule,
		MatSlideToggleModule,
		MatFormFieldModule,
		MatSelectModule
	],
	templateUrl: './room-config.component.html',
	styleUrl: './room-config.component.scss'
})
export class RoomConfigComponent implements OnDestroy {
	configForm: FormGroup;
	readonly mediaModeOptions = [
		{ value: MeetRoomMediaMode.STANDARD, label: 'Standard (audio + video)' },
		{ value: MeetRoomMediaMode.VIDEO_DISABLED, label: 'Video disabled (audio only camera off)' },
		{ value: MeetRoomMediaMode.AUDIO_ONLY, label: 'Audio-only room (camera and screen share off)' }
	];
	readonly screenShareAccessOptions = [
		{ value: MeetScreenShareAccess.ADMIN, label: 'Admin only' },
		{ value: MeetScreenShareAccess.ADMIN_MODERATOR, label: 'Admin and moderators' },
		{ value: MeetScreenShareAccess.ADMIN_MODERATOR_SPEAKER, label: 'All users' }
	];

	private destroy$ = new Subject<void>();
	// Store the previous recording state before E2EE disables it
	private recordingStateBeforeE2EE: string | null = null;

	constructor(private wizardService: RoomWizardStateService) {
		const currentStep = this.wizardService.currentStep();
		this.configForm = currentStep!.formGroup;

		this.configForm.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
			this.saveFormData(value);
		});
	}

	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	private saveFormData(formValue: any): void {
		const stepData: any = {
			config: {
				chat: {
					enabled: formValue.chatEnabled ?? false
				},
				virtualBackground: {
					enabled: formValue.virtualBackgroundEnabled ?? false
				},
				e2ee: {
					enabled: formValue.e2eeEnabled ?? false
				},
				media: {
					mode: formValue.mediaMode ?? MeetRoomMediaMode.STANDARD
				},
				screenShare: {
					allowAccessTo: formValue.screenShareAccess ?? MeetScreenShareAccess.ADMIN_MODERATOR_SPEAKER
				},
				captions: {
					enabled: formValue.captionsEnabled ?? false
				}
			}
		};

		this.wizardService.updateStepData('config', stepData);
	}

	onE2EEToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({
			e2eeEnabled: isEnabled
		});

		const recordingStep = this.wizardService.steps().find((step) => step.id === 'recording');
		if (!recordingStep) return;

		if (isEnabled) {
			// Save the current recording state before disabling it
			const currentRecordingValue = recordingStep.formGroup.get('recordingEnabled')?.value;

			// Only save if it's not already 'disabled' (to preserve user's original choice)
			if (currentRecordingValue !== 'disabled') {
				this.recordingStateBeforeE2EE = currentRecordingValue;
			}

			// Disable recording automatically
			recordingStep.formGroup.patchValue(
				{
					recordingEnabled: 'disabled'
				},
				{ emitEvent: true }
			);
		} else {
			// Restore the previous recording state when E2EE is disabled
			if (this.recordingStateBeforeE2EE !== null) {
				recordingStep.formGroup.patchValue(
					{
						recordingEnabled: this.recordingStateBeforeE2EE
					},
					{ emitEvent: true }
				);

				// Clear the saved state
				this.recordingStateBeforeE2EE = null;
			}
		}
	}

	onChatToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ chatEnabled: isEnabled });
	}

	onVirtualBackgroundToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ virtualBackgroundEnabled: isEnabled });
	}

	onCaptionsToggleChange(event: any): void {
		const isEnabled = event.checked;
		this.configForm.patchValue({ captionsEnabled: isEnabled });
	}

	onMediaModeChange(mode: MeetRoomMediaMode): void {
		this.configForm.patchValue({ mediaMode: mode });
	}

	onScreenShareAccessChange(access: MeetScreenShareAccess): void {
		this.configForm.patchValue({ screenShareAccess: access });
	}

	get chatEnabled(): boolean {
		return this.configForm.value.chatEnabled || false;
	}

	get virtualBackgroundEnabled(): boolean {
		return this.configForm.value.virtualBackgroundEnabled ?? false;
	}

	get e2eeEnabled(): boolean {
		return this.configForm.value.e2eeEnabled ?? false;
	}

	get captionsEnabled(): boolean {
		return this.configForm.value.captionsEnabled ?? false;
	}

	get mediaMode(): MeetRoomMediaMode {
		return this.configForm.value.mediaMode ?? MeetRoomMediaMode.STANDARD;
	}

	get screenShareAccess(): MeetScreenShareAccess {
		return this.configForm.value.screenShareAccess ?? MeetScreenShareAccess.ADMIN_MODERATOR_SPEAKER;
	}

	get isRoomVideoEnabled(): boolean {
		return this.mediaMode === MeetRoomMediaMode.STANDARD;
	}

	get isRoomAudioEnabled(): boolean {
		return true;
	}

	get isRoomScreenShareEnabled(): boolean {
		return this.mediaMode !== MeetRoomMediaMode.AUDIO_ONLY;
	}

	get screenShareAccessLabel(): string {
		switch (this.screenShareAccess) {
			case MeetScreenShareAccess.ADMIN:
				return 'Admin only';
			case MeetScreenShareAccess.ADMIN_MODERATOR:
				return 'Admin and moderators';
			case MeetScreenShareAccess.ADMIN_MODERATOR_SPEAKER:
			default:
				return 'All users';
		}
	}
}
