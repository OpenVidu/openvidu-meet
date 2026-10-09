import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { MeetingCaptionsService } from '../../services/meeting-captions.service';
import { MeetingContextService } from '../../services/meeting-context.service';
import { MeetingHandService } from '../../services/meeting-hand.service';
import { MeetingToolbarCopyLinkButtonComponent } from '../meeting-toolbar-copy-link-button/meeting-toolbar-copy-link-button.component';
import { LoggerService } from '../../../../shared/services/logger.service';

/**
 * Component for extra toolbar buttons (like captions and copy room access link).
 * These buttons can appear inside the "More Options" menu on mobile.
 */
@Component({
	selector: 'ov-meeting-toolbar-extra-buttons',
	templateUrl: './meeting-toolbar-extra-buttons.component.html',
	styleUrls: ['./meeting-toolbar-extra-buttons.component.scss'],
	imports: [
		MatButtonModule,
		MatIconModule,
		MatMenuModule,
		MatTooltipModule,
		MeetingToolbarCopyLinkButtonComponent,
		TranslatePipe
	]
})
export class MeetingToolbarExtraButtonsComponent {
	protected meetingContextService = inject(MeetingContextService);
	protected captionService = inject(MeetingCaptionsService);
	protected handService = inject(MeetingHandService);
	protected runtimeConfigService = inject(RuntimeConfigService);
	protected loggerService = inject(LoggerService);
	protected log = this.loggerService.get('OpenVidu Meet - MeetingToolbarExtraButtons');

	/**
	 * Whether to show the copy link button: only for moderators (when share access
	 * links are enabled) and never when embedded (webcomponent or iframe)
	 */
	showCopyLinkButton = computed(
		() => this.meetingContextService.meetingUI().showShareAccessLinks && !this.runtimeConfigService.isEmbeddedMode()
	);

	/** Whether to show the captions button (visible when not HIDDEN) */
	showCaptionsButton = computed(() => this.meetingContextService.meetingUI().showCaptionsControls);
	/** Whether captions button is disabled (true when DISABLED_WITH_WARNING) */
	isCaptionsButtonDisabled = computed(() => this.meetingContextService.meetingUI().showCaptionsControlsDisabled);
	/**
	 * True while an enable() or disable() call is in flight.
	 * Use this to prevent concurrent toggle requests.
	 */
	isCaptionsTogglePending = signal<boolean>(false);
	/** Whether captions are currently enabled by the user */
	areCaptionsEnabledByUser = this.captionService.areCaptionsEnabledByUser;

	/** Whether the toolbar is in its mobile layout, which puts these buttons in the More options menu */
	isMobile = this.meetingContextService.isMobile;

	/** Whether to show the raise hand button (the room has the feature on) */
	showHandButton = computed(() => this.meetingContextService.meetingUI().showRaiseHand);
	/** Whether the local participant's hand is raised */
	isHandRaised = this.handService.localHandRaised;

	/** `R` raises or lowers the hand once per press, unless the participant is typing somewhere. */
	@HostListener('document:keydown.r', ['$event'])
	onHandShortcut(event: Event): void {
		const { repeat, target } = event as KeyboardEvent & { target: HTMLElement | null };
		const typing = target?.isContentEditable || target?.matches('input, textarea');

		if (repeat || typing || !this.showHandButton()) return;

		void this.onHandClick();
	}

	async onHandClick(): Promise<void> {
		try {
			await this.handService.toggle();
		} catch (error) {
			this.log.e('Error toggling the hand:', error);
		}
	}

	async onCaptionsClick(): Promise<void> {
		if (this.isCaptionsTogglePending()) {
			return;
		}

		this.isCaptionsTogglePending.set(true);

		try {
			// Don't allow toggling if captions are disabled at system level
			if (this.isCaptionsButtonDisabled()) {
				this.log.w('Captions are disabled at system level (MEET_CAPTIONS_ENABLED=false)');
				return;
			}

			if (this.captionService.areCaptionsEnabledByUser()) {
				await this.captionService.disable();
			} else {
				await this.captionService.enable();
			}
		} catch (error) {
			this.log.e('Error toggling captions:', error);
		} finally {
			// Add a small delay before allowing another toggle to prevent rapid concurrent calls
			setTimeout(() => this.isCaptionsTogglePending.set(false), 500);
		}
	}
}
