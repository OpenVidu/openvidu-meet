import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MeetLayoutMode } from '../../../models/layout.model';
import { MeetLayoutService } from '../../../services/layout.service';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';

/**
 * Component for additional settings in the Settings Panel.
 */
@Component({
	selector: 'ov-meeting-settings-extensions',
	imports: [
		CommonModule,
		MatIconModule,
		MatListModule,
		MatRadioModule,
		MatSliderModule,
		MatFormFieldModule,
		MatSelectModule,
		FormsModule
	],
	templateUrl: './meeting-settings-extensions.component.html',
	styleUrl: './meeting-settings-extensions.component.scss'
})
export class MeetingSettingsExtensionsComponent {
	private readonly layoutService = inject(MeetLayoutService);
	protected readonly meetingContextService = inject(MeetingContextService);

	/**
	 * Expose LayoutMode enum to template
	 */
	readonly LayoutMode = MeetLayoutMode;

	/**
	 * Whether the layout selector feature is enabled
	 */
	protected readonly showLayoutSelector = this.meetingContextService.showLayoutSelector;

	/**
	 * Current layout mode
	 */
	protected readonly layoutMode = computed(() => this.layoutService.layoutMode());

	/**
	 * Current participant count
	 */
	protected readonly participantCount = computed(() => this.layoutService.maxRemoteSpeakers());

	/**
	 * Computed property to check if Smart Mosaic mode is active
	 */
	readonly isSmartMode = this.layoutService.isSmartMosaicEnabled;

	/**
	 * Handler for layout mode change
	 */
	onLayoutModeChange(mode: MeetLayoutMode): void {
		this.layoutService.setLayoutMode(mode);
	}

	/**
	 * Handler for participant count change
	 */
	onParticipantCountChange(count: number): void {
		this.layoutService.setMaxRemoteSpeakers(count);
	}

	/**
	 * Format label for the participant count slider
	 */
	formatLabel(value: number): string {
		return `${value}`;
	}
}
