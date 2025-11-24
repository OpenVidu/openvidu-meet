import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { MeetLayoutMode } from '../../../models/layout.model';

/**
 * Component for additional settings in the Settings Panel.
 * This component allows users to configure grid layout preferences including:
 * - Layout mode (Mosaic or Mosaic Smart)
 * - Number of participants to display in Smart mode
 */
@Component({
	selector: 'ov-meeting-settings-panel',
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
	templateUrl: './meeting-settings-panel.component.html',
	styleUrl: './meeting-settings-panel.component.scss'
})
export class MeetingSettingsPanelComponent {
	/**
	 * Expose LayoutMode enum to template
	 */
	readonly LayoutMode = MeetLayoutMode;

	/**
	 * Current selected layout mode
	 */
	layoutMode = signal<MeetLayoutMode>(MeetLayoutMode.MOSAIC);

	/**
	 * Number of participants to display in Smart mode
	 * Range: 1-20
	 */
	participantCount = signal<number>(6);

	/**
	 * Computed property to check if Smart mode is active
	 */
	isSmartMode = computed(() => this.layoutMode() === MeetLayoutMode.SMART_MOSAIC);

	/**
	 * Handler for layout mode change
	 */
	onLayoutModeChange(mode: MeetLayoutMode): void {
		this.layoutMode.set(mode);
		console.log('Layout mode changed to:', mode);
		// TODO: Integrate with layout service when available
	}

	/**
	 * Handler for participant count change
	 */
	onParticipantCountChange(count: number): void {
		this.participantCount.set(count);
		console.log('Participant count changed to:', count);
		// TODO: Integrate with layout service when available
	}

	/**
	 * Format label for the participant count slider
	 */
	formatLabel(value: number): string {
		return `${value}`;
	}
}
