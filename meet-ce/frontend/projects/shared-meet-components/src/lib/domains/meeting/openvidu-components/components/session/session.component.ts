import { NgTemplateOutlet } from '@angular/common';
import {
	Component,
	DestroyRef,
	effect,
	ElementRef,
	HostListener,
	inject,
	OnDestroy,
	OnInit,
	output,
	signal,
	viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDrawerContainer, MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { SidenavMode } from '../../models/layout/layout.model';
import { PanelType } from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantLeftReason, ParticipantModel } from '../../models/participant.model';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ActionService } from '../../services/action/action.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { Room } from '../../services/livekit';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { SessionRoomEventsService } from '../../services/session/session-room-events.service';
import { TemplateRegistryService } from '../../services/template/template-registry.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { RuntimeConfigService } from '../../../../../shared/services/runtime-config.service';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';
import { LoggerService } from '../../../../../shared/services/logger.service';

/**
 * @internal
 */

@Component({
	selector: 'ov-session',
	imports: [MatProgressSpinnerModule, MatSidenavModule, TranslatePipe, LandscapeWarningComponent, NgTemplateOutlet],
	templateUrl: './session.component.html',
	styleUrls: ['./session.component.scss'],
	standalone: true
})
export class SessionComponent implements OnInit, OnDestroy {
	/**
	 * Provides event notifications that fire when Room is created for the local participant.
	 */
	onRoomCreated = output<Room>();

	/**
	 * Provides event notifications that fire when Room is being reconnected for the local participant.
	 */
	onRoomReconnecting = output<void>();

	/**
	 * Provides event notifications that fire when Room is reconnected for the local participant.
	 */
	onRoomReconnected = output<void>();

	/**
	 * Provides event notifications that fire when local participant is connected to the Room.
	 */
	onParticipantConnected = output<ParticipantModel>();

	/**
	 * This event is emitted when the local participant leaves the room.
	 */
	onParticipantLeft = output<ParticipantLeftEvent>();

	room!: Room;
	sideMenu: MatSidenav | undefined = undefined;
	readonly sidenavMode = signal<SidenavMode>(SidenavMode.SIDE);
	readonly SidenavMode = SidenavMode;
	readonly settingsPanelOpened = signal(false);
	drawer: MatDrawerContainer | undefined = undefined;
	readonly loading = signal(true);
	private sidenavSubscriptionsInitialized: boolean = false;

