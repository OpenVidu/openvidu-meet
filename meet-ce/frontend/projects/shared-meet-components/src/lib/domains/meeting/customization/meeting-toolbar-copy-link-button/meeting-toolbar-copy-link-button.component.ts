import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RoomAccessLinkService } from '../../services/room-access-link.service';

/**
 * Toolbar button that copies the meeting speaker (access) link.
 *
 * Purely presentational: its visibility is decided by the parent
 * (MeetingToolbarExtraButtonsComponent). On mobile it renders as a menu item.
 */
@Component({
	selector: 'ov-meeting-toolbar-copy-link-button',
	templateUrl: './meeting-toolbar-copy-link-button.component.html',
	styleUrl: './meeting-toolbar-copy-link-button.component.scss',
	imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class MeetingToolbarCopyLinkButtonComponent {
	protected roomAccessLinkService = inject(RoomAccessLinkService);

	/** Whether the device is mobile (affects button style) */
	isMobile = input<boolean>(false);

	onCopyLinkClick(): void {
		void this.roomAccessLinkService.copyRoomAccessLink();
	}
}
