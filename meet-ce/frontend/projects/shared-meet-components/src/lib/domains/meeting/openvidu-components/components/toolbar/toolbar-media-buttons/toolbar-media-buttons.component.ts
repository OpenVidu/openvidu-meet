import {
	ChangeDetectionStrategy,
	Component,
	TemplateRef,
	computed,
	contentChild,
	inject,
	input,
	output
} from '@angular/core';
import { ToolbarMoreOptionsAdditionalMenuItemsDirective } from '../../../directives/template/internals.directive';
import { RecordingState } from '../../../models/recording.model';
import { ToolbarAdditionalButtonsPosition } from '../../../models/toolbar.model';
import { ViewportService } from '../../../services/viewport/viewport.service';

/**
 * @internal
 */
@Component({
	selector: 'ov-toolbar-media-buttons',
	templateUrl: './toolbar-media-buttons.component.html',
	styleUrl: './toolbar-media-buttons.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class ToolbarMediaButtonsComponent {
	// Camera related inputs
	showCameraButton = input<boolean>(true);
	isCameraEnabled = input<boolean>(true);
	cameraMuteChanging = input<boolean>(false);

	// Microphone related inputs
	showMicrophoneButton = input<boolean>(true);
	isMicrophoneEnabled = input<boolean>(true);
	microphoneMuteChanging = input<boolean>(false);

	// Screenshare related inputs
	showScreenshareButton = input<boolean>(true);
	isScreenShareEnabled = input<boolean>(false);
	isFirefoxBrowser = input<boolean>(false);

	// Device availability inputs
	hasVideoDevices = input<boolean>(true);
	hasAudioDevices = input<boolean>(true);

	// Connection state inputs
	isConnectionLost = input<boolean>(false);

	// UI state inputs
	isMinimal = input<boolean>(false);

	// More options menu inputs
	showMoreOptionsButton = input<boolean>(true);
	showFullscreenButton = input<boolean>(true);
	showRecordingButton = input<boolean>(true);
	showViewRecordingsButton = input<boolean>(false);
	showBackgroundEffectsButton = input<boolean>(true);
	showSettingsButton = input<boolean>(true);

	// Fullscreen state
	isFullscreenActive = input<boolean>(false);

	// Recording related inputs
	recordingStatus = input<RecordingState>(RecordingState.STOPPED);
	hasRoomTracksPublished = input<boolean>(false);


	// Leave button
	showLeaveButton = input<boolean>(true);

	// Additional buttons template
	toolbarAdditionalButtonsTemplate = input<TemplateRef<any> | null>(null);
	additionalButtonsPosition = input<ToolbarAdditionalButtonsPosition | undefined>(undefined);

	// Leave button template
	toolbarLeaveButtonTemplate = input<TemplateRef<any> | null>(null);

	/**
	 * @internal
	 * ContentChild for custom menu items in more options menu
	 */
	readonly externalMoreOptionsAdditionalMenuItems = contentChild.required(
		ToolbarMoreOptionsAdditionalMenuItemsDirective
	);

	/**
	 * @internal
	 * Gets the template for additional menu items in more options
	 */
	get moreOptionsAdditionalMenuItemsTemplate(): TemplateRef<any> | undefined {
		return this.externalMoreOptionsAdditionalMenuItems()?.template;
	}

	// Status enums for template usage
	_recordingStatus = RecordingState;

	// Viewport service for responsive behavior
	private viewportService = inject(ViewportService);

	// Computed properties for responsive button grouping
	readonly isMobileView = computed(() => this.viewportService.isMobile());
	readonly isTabletView = computed(() => this.viewportService.isTablet());
	readonly isDesktopView = computed(() => this.viewportService.isDesktop());

	// Essential buttons that always stay visible
	readonly showCameraButtonDirect = computed(() => this.showCameraButton() && !this.isMinimal());

	readonly showMicrophoneButtonDirect = computed(() => this.showMicrophoneButton() && !this.isMinimal());

	// Screenshare button - visible on tablet+ or when already active
	readonly showScreenshareButtonDirect = computed(
		() => this.showScreenshareButton() && !this.isMinimal() && (!this.isMobileView() || this.isScreenShareEnabled())
	);

	// More options button - always visible when not minimal
	readonly showMoreOptionsButtonDirect = computed(() => this.showMoreOptionsButton() && !this.isMinimal());

	// Check if there are active features that should show a badge on More Options
	readonly hasActiveFeatures = computed(
		() =>
			this.isScreenShareEnabled() ||
			this.recordingStatus() === this._recordingStatus.STARTED
	);

	// Check if additional buttons should be shown outside (desktop/tablet) or inside More Options (mobile)
	readonly showAdditionalButtonsOutside = computed(() => {
		return !this.isMobileView() && this.toolbarAdditionalButtonsTemplate();
	});

	// Check if additional buttons should be shown inside More Options menu (mobile only)
	readonly showAdditionalButtonsInsideMenu = computed(() => {
		return this.isMobileView() && this.toolbarAdditionalButtonsTemplate();
	});

	// Media button outputs
	readonly cameraToggled = output<void>();
	readonly microphoneToggled = output<void>();
	readonly screenShareToggled = output<void>();
	readonly screenTrackReplaced = output<void>();

	// More options menu outputs
	readonly fullscreenToggled = output<void>();
	readonly recordingToggled = output<void>();
	readonly viewRecordingsClicked = output<void>();
	readonly broadcastingToggled = output<void>();
	readonly backgroundEffectsToggled = output<void>();
	readonly settingsToggled = output<void>();

	// Leave button output
	readonly leaveClicked = output<void>();

	// Event handler methods
	onCameraToggle(): void {
		this.cameraToggled.emit();
	}

	onMicrophoneToggle(): void {
		this.microphoneToggled.emit();
	}

	onScreenShareToggle(): void {
		this.screenShareToggled.emit();
	}

	onScreenTrackReplace(): void {
		this.screenTrackReplaced.emit();
	}

	onFullscreenToggle(): void {
		this.fullscreenToggled.emit();
	}

	onRecordingToggle(): void {
		this.recordingToggled.emit();
	}

	onViewRecordingsClick(): void {
		this.viewRecordingsClicked.emit();
	}

	onBroadcastingToggle(): void {
		this.broadcastingToggled.emit();
	}

	onBackgroundEffectsToggle(): void {
		this.backgroundEffectsToggled.emit();
	}

	onSettingsToggle(): void {
		this.settingsToggled.emit();
	}

	onLeaveClick(): void {
		this.leaveClicked.emit();
	}
}