	/**
	 * @internal
	 */
	private shouldDisconnectRoomWhenComponentIsDestroyed: boolean = true;
	private readonly SIDENAV_WIDTH_LIMIT_MODE = 790;
	private readonly destroyRef = inject(DestroyRef);
	private readonly layoutService = inject(SmartLayoutService);
	private readonly actionService = inject(ActionService);
	private readonly meetingLiveKitService = inject(MeetingLiveKitService);
	private readonly participantService = inject(ParticipantService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly panelService = inject(PanelService);
	private readonly translateService = inject(MeetingTranslateService);
	private readonly backgroundService = inject(VirtualBackgroundService);

	private readonly sessionRoomEventsService = inject(SessionRoomEventsService);
	private readonly runtimeConfigService = inject(RuntimeConfigService);
	protected readonly viewportService = inject(ViewportService);
	readonly templateRegistry = inject(TemplateRegistryService);
	readonly sidenavMenuQuery = viewChild<MatSidenav>('sidenav');
	readonly videoContainerQuery = viewChild<ElementRef>('videoContainer');
	readonly containerQuery = viewChild<MatDrawerContainer>('container');
	readonly layoutContainerQuery = viewChild<ElementRef>('layoutContainer');
	private layoutUpdateTimeoutId: any = null;
	private contentMarginUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private updateLayoutInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private sidenavResizeObserver: ResizeObserver | undefined = undefined;
	private log = inject(LoggerService).get('SessionComponent');
	private readonly LAYOUT_UPDATE_DEBOUNCE_MS = 100;

	private readonly sidenavMenuEffect = effect(() => {
		const menu = this.sidenavMenuQuery();
		if (menu && this.sideMenu !== menu) {
			this.sideMenu = menu;
			this.initializeSidenavBindings();
		}
	});

	private readonly videoContainerEffect = effect(() => {
		const container = this.videoContainerQuery();
		if (container && !this.templateRegistry.toolbar()) {
			// Use microtask to ensure DOM is ready
			Promise.resolve().then(() => {
				if (container && !this.templateRegistry.toolbar()) {
					container.nativeElement.style.height = '100%';
					container.nativeElement.style.minHeight = '100%';
					this.debouncedLayoutUpdate();
				}
			});
		}
	});

	private readonly containerEffect = effect(() => {
		const container = this.containerQuery();
		if (container && this.drawer !== container) {
			Promise.resolve().then(() => {
				if (container && this.drawer !== container) {
					this.drawer = container;
					this.drawer._contentMarginChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
						this.scheduleContentMarginUpdate();
					});
					this.observeContainerWidth(container);
					this.initializeSidenavBindings();
				}
			});
		}
	});
	private readonly layoutContainerEffect = effect(() => {
		const container = this.layoutContainerQuery();
		if (container) {
			// Use microtask instead of setTimeout for better performance
			Promise.resolve().then(async () => {
				if (container && this.libService.showBackgroundEffectsButton()) {
					// Apply background from storage when layout container is in DOM only when background effects button is enabled
					await this.backgroundService.applyBackgroundFromStorage();
				}
			});
		}
	});

	// Close background effects panel and remove background if the button is disabled
	private readonly backgroundEffectsEffect = effect(() => {
		const enabled = this.libService.backgroundEffectsButtonSignal();
		if (enabled) return;

		if (this.backgroundService.isBackgroundApplied()) {
			void this.backgroundService.removeBackground().then(() => {
				if (this.panelService.isBackgroundEffectsPanelOpened()) {
					this.panelService.closePanel();
				}
			});
		}
	});

	private readonly panelStateEffect = effect(() => {
		const ev = this.panelService.panelOpened();
		this.settingsPanelOpened.set(ev.isOpened && ev.panelType === PanelType.SETTINGS);

		if (this.sideMenu) {
			if (this.sideMenu.opened && ev.isOpened) {
				if (ev.panelType === PanelType.SETTINGS || ev.previousPanelType === PanelType.SETTINGS) {
					// Switch from SETTINGS to another panel and vice versa.
					// As the SETTINGS panel will be bigger than others, the sidenav container must be updated.
					// Setting autosize to 'true' allows update it.
					if (this.drawer && !this.drawer.autosize) {
						this.drawer.autosize = true;
					}
					this.startUpdateLayoutInterval();
				}
			}
			if (ev.isOpened !== this.sideMenu.opened) {
				ev.isOpened ? this.sideMenu.open() : this.sideMenu.close();
			}
		}
	});

	@HostListener('window:beforeunload')
	beforeunloadHandler() {
		this.disconnectRoom(ParticipantLeftReason.BROWSER_UNLOAD);
	}

	@HostListener('window:resize')
	sizeChange() {
		this.layoutService.update();
	}

	async ngOnInit() {
		this.shouldDisconnectRoomWhenComponentIsDestroyed = true;

		// Check if room is available before proceeding
		if (!this.meetingLiveKitService.isInitialized()) {
			this.log.e('Room is not initialized when SessionComponent starts. This indicates a timing issue.');
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.SESSION'),
				'Room is not ready. Please ensure the token is properly configured.'
			);
			return;
		}

		// Get room instance
		try {
			this.room = this.meetingLiveKitService.getRoom();
			this.log.d('Room successfully obtained for SessionComponent');
		} catch (error: any) {
			this.log.e('Unexpected error getting room:', error);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.SESSION'),
				'Failed to get room instance: ' + (error?.message || error)
			);
			return;
		}
		this.sessionRoomEventsService.bindRoom(this.room, {
			onRoomReconnecting: () => this.onRoomReconnecting.emit(),
			onRoomReconnected: () => this.onRoomReconnected.emit(),
			onParticipantLeft: (event) => this.onParticipantLeft.emit(event)
		});

		try {
			await this.participantService.connect();
			// Send room created after participant connect for avoiding to send incomplete room payload
			this.onRoomCreated.emit(this.room);

			this.loading.set(false);
			const localParticipant = this.participantService.localParticipant();
			if (localParticipant) {
				this.onParticipantConnected.emit(localParticipant);
			}
		} catch (error: any) {
			this.log.e('There was an error connecting to the room:', error?.code, error?.message);
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.SESSION'),
				error?.error || error?.message || error
			);
		}
	}

	/**
	 * Debounced layout update to prevent excessive recalculations
	 * @param delay Optional custom delay in ms (default: 100ms)
	 */
	private debouncedLayoutUpdate(delay?: number): void {
		if (this.layoutUpdateTimeoutId !== null) {
			clearTimeout(this.layoutUpdateTimeoutId);
		}
		this.layoutUpdateTimeoutId = setTimeout(() => {
			this.layoutService.update();
			this.layoutUpdateTimeoutId = null;
		}, delay || this.LAYOUT_UPDATE_DEBOUNCE_MS);
	}

	async ngOnDestroy() {
		// Clean up the debounce timeout to prevent memory leaks
		if (this.layoutUpdateTimeoutId !== null) {
			clearTimeout(this.layoutUpdateTimeoutId);
			this.layoutUpdateTimeoutId = null;
		}
		if (this.contentMarginUpdateTimeoutId !== null) {
			clearTimeout(this.contentMarginUpdateTimeoutId);
			this.contentMarginUpdateTimeoutId = null;
		}
		this.stopUpdateLayoutInterval();
		this.sidenavResizeObserver?.disconnect();

		if (this.shouldDisconnectRoomWhenComponentIsDestroyed) {
			await this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}
		if (this.room) this.room.removeAllListeners();
		this.participantService.clear();
	}

	private scheduleContentMarginUpdate(): void {
		if (this.contentMarginUpdateTimeoutId !== null) {
			clearTimeout(this.contentMarginUpdateTimeoutId);
		}
		this.contentMarginUpdateTimeoutId = setTimeout(() => {
			this.stopUpdateLayoutInterval();
			this.layoutService.update();
			if (this.drawer && this.drawer.autosize) {
				this.drawer.autosize = false;
			}
			this.contentMarginUpdateTimeoutId = null;
		}, 250);
	}

	async disconnectRoom(reason: ParticipantLeftReason) {
		// Mark session as disconnected for avoiding to do it again in ngOnDestroy
		this.shouldDisconnectRoomWhenComponentIsDestroyed = false;
		await this.meetingLiveKitService.disconnect(() => {
			this.onParticipantLeft.emit({
				roomName: this.meetingLiveKitService.getRoomName(),
				participantName: this.participantService.getMyName() || '',
				identity: this.participantService.getMyIdentity() || '',
				reason
			});
		}, false);
	}

	private subscribeToTogglingMenu() {
		const { sideMenu, drawer } = this;
		if (!sideMenu || !drawer) return;

		sideMenu.openedChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.stopUpdateLayoutInterval();
			this.layoutService.update();
		});

		sideMenu.openedStart.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.startUpdateLayoutInterval();
		});

		sideMenu.closedStart.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.startUpdateLayoutInterval();
		});
	}

	private startUpdateLayoutInterval() {
		this.stopUpdateLayoutInterval();
		this.updateLayoutInterval = setInterval(() => {
			this.layoutService.update();
		}, 50);
	}

	private stopUpdateLayoutInterval() {
		if (this.updateLayoutInterval) {
			clearInterval(this.updateLayoutInterval);
			this.updateLayoutInterval = undefined;
		}
	}

	private observeContainerWidth(container: MatDrawerContainer): void {
		// In webcomponent mode keep the sidenav in SIDE mode regardless of container width.
		if (this.runtimeConfigService.isWebcomponentMode()) {
			return;
		}

		this.sidenavResizeObserver?.disconnect();
		const el = (container as any)._element?.nativeElement ?? (container as any)._elementRef?.nativeElement;
		if (!el) return;

		this.sidenavResizeObserver = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			const mode = width <= this.SIDENAV_WIDTH_LIMIT_MODE ? SidenavMode.OVER : SidenavMode.SIDE;
			if (this.sidenavMode() !== mode) {
				this.sidenavMode.set(mode);
			}
		});
		this.sidenavResizeObserver.observe(el);
	}

	private initializeSidenavBindings(): void {
		if (this.sidenavSubscriptionsInitialized || !this.sideMenu || !this.drawer) return;

		this.sidenavSubscriptionsInitialized = true;
		this.subscribeToTogglingMenu();

		// Sync current panel state once sidenav bindings are initialized.
		const currentState = this.panelService.panelOpened();
		this.settingsPanelOpened.set(currentState.isOpened && currentState.panelType === PanelType.SETTINGS);
		currentState.isOpened ? this.sideMenu.open() : this.sideMenu.close();
	}
}
