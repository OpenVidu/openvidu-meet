import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	contentChild,
	DestroyRef,
	effect,
	ElementRef,
	HostListener,
	inject,
	OnDestroy,
	OnInit,
	output,
	signal,
	TemplateRef,
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
import { LayoutService } from '../../services/layout/layout.service';
import type { OVRoom } from '../../services/livekit-adapter';
import { Room } from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { SessionRoomEventsService } from '../../services/session/session-room-events.service';
import { SessionTemplateConfiguration, TemplateManagerService } from '../../services/template/template-manager.service';
import { TranslateService } from '../../services/translate/translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';

/**
 * @internal
 */

@Component({
	selector: 'ov-session',
	imports: [CommonModule, MatProgressSpinnerModule, MatSidenavModule, TranslatePipe, LandscapeWarningComponent],
	templateUrl: './session.component.html',
	styleUrls: ['./session.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class SessionComponent implements OnInit, OnDestroy {
	readonly toolbarTemplateQuery = contentChild('toolbar', { read: TemplateRef });
	readonly toolbarTemplate = signal<TemplateRef<any> | undefined>(undefined);
	readonly panelTemplateQuery = contentChild('panel', { read: TemplateRef });
	readonly panelTemplate = signal<TemplateRef<any> | undefined>(undefined);
	readonly layoutTemplateQuery = contentChild('layout', { read: TemplateRef });
	readonly layoutTemplate = signal<TemplateRef<any> | undefined>(undefined);
	/**
	 * Provides event notifications that fire when Room is created for the local participant.
	 */
	onRoomCreated = output<OVRoom>();

	/**
	 * Provides event notifications that fire when Room is being reconnected for the local participant.
	 */
	onRoomReconnecting = output<void>();

	/**
	 * Provides event notifications that fire when Room is reconnected for the local participant.
	 */
	onRoomReconnected = output<void>();

	/**
	 * Provides event notifications that fire when participant is disconnected from Room.
	 * @deprecated Use {@link SessionComponent.onParticipantLeft} instead.
	 */
	onRoomDisconnected = output<void>();

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
	loading: boolean = true;
	private sidenavSubscriptionsInitialized: boolean = false;

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: SessionTemplateConfiguration = {};

	private shouldDisconnectRoomWhenComponentIsDestroyed: boolean = true;
	private readonly SIDENAV_WIDTH_LIMIT_MODE = 790;
	private readonly destroyRef = inject(DestroyRef);
	private readonly layoutService = inject(LayoutService);
	private readonly actionService = inject(ActionService);
	private readonly openviduService = inject(OpenViduService);
	private readonly participantService = inject(ParticipantService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly panelService = inject(PanelService);
	private readonly translateService = inject(TranslateService);
	private readonly backgroundService = inject(VirtualBackgroundService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly sessionRoomEventsService = inject(SessionRoomEventsService);
	protected readonly viewportService = inject(ViewportService);
	readonly sidenavMenuQuery = viewChild<MatSidenav>('sidenav');
	readonly videoContainerQuery = viewChild<ElementRef>('videoContainer');
	readonly containerQuery = viewChild<MatDrawerContainer>('container');
	readonly layoutContainerQuery = viewChild<ElementRef>('layoutContainer');
	private layoutUpdateTimeoutId: any = null;
	private contentMarginUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private updateLayoutInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private log = inject(LoggerService).get('SessionComponent');
	private readonly LAYOUT_UPDATE_DEBOUNCE_MS = 100;

	private readonly querySyncEffect = effect(() => {
		this.toolbarTemplate.set(this.toolbarTemplateQuery());
		this.panelTemplate.set(this.panelTemplateQuery());
		this.layoutTemplate.set(this.layoutTemplateQuery());
		this.setupTemplates();
	});

	private readonly sidenavMenuEffect = effect(() => {
		const menu = this.sidenavMenuQuery();
		if (menu && this.sideMenu !== menu) {
			this.sideMenu = menu;
			this.initializeSidenavBindings();
		}
	});

	private readonly videoContainerEffect = effect(() => {
		const container = this.videoContainerQuery();
		if (container && !this.toolbarTemplateQuery()) {
			// Use microtask to ensure DOM is ready
			Promise.resolve().then(() => {
				if (container && !this.toolbarTemplateQuery()) {
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
	private readonly layoutWidthEffect = effect(() => {
		const width = this.layoutService.layoutWidth();
		this.sidenavMode.set(width <= this.SIDENAV_WIDTH_LIMIT_MODE ? SidenavMode.OVER : SidenavMode.SIDE);
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
		if (!this.openviduService.isRoomInitialized()) {
			this.log.e('Room is not initialized when SessionComponent starts. This indicates a timing issue.');
			this.actionService.openDialog(
				this.translateService.translate('ERRORS.SESSION'),
				'Room is not ready. Please ensure the token is properly configured.'
			);
			return;
		}

		// Get room instance
		try {
			this.room = this.openviduService.getRoom();
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
			onRoomDisconnected: () => this.onRoomDisconnected.emit(),
			onParticipantLeft: (event) => this.onParticipantLeft.emit(event)
		});
		// this.subscribeToBroadcastingEvents();
		// }
		try {
			await this.participantService.connect();
			// Send room created after participant connect for avoiding to send incomplete room payload
			this.onRoomCreated.emit(this.room);
			this.cd.markForCheck();
			this.loading = false;
			const localParticipant = this.participantService.localParticipantSignal();
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

	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupSessionTemplates(
			this.toolbarTemplate(),
			this.panelTemplate(),
			this.layoutTemplate()
		);
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

		if (this.shouldDisconnectRoomWhenComponentIsDestroyed) {
			await this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}
		if (this.room) this.room.removeAllListeners();
		this.participantService.clear();
		// 	if (this.captionLanguageSubscription) this.captionLanguageSubscription.unsubscribe();
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
		await this.openviduService.disconnectRoom(() => {
			this.onParticipantLeft.emit({
				roomName: this.openviduService.getRoomName(),
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
