import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PanelService, PanelType, ViewportService } from 'openvidu-components-angular';
import { MeetingContextService } from '../../services/meeting-context.service';

/**
 * Component for additional menu items in the toolbar's "More Options" menu.
 * This component handles custom actions like opening the settings panel for grid layout changes.
 */
@Component({
	selector: 'ov-meeting-toolbar-more-options-menu',
	imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule, MatTooltipModule],
	templateUrl: './meeting-toolbar-more-options-menu.component.html',
	styleUrl: './meeting-toolbar-more-options-menu.component.scss'
})
export class MeetingToolbarMoreOptionsMenuComponent {
	private meetingContextService = inject(MeetingContextService);
	private viewportService = inject(ViewportService);
	private panelService = inject(PanelService);

	isMobileView = this.viewportService.isMobile;
	isLayoutSwitchingAllowed = this.meetingContextService.allowLayoutSwitching;

	/**
	 * Opens the settings panel to allow users to change grid layout
	 */
	onOpenSettings(): void {
		this.panelService.togglePanel(PanelType.SETTINGS);
	}
}
