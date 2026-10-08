import { Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ParticipantService, SmartLayoutMode, SmartLayoutService } from '../../openvidu-components';

/** Participants hidden behind the "+N" tile in the Smart Mosaic picture. */
const PICTURED_HIDDEN_PARTICIPANTS = 3;

/**
 * Content of the settings panel's Layout tab: the layout mode and, in Smart Mosaic, how many
 * remote participants stay visible.
 */
@Component({
	selector: 'ov-meeting-settings-extensions',
	imports: [MatIconModule, TranslatePipe],
	templateUrl: './meeting-settings-extensions.component.html',
	styleUrl: './meeting-settings-extensions.component.scss'
})
export class MeetingSettingsExtensionsComponent {
	private readonly layoutService = inject(SmartLayoutService);
	private readonly participantService = inject(ParticipantService);

	readonly layoutMode = this.layoutService.layoutMode;
	readonly isSmartLayoutEnabled = this.layoutService.isSmartLayoutEnabled;
	readonly participantCount = this.layoutService.maxVisibleRemoteParticipants;

	private readonly ownCameraStream = computed(() =>
		this.participantService
			.localParticipant()
			?.streams()
			.find((stream) => stream.isCameraStream)
	);
	readonly isOwnVideoFloating = computed(() => this.ownCameraStream()?.isFloating ?? false);
	readonly isOwnVideoPinned = computed(() => this.ownCameraStream()?.isPinned ?? false);

	private readonly minCount = this.layoutService.MIN_VISIBLE_REMOTE_PARTICIPANTS;
	private readonly maxCount = this.layoutService.MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT;
	readonly participantCounts = Array.from({ length: this.maxCount - this.minCount + 1 }, (_, i) => this.minCount + i);

	readonly modes = computed(() => [
		{
			mode: SmartLayoutMode.MOSAIC,
			id: 'layout-mosaic',
			titleKey: 'LAYOUT_SETTINGS.MOSAIC',
			descriptionKey: 'LAYOUT_SETTINGS.MOSAIC_DESC',
			columns: 3,
			tiles: Array.from({ length: 9 }, () => '')
		},
		{
			mode: SmartLayoutMode.SMART_MOSAIC,
			id: 'layout-smart-mosaic',
			titleKey: 'LAYOUT_SETTINGS.SMART_MOSAIC',
			descriptionKey: 'LAYOUT_SETTINGS.SMART_MOSAIC_DESC',
			columns: this.pictureColumns(this.participantCount() + 1),
			tiles: [...Array.from({ length: this.participantCount() }, () => ''), `+${PICTURED_HIDDEN_PARTICIPANTS}`]
		}
	]);

	selectMode(mode: SmartLayoutMode): void {
		this.layoutService.setLayoutMode(mode);
	}

	selectOwnVideoFloating(floating: boolean): void {
		this.participantService.setLocalCameraFloating(floating);
	}

	selectParticipantCount(count: number): void {
		this.layoutService.setMaxVisibleRemoteParticipants(count);
	}

	private pictureColumns(tiles: number): number {
		if (tiles <= 3) return tiles;

		if (tiles === 4) return 2;

		return tiles <= 6 ? 3 : 4;
	}
}
