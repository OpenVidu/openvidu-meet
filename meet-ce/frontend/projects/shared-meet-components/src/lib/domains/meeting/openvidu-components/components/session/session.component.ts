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
import { MatDrawerContainer, MatSidenav } from '@angular/material/sidenav';
import { MatSidenavModule } from '@angular/material/sidenav';
import { LandscapeWarningComponent } from '../landscape-warning/landscape-warning.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { DataTopic } from '../../models/data-topic.model';
import { SidenavMode } from '../../models/layout/layout.model';
import { ILogger } from '../../models/logger.model';
import { PanelType } from '../../models/panel.model';
import { ParticipantLeftEvent, ParticipantLeftReason, ParticipantModel } from '../../models/participant.model';
import { RecordingState } from '../../models/recording.model';
import { RoomStatusData } from '../../models/room.model';
import { ActionService } from '../../services/action/action.service';
import { ChatService } from '../../services/chat/chat.service';
import { OpenViduComponentsConfigService } from '../../services/config/directive-config.service';
import { LayoutService } from '../../services/layout/layout.service';
import type { OVRoom } from '../../services/livekit-adapter';
import {
	DataPacket_Kind,
	DisconnectReason,
	LocalParticipant,
	Participant,
	RemoteParticipant,
	RemoteTrack,
	RemoteTrackPublication,
	Room,
	RoomEvent,
	Track,
	TrackPublication
} from '../../services/livekit-adapter';
import { LoggerService } from '../../services/logger/logger.service';
import { OpenViduService } from '../../services/openvidu/openvidu.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { RecordingService } from '../../services/recording/recording.service';
import { SessionTemplateConfiguration, TemplateManagerService } from '../../services/template/template-manager.service';
import { TranslateService } from '../../services/translate/translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { safeJsonParse } from '../../utils/utils';

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
	toolbarTemplate: TemplateRef<any> | undefined;
	readonly panelTemplateQuery = contentChild('panel', { read: TemplateRef });
	panelTemplate: TemplateRef<any> | undefined;
	readonly layoutTemplateQuery = contentChild('layout', { read: TemplateRef });
	layoutTemplate: TemplateRef<any> | undefined;
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
	private updateLayoutInterval: ReturnType<typeof setInterval> | undefined = undefined;
	private log: ILogger = {
		d: () => {},
		v: () => {},
		w: () => {},
		e: () => {}
	};

	private readonly layoutService = inject(LayoutService);
	private readonly actionService = inject(ActionService);
	private readonly openviduService = inject(OpenViduService);
	private readonly participantService = inject(ParticipantService);
	private readonly loggerSrv = inject(LoggerService);
	private readonly chatService = inject(ChatService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly panelService = inject(PanelService);
	private readonly recordingService = inject(RecordingService);
	private readonly translateService = inject(TranslateService);
	private readonly backgroundService = inject(VirtualBackgroundService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);
	protected readonly viewportService = inject(ViewportService);
	readonly sidenavMenuQuery = viewChild<MatSidenav>('sidenav');
	readonly videoContainerQuery = viewChild<ElementRef>('videoContainer');
	readonly containerQuery = viewChild<MatDrawerContainer>('container');
	readonly layoutContainerQuery = viewChild<ElementRef>('layoutContainer');
	private readonly querySyncEffect = effect(() => {
		this.toolbarTemplate = this.toolbarTemplateQuery();
		this.panelTemplate = this.panelTemplateQuery();
		this.layoutTemplate = this.layoutTemplateQuery();
		this.setupTemplates();
		this.cd.markForCheck();
	});
	private readonly sidenavMenuEffect = effect(() => {
		const menu = this.sidenavMenuQuery();
		if (menu && this.sideMenu !== menu) {
			setTimeout(() => {
				if (menu) {
					this.sideMenu = menu;
					this.initializeSidenavBindings();
				}
			}, 0);
		}
	});
	private readonly videoContainerEffect = effect(() => {
		const container = this.videoContainerQuery();
		if (container && !this.toolbarTemplate) {
			setTimeout(() => {
				if (container && !this.toolbarTemplate) {
					container.nativeElement.style.height = '100%';
					container.nativeElement.style.minHeight = '100%';
					this.layoutService.update();
				}
			}, 0);
		}
	});
	private readonly containerEffect = effect(() => {
		const container = this.containerQuery();
		if (container && this.drawer !== container) {
			setTimeout(() => {
				if (container && this.drawer !== container) {
					this.drawer = container;
					this.drawer._contentMarginChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
						setTimeout(() => {
							this.stopUpdateLayoutInterval();
							this.layoutService.update();
							if (this.drawer) {
								this.drawer.autosize = false;
							}
						}, 250);
					});
					this.initializeSidenavBindings();
				}
			}, 0);
		}
	});
	private readonly layoutContainerEffect = effect(() => {
		const container = this.layoutContainerQuery();
		if (container) {
			setTimeout(async () => {
				if (container && this.libService.showBackgroundEffectsButton()) {
					// Apply background from storage when layout container is in DOM only when background effects button is enabled
					await this.backgroundService.applyBackgroundFromStorage();
				}
			}, 0);
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
					if (this.drawer) {
						this.drawer.autosize = true;
					}
					this.startUpdateLayoutInterval();
				}
			}
			ev.isOpened ? this.sideMenu.open() : this.sideMenu.close();
		}
	});
	private readonly layoutWidthEffect = effect(() => {
		const width = this.layoutService.layoutWidth();
		this.sidenavMode.set(width <= this.SIDENAV_WIDTH_LIMIT_MODE ? SidenavMode.OVER : SidenavMode.SIDE);
	});

	constructor() {
		this.log = this.loggerSrv.get('SessionComponent');
		this.setupTemplates();
	}

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

		// this.subscribeToCaptionLanguage();
		this.subscribeToEncryptionErrors();
		this.subscribeToActiveSpeakersChanged();
		this.subscribeToParticipantConnected();
		this.subscribeToTrackSubscribed();
		this.subscribeToTrackUnsubscribed();
		this.subscribeToTrackMuteStateChanged();
		this.subscribeToParticipantDisconnected();
		this.subscribeToParticipantMetadataChanged();

		// this.subscribeToParticipantNameChanged();
		this.subscribeToDataMessage();
		this.subscribeToReconnection();
		this.subscribeToVirtualBackground();

		// if (this.libService.isRecordingEnabled()) {
		// this.subscribeToRecordingEvents();
		// }

		// if (this.libService.isBroadcastingEnabled()) {
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

	protected subscribeToEncryptionErrors() {
		this.room.on(RoomEvent.EncryptionError, (error: Error, participant?: Participant) => {
			if (!participant) {
				this.log.w('Encryption error received without participant info:', error);
				return;
			}
			this.participantService.setEncryptionError(participant.sid, true);
		});
	}

	protected subscribeToActiveSpeakersChanged() {
		this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
			this.participantService.setSpeaking(speakers);
		});
	}

	/**
	 * @internal
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupSessionTemplates(
			this.toolbarTemplate,
			this.panelTemplate,
			this.layoutTemplate
		);
	}

	async ngOnDestroy() {
		if (this.shouldDisconnectRoomWhenComponentIsDestroyed) {
			await this.disconnectRoom(ParticipantLeftReason.LEAVE);
		}
		if (this.room) this.room.removeAllListeners();
		this.participantService.clear();
		// 	if (this.captionLanguageSubscription) this.captionLanguageSubscription.unsubscribe();
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
		const sideMenu = this.sideMenu;
		const drawer = this.drawer;
		if (!sideMenu || !drawer) return;

		sideMenu.openedChange.subscribe(() => {
			this.stopUpdateLayoutInterval();
			this.layoutService.update();
		});

		sideMenu.openedStart.subscribe(() => {
			this.startUpdateLayoutInterval();
		});

		sideMenu.closedStart.subscribe(() => {
			this.startUpdateLayoutInterval();
		});
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

	private subscribeToParticipantConnected() {
		this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
			this.participantService.addRemoteParticipant(participant);
		});
	}

	/**
	 * The LocalParticipant has subscribed to a new track because of the RoomConnectionOptions has beed set with autosubscribe = 'true'.
	 * The LocalParticipant will subscribe to all tracks after joining.
	 */
	private subscribeToTrackSubscribed() {
		// this.room.on(RoomEvent.TrackPublished, (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
		// 	console.warn("NEW TrackPublished", participant);
		// 	console.warn("NEW TrackPublished", publication);
		// });
		this.room.on(
			RoomEvent.TrackSubscribed,
			(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
				const isScreenTrack = track.source === Track.Source.ScreenShare;
				this.participantService.addRemoteParticipant(participant);
				if (isScreenTrack) {
					// Set all videos to normal size when a new screen is being shared
					this.participantService.resetMyStreamsToNormalSize();
					this.participantService.resetRemoteStreamsToNormalSize();
					this.participantService.toggleRemoteVideoPinned(track.sid);
					if (track.sid)
						this.participantService.setScreenTrackPublicationDate(
							participant.sid,
							track.sid,
							new Date().getTime()
						);
				}
				// if (this.openviduService.isSttReady() && this.captionService.areCaptionsEnabled() && isCameraType) {
				// 	// Only subscribe to STT when is ready and stream is CAMERA type and it is a remote stream
				// 	try {
				// 		await this.openviduService.subscribeStreamToStt(event.stream, lang);
				// 	} catch (error) {
				// 		this.log.e('Error subscribing from STT: ', error);
				// 		// I assume the only reason of an STT error is a STT crash.
				// 		// It must be subscribed to all remotes again
				// 		// await this.openviduService.unsubscribeRemotesFromSTT();
				// 		await this.openviduService.subscribeRemotesToSTT(lang);
				// 	}
				// }
			}
		);
	}

	/**
	 * The LocalParticipant has unsubscribed from a track.
	 */
	private subscribeToTrackUnsubscribed() {
		this.room.on(
			RoomEvent.TrackUnsubscribed,
			(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
				this.log.d('TrackUnSubscribed', track, participant);
				// TODO: Check if this is the last track of the participant before removing it
				const isScreenTrack = track.source === Track.Source.ScreenShare;
				if (isScreenTrack) {
					if (track.sid)
						this.participantService.setScreenTrackPublicationDate(participant.sid, track.sid, -1);
					this.participantService.resetMyStreamsToNormalSize();
					this.participantService.resetRemoteStreamsToNormalSize();
					// Set last screen track shared to pinned size
					this.participantService.setLastScreenPinned();
				}

				if (track.sid) this.participantService.removeRemoteParticipantTrack(participant, track.sid);
				// 	if (this.openviduService.isSttReady() && this.captionService.areCaptionsEnabled() && isRemoteConnection && isCameraType) {
				// 		try {
				// 			await this.session.unsubscribeFromSpeechToText(event.stream);
				// 		} catch (error) {
				// 			this.log.e('Error unsubscribing from STT: ', error);
				// 		}
				// 	}
			}
		);
	}

	private subscribeToTrackMuteStateChanged() {
		const refreshParticipantState = (participant: Participant | RemoteParticipant | LocalParticipant) => {
			if (!participant) return;

			if (participant.isLocal) {
				this.participantService.updateLocalParticipant();
				return;
			}

			this.participantService.updateRemoteParticipants();
		};

		this.room.on(RoomEvent.TrackMuted, (_publication: TrackPublication, participant: Participant) => {
			refreshParticipantState(participant);
		});

		this.room.on(RoomEvent.TrackUnmuted, (_publication: TrackPublication, participant: Participant) => {
			refreshParticipantState(participant);
		});
	}

	private subscribeToParticipantDisconnected() {
		this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
			this.participantService.removeRemoteParticipant(participant.sid);
		});
	}

	private subscribeToParticipantMetadataChanged() {
		this.room.on(
			RoomEvent.ParticipantMetadataChanged,
			(metadata: string | undefined, participant: RemoteParticipant | LocalParticipant) => {
				console.log('ParticipantMetadataChanged', participant);
			}
		);
	}

	private subscribeToDataMessage() {
		this.room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, participant?: RemoteParticipant, _?: DataPacket_Kind, topic?: string) => {
				try {
					const decoder = new TextDecoder();
					const fromServer = participant === undefined;
					// Validate source and resolve participant info
					const storedParticipant = participant
						? this.participantService.getRemoteParticipantBySid(participant.sid || '')
						: undefined;
					if (participant && !storedParticipant) {
						this.log.w('DataReceived from unknown participant', participant);
						return;
					}
					if (!fromServer && !participant) {
						this.log.w('DataReceived from unknown source', payload);
						return;
					}

					const participantIdentity = storedParticipant?.identity || '';
					const participantName = storedParticipant?.name || '';

					const rawText = decoder.decode(payload);
					this.log.d('DataReceived (raw)', { topic });

					const eventMessage = safeJsonParse(rawText);
					if (!eventMessage) {
						this.log.w('Discarding data: malformed JSON', rawText);
						return;
					}

					this.log.d(`Data event received: ${topic}`);

					// Dispatch handling
					this.handleDataEvent(topic, eventMessage, participantName || participantIdentity || 'Unknown');
				} catch (err) {
					this.log.e('Unhandled error processing DataReceived', err);
				}
			}
		);
	}

	private handleDataEvent(topic: string | undefined, event: any, participantName: string) {
		// Handle the event based on topic
		switch (topic) {
			case DataTopic.CHAT:
				this.chatService.addRemoteMessage(event.message, participantName);
				break;
			case DataTopic.RECORDING_STARTING:
				this.log.d('Recording is starting', event);
				this.recordingService.setRecordingStarting();
				break;
			case DataTopic.RECORDING_STARTED:
				this.log.d('Recording has been started', event);
				this.recordingService.setRecordingStarted(event);
				break;
			case DataTopic.RECORDING_STOPPING:
				this.log.d('Recording is stopping', event);
				this.recordingService.setRecordingStopping();
				break;
			case DataTopic.RECORDING_STOPPED:
				this.log.d('RECORDING_STOPPED', event);
				this.recordingService.setRecordingStopped(event);
				break;

			case DataTopic.RECORDING_DELETED:
				this.log.d('RECORDING_DELETED', event);
				this.recordingService.deleteRecording(event);
				break;

			case DataTopic.RECORDING_FAILED:
				this.log.d('RECORDING_FAILED', event);
				this.recordingService.setRecordingFailed(event.error);
				break;
			case DataTopic.ROOM_STATUS:
				const { recordingList, isRecordingStarted, isBroadcastingStarted, broadcastingId } =
					event as RoomStatusData;

				if (this.libService.showRecordingActivityRecordingsList()) {
					this.recordingService.setRecordingList(recordingList);
				}
				if (isRecordingStarted) {
					const recordingActive = recordingList.find(
						(recording) => recording.status === RecordingState.STARTED
					);
					this.recordingService.setRecordingStarted(recordingActive);
				}

				break;

			default:
				break;
		}
	}

	// private async decryptIfNeeded(topic: string | undefined, payload: Uint8Array, identity: string): Promise<Uint8Array> {
	// 	if (topic === DataTopic.CHAT && this.e2eeService.isEnabled) {
	// 		try {
	// 			return await this.e2eeService.decryptOrMask(payload, identity, JSON.stringify({ message: '******' }));
	// 		} catch (e) {
	// 			this.log.e('Error decrypting payload, using masked fallback', e);
	// 			// In case of decryption error, return a masked JSON so subsequent parsing won't crash
	// 			return new TextEncoder().encode(JSON.stringify({ message: '******' }));
	// 		}
	// 	}
	// 	return payload;
	// }

	private subscribeToReconnection() {
		this.room.on(RoomEvent.Reconnecting, () => {
			this.log.w('Connection lost: Reconnecting');
			this.actionService.openConnectionDialog(
				this.translateService.translate('ERRORS.CONNECTION'),
				this.translateService.translate('ERRORS.RECONNECT')
			);
			this.onRoomReconnecting.emit();
		});
		this.room.on(RoomEvent.Reconnected, () => {
			this.log.w('Connection lost: Reconnected');
			this.actionService.closeConnectionDialog();
			this.onRoomReconnected.emit();
		});

		this.room.on(RoomEvent.Disconnected, async (reason: DisconnectReason | undefined) => {
			this.shouldDisconnectRoomWhenComponentIsDestroyed = false;
			this.actionService.closeConnectionDialog();
			const participantLeftEvent: ParticipantLeftEvent = {
				roomName: this.openviduService.getRoomName(),
				participantName: this.participantService.getMyName() || '',
				identity: this.participantService.getMyIdentity() || '',
				reason: ParticipantLeftReason.NETWORK_DISCONNECT
			};
			const messageErrorKey = 'ERRORS.DISCONNECT';
			let descriptionErrorKey = '';
			switch (reason) {
				case DisconnectReason.CLIENT_INITIATED:
					// Skip disconnect reason if a default disconnect method has been called
					if (!this.openviduService.shouldHandleClientInitiatedDisconnectEvent) return;
					participantLeftEvent.reason = ParticipantLeftReason.LEAVE;
					break;
				case DisconnectReason.DUPLICATE_IDENTITY:
					participantLeftEvent.reason = ParticipantLeftReason.DUPLICATE_IDENTITY;
					descriptionErrorKey = 'ERRORS.DUPLICATE_IDENTITY';
					break;
				case DisconnectReason.SERVER_SHUTDOWN:
					descriptionErrorKey = 'ERRORS.SERVER_SHUTDOWN';
					participantLeftEvent.reason = ParticipantLeftReason.SERVER_SHUTDOWN;
					break;
				case DisconnectReason.PARTICIPANT_REMOVED:
					participantLeftEvent.reason = ParticipantLeftReason.PARTICIPANT_REMOVED;
					descriptionErrorKey = 'ERRORS.PARTICIPANT_REMOVED';
					break;
				case DisconnectReason.ROOM_DELETED:
					participantLeftEvent.reason = ParticipantLeftReason.ROOM_DELETED;
					descriptionErrorKey = 'ERRORS.ROOM_DELETED';
					break;
				case DisconnectReason.SIGNAL_CLOSE:
					participantLeftEvent.reason = ParticipantLeftReason.SIGNAL_CLOSE;
					descriptionErrorKey = 'ERRORS.SIGNAL_CLOSE';
					break;
				default:
					participantLeftEvent.reason = ParticipantLeftReason.OTHER;
					descriptionErrorKey = 'ERRORS.DISCONNECT';
					break;
			}

			this.log.d('Participant disconnected', participantLeftEvent);
			this.onParticipantLeft.emit(participantLeftEvent);
			this.onRoomDisconnected.emit();
			if (this.libService.getShowDisconnectionDialog() && descriptionErrorKey) {
				this.actionService.openDialog(
					this.translateService.translate(messageErrorKey),
					this.translateService.translate(descriptionErrorKey)
				);
			}
		});
	}

	private subscribeToVirtualBackground() {
		// handled by backgroundEffectsEffect
	}

	private startUpdateLayoutInterval() {
		this.updateLayoutInterval = setInterval(() => {
			this.layoutService.update();
		}, 50);
	}

	private stopUpdateLayoutInterval() {
		if (this.updateLayoutInterval) {
			clearInterval(this.updateLayoutInterval);
		}
	}
}
