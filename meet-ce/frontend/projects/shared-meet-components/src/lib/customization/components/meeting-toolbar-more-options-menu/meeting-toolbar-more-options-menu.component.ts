import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PanelService, ViewportService, PanelType } from 'openvidu-components-angular';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';

/**
 * Component for additional menu items in the toolbar's "More Options" menu.
 * This component handles custom actions like opening the settings panel for grid layout changes.
 */
@Component({
  selector: 'ov-meeting-toolbar-more-options-menu',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule
  ],
  templateUrl: './meeting-toolbar-more-options-menu.component.html',
  styleUrl: './meeting-toolbar-more-options-menu.component.scss'
})
export class MeetingToolbarMoreOptionsMenuComponent {
  /**
   * Viewport service for responsive behavior detection
   * Injected from openvidu-components-angular
   */
  private viewportService = inject(ViewportService);

  /**
   * Panel service for opening/closing panels
   * Injected from openvidu-components-angular
   */
  private panelService = inject(PanelService);

  /**
   * Meeting context service for feature flags
   */
  private meetingContextService = inject(MeetingContextService);

  /**
   * Computed properties for responsive button behavior
   * These follow the same pattern as toolbar-media-buttons component
   */
  readonly isMobileView = computed(() => this.viewportService.isMobile());
  readonly isTabletView = computed(() => this.viewportService.isTablet());
  readonly isDesktopView = computed(() => this.viewportService.isDesktop());

  /**
   * Whether the layout selector feature is enabled
   */
  readonly showLayoutSelector = computed(() => this.meetingContextService.showLayoutSelector());

  /**
   * Opens the settings panel to allow users to change grid layout
   */
  onOpenSettings(): void {
    this.panelService.togglePanel(PanelType.SETTINGS);
  }
}
