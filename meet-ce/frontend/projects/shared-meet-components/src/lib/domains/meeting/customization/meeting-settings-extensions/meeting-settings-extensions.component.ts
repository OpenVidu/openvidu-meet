import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MeetLayoutMode } from '../../models/layout.model';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingLayoutService } from '../../services/meeting-layout.service';

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
	protected readonly meetingContextService = inject(MeetingContextService);
	private readonly layoutService = inject(MeetingLayoutService);

	/** Whether the layout switching feature is allowed */
	showLayoutSelector = computed(() => this.meetingContextService.meetingUI().showLayoutSelector);
	/** Expose LayoutMode enum to template */
	LayoutMode = MeetLayoutMode;
	/** Current layout mode */
	layoutMode = this.layoutService.layoutMode;
	/** Whether Smart Mosaic layout is enabled */
	isSmartMode = this.layoutService.isSmartMosaicEnabled;

	/** Minimum number of participants that can be shown when Smart Mosaic layout is enabled */
	minParticipants = this.layoutService.MIN_REMOTE_SPEAKERS;
	/** Maximum number of participants that can be shown */
	maxParticipants = this.layoutService.MAX_REMOTE_SPEAKERS_LIMIT;
	/** Current participant count */
	participantCount = this.layoutService.maxRemoteSpeakers;

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
