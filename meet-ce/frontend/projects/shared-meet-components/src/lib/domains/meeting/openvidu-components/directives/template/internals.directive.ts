/**
 * The ***ovPreJoin** directive empowers you to substitute the default pre-join component template with a custom one.
 * This directive allows you to create a completely custom pre-join experience while maintaining the core functionality.
 *
 * @internal
 */

import { Directive, TemplateRef, ViewContainerRef, computed, inject, input } from '@angular/core';

@Directive({
	selector: '[ovPreJoin]'
})
export class PreJoinDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantPanelAfterLocalParticipant** directive allows you to inject custom HTML or Angular templates
 * immediately after the local participant item in the participant panel.
 * This enables you to extend the participant panel with additional controls, information, or UI elements.
 *
 * Usage example:
 * ```html
 * <ov-participant-panel>
 *   <ng-container *ovParticipantPanelAfterLocalParticipant>
 *     <div class="custom-content">
 *       <!-- Your custom HTML here -->
 *       <span>Custom content after local participant</span>
 *     </div>
 *   </ng-container>
 * </ov-participant-panel>
 * ```
 */
@Directive({
	selector: '[ovParticipantPanelAfterLocalParticipant]'
})
export class ParticipantPanelAfterLocalParticipantDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantsPanelHeaderActions** directive allows you to inject custom HTML or Angular
 * templates into the participants panel header, next to the close button: the place for
 * panel-wide moderation actions (e.g. muting every participant at once), as opposed to
 * **ovParticipantPanelItemElements**, which extends a single participant's row.
 *
 * Usage example:
 * ```html
 * <ov-participants-panel>
 *   <ng-container *ovParticipantsPanelHeaderActions>
 *     <button (click)="muteEveryone()">Mute all</button>
 *   </ng-container>
 * </ov-participants-panel>
 * ```
 */
@Directive({
	selector: '[ovParticipantsPanelHeaderActions]'
})
export class ParticipantsPanelHeaderActionsDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovLeaveButton** directive allows you to inject a custom leave button template. You can use the toolbarLeaveButton = false for
 * replacing the default leave button with your custom one.
 *
 * Usage example:
 * ```html
 * <ov-meeting-view [toolbarLeaveButton]="false">
 *   <ng-container *ovLeaveButton>
 *     <button class="my-leave-button" (click)="customLeave()">
 *       Leave meeting
 *     </button>
 *   </ng-container>
 * </ov-meeting-view>
 * ```
 */
@Directive({
	selector: '[ovToolbarLeaveButton]'
})
export class LeaveButtonDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovLayoutAdditionalElements** directive allows you to inject custom HTML or Angular templates
 * as additional layout elements within the videoconference UI.
 * This enables you to extend the layout with extra controls, banners, or any custom UI.
 *
 * You can specify a slot to control where the element is positioned:
 * - 'top': Position at the top of the layout (after local participant, before remote participants)
 * - 'bottom': Position at the bottom of the layout (after all participants)
 * - 'default' or no slot: Position after local participant (default behavior)
 *
 * Usage examples:
 * ```html
 * <ov-meeting-view>
 *   <!-- Default position (after local participant) -->
 *   <ng-container *ovLayoutAdditionalElements>
 *     <div class="my-banner">Banner</div>
 *   </ng-container>
 *
 *   <!-- Top position -->
 *   <ng-container *ovLayoutAdditionalElements="'top'">
 *     <div class="top-bar">Top Bar</div>
 *   </ng-container>
 *
 *   <!-- Bottom position -->
 *   <ng-container *ovLayoutAdditionalElements="'bottom'">
 *     <div class="bottom-info">Footer Info</div>
 *   </ng-container>
 * </ov-meeting-view>
 * ```
 */
@Directive({
	selector: '[ovLayoutAdditionalElements]'
})
export class LayoutAdditionalElementsDirective {
	/** Raw input value — the microsyntax `*ovLayoutAdditionalElements="'bottom'"` binds here. */
	readonly ovLayoutAdditionalElements = input<'top' | 'bottom' | 'default' | ''>('default');

	/** Normalised slot: empty string is treated as 'default'. */
	readonly slot = computed<'top' | 'bottom' | 'default'>(() => {
		const v = this.ovLayoutAdditionalElements();
		return v === 'top' || v === 'bottom' || v === 'default' ? v : 'default';
	});

	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantPanelParticipantBadge** directive allows you to inject custom badges or indicators
 * in the participant panel.
 * This enables you to add role indicators, status badges, or other visual elements.
 *
 * Usage example:
 * ```html
 * <ov-participants-panel>
 *   <div *ovParticipantPanelItem="let participant">
 *     <ov-participant-panel-item [participant]="participant">
 *       <!-- Custom badge for local participant only -->
 *       <ng-container *ovParticipantPanelParticipantBadge>
 *         <span class="moderator-badge">
 *           <mat-icon>admin_panel_settings</mat-icon>
 *           Moderator
 *         </span>
 *       </ng-container>
 *     </ov-participant-panel-item>
 *   </div>
 * </ov-participants-panel>
 * ```
 */
@Directive({
	selector: '[ovParticipantPanelParticipantBadge]'
})
export class ParticipantPanelParticipantBadgeDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovSettingsPanelGeneralAdditionalElements** directive allows you to inject custom HTML or Angular templates
 * into the general section of the settings panel.
 * This enables you to add custom controls, information, or UI elements to extend the settings panel functionality.
 *
 * Usage example:
 * ```html
 * <ov-meeting-view>
 *   <ng-container *ovSettingsPanelGeneralAdditionalElements>
 *     <div class="custom-settings-section">
 *       <mat-list>
 *         <mat-list-item>
 *           <mat-icon matListItemIcon>tune</mat-icon>
 *           <div matListItemTitle>Custom Setting</div>
 *           <mat-slide-toggle matListItemMeta [(ngModel)]="customSetting"></mat-slide-toggle>
 *         </mat-list-item>
 *       </mat-list>
 *     </div>
 *   </ng-container>
 * </ov-meeting-view>
 * ```
 *
 * @internal
 */
@Directive({
	selector: '[ovSettingsPanelGeneralAdditionalElements]'
})
export class SettingsPanelGeneralAdditionalElementsDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovToolbarMoreOptionsAdditionalMenuItems** directive allows you to inject custom HTML or Angular templates
 * into the "more options" menu (three dots button) of the toolbar.
 * This enables you to add custom menu items to extend the toolbar functionality.
 *
 * Usage example:
 * ```html
 * <ov-meeting-view>
 *   <ng-container *ovToolbarMoreOptionsAdditionalMenuItems>
 *     <button mat-menu-item (click)="onCustomAction()">
 *       <mat-icon>star</mat-icon>
 *       <span>Custom Action</span>
 *     </button>
 *     <mat-divider></mat-divider>
 *     <button mat-menu-item (click)="onAnotherAction()">
 *       <mat-icon>info</mat-icon>
 *       <span>Another Action</span>
 *     </button>
 *   </ng-container>
 * </ov-meeting-view>
 * ```
 *
 * @internal
 */
@Directive({
	selector: '[ovToolbarMoreOptionsAdditionalMenuItems]'
})
export class ToolbarMoreOptionsAdditionalMenuItemsDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}
