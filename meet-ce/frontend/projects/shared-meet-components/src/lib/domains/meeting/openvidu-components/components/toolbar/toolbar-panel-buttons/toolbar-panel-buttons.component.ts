import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, TemplateRef, computed, inject, input, output } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ViewportService } from '../../../services/viewport/viewport.service';

@Component({
	selector: 'ov-toolbar-panel-buttons',
	imports: [CommonModule, MatBadgeModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslatePipe],
	templateUrl: './toolbar-panel-buttons.component.html',
	styleUrl: './toolbar-panel-buttons.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class ToolbarPanelButtonsComponent {
	// Signal inputs from toolbar
	isConnectionLost = input<boolean>(false);
	isActivitiesOpened = input<boolean>(false);
	isParticipantsOpened = input<boolean>(false);
	isChatOpened = input<boolean>(false);
	unreadMessages = input<number>(0);
	showActivitiesPanelButton = input<boolean>(true);
	showParticipantsPanelButton = input<boolean>(true);
	showChatPanelButton = input<boolean>(true);
	recordingStatus = input<any>();
	toolbarAdditionalPanelButtonsTemplate = input<TemplateRef<any> | undefined>();
	totalParticipants = input<number>(0);

	// Signal outputs back to toolbar
	toggleActivitiesPanel = output<string | undefined>();
	toggleParticipantsPanel = output<void>();
	toggleChatPanel = output<void>();

	// Computed signals
	visibleButtonsCount = computed(() => {
		let count = 0;
		if (this.showActivitiesPanelButton()) count++;
		if (this.showParticipantsPanelButton()) count++;
		if (this.showChatPanelButton()) count++;
		return count;
	});

	isAnyPanelOpened = computed(() => {
		return this.isActivitiesOpened() || this.isParticipantsOpened() || this.isChatOpened();
	});

	readonly viewportService = inject(ViewportService);

	// Computed signal to determine if we should show collapsed menu
	readonly shouldShowCollapsed = computed(() => {
		return this.viewportService.isMobileView();
	});

	// Local methods that emit events
	onToggleActivities(expand?: string) {
		this.toggleActivitiesPanel.emit(expand);
	}

	onToggleParticipants() {
		this.toggleParticipantsPanel.emit();
	}

	onToggleChat() {
		this.toggleChatPanel.emit();
	}
}
