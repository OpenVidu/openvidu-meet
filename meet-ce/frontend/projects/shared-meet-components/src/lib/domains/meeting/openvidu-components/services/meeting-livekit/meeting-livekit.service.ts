import { computed, inject, Service, signal } from '@angular/core';
import type { ILogger } from '../../../../../shared/models/logger.model';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetingUiConfigService } from '../config/meeting-ui-config.service';
import { DeviceService } from '../device/device.service';
import {
	ConnectionState,
	E2EEOptions,
	ExternalE2EEKeyProvider,
	Room,
	RoomEvent,
	RoomOptions,
	VideoPresets
} from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { MediaStorageService } from '../storage/storage.service';

/**
 * Owns the live meeting connection end to end: the LiveKit Room lifecycle (create / connect /
 * disconnect / teardown), its E2EE setup (worker + key provider) and the connection token. Nothing
 * outside subscribes or unsubscribes Room listeners on its behalf. Local media capture lives
 * separately in LocalTrackService.
 */
@Service()
export class MeetingLiveKitService {
	private readonly deviceService = inject(DeviceService);
	private readonly storageService = inject(MediaStorageService);
	private readonly configService = inject(MeetingUiConfigService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly assets = inject(AssetsService);

	private room: Room | undefined = undefined;
	private keyProvider: ExternalE2EEKeyProvider | undefined;
	// Held only so teardown() can terminate it: the Room owns it while it lives, and a Room is
	// discarded once per meeting.
	private e2eeWorker: Worker | undefined;

	private readonly _connectionState = signal<ConnectionState>(ConnectionState.Disconnected);

	/**
	 * The single writer of {@link connectionState}, held as a stable reference so it can be removed
	 * again: this service adds and removes its OWN Room listener and never reaches for
	 * `removeAllListeners()`, which would take down every other subscriber of the Room too.
	 */
	private readonly publishConnectionState = (state: ConnectionState): void => this._connectionState.set(state);

	/**
	 * Reactive mirror of the Room's `ConnectionState`, with a single writer: the
	 * `ConnectionStateChanged` subscription registered when the Room is created. It exists so
	 * consumers can be `computed()` over the connection instead of probing the mutable `Room.state`
	 * and mirroring it into a local signal kept in sync by an effect.
	 *
	 * This is the *connection* state only. Which screen the meeting shows (loading / prejoin /
	 * error…) is a separate concern owned by `MeetingViewComponent`'s `MeetingViewPhase`.
	 */
	readonly connectionState = this._connectionState.asReadonly();

	/**
	 * Whether the local participant is connected to the room. While connecting or reconnecting the
	 * room is initialized but not connected, so this is false.
	 */
	readonly isConnected = computed(() => this._connectionState() === ConnectionState.Connected);

	/**
	 * Whether the connection dropped and the client is performing a full reconnect. A
	 * signal-only reconnect (`SignalReconnecting`) keeps media flowing and is deliberately excluded.
	 */
	readonly isReconnecting = computed(() => this._connectionState() === ConnectionState.Reconnecting);

	/**
	 * @internal
	 * Indicates whether the client initiated disconnect event should be handled.
	 * This is used to determine if the disconnect event should be emitted when the 'Disconnect' event is triggered
	 */
	shouldHandleClientInitiatedDisconnectEvent = true;

	private livekitToken = '';
	private livekitUrl = '';
	private log: ILogger = inject(LoggerService).get('MeetingLiveKitService');

	/**
	 * Creates a new Room with audio and video devices selected or default ones.
	 * @internal
	 */
	init(): void {
		// Check if E2EE configuration needs to be applied
		const e2eeKey = this.configService.getE2EEKey();
		const needsE2EEConfig = e2eeKey && e2eeKey.trim() !== '' && !this.keyProvider;

		// If room already exists and doesn't need E2EE reconfiguration, don't recreate it
		if (this.room && !needsE2EEConfig) {
			this.log.d('Room already initialized, skipping re-initialization');
			// Re-arm rather than trust: the subscription is idempotent (removed before it is added), so a
			// Room whose listeners were stripped from outside still ends up with exactly one writer.
			this.trackConnectionState(this.room);
			return;
		}

		// If room exists but needs E2EE configuration, we need to recreate it
		if (this.room && needsE2EEConfig) {
			this.log.d('Room needs E2EE configuration, recreating room');
			this.untrackConnectionState(this.room);
			this.room = undefined;
		}

		const videoDeviceId = this.deviceService.cameraSelected()?.device ?? undefined;
		const audioDeviceId = this.deviceService.microphoneSelected()?.device ?? undefined;

		const roomOptions: RoomOptions = {
			adaptiveStream: true,
			dynacast: true,
			audioCaptureDefaults: {
				deviceId: audioDeviceId,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true
			},
			videoCaptureDefaults: {
				deviceId: videoDeviceId,
				resolution: VideoPresets.h720.resolution
			},
			publishDefaults: {
				dtx: true,
				simulcast: true,
				stopMicTrackOnMute: true
			},
			stopLocalTrackOnUnpublish: true,
			disconnectOnPageLeave: true
		};

		// Configure E2EE if key is provided and keyProvider exists
		if (needsE2EEConfig) {
			roomOptions.encryption = this.buildE2EEOptions();
		}

		this.room = this.livekitSdkService.createRoom(roomOptions);
		this.trackConnectionState(this.room);
		this.log.d('Room initialized successfully');
	}

	/**
	 * Publishes the Room's connection state into {@link connectionState}. Subscribed where the Room is
	 * created, so that signal has exactly one writer, and safe to call again on the same Room: the
	 * listener is removed before it is added. The state is seeded from the Room rather than assumed,
	 * because `init()` also recreates the Room to apply E2EE.
	 */
	private trackConnectionState(room: Room): void {
		room.off(RoomEvent.ConnectionStateChanged, this.publishConnectionState);
		this._connectionState.set(room.state);
		room.on(RoomEvent.ConnectionStateChanged, this.publishConnectionState);
	}

	/**
	 * Removes this service's own connection-state subscription from `room`, leaving every other
	 * subscriber of that Room untouched.
	 */
	private untrackConnectionState(room: Room): void {
		room.off(RoomEvent.ConnectionStateChanged, this.publishConnectionState);
	}

	private buildE2EEOptions(): E2EEOptions {
		this.log.d('Configuring E2EE with provided key');
		this.keyProvider = new ExternalE2EEKeyProvider();
		this.e2eeWorker = this.createE2EEWorker();
		return {
			keyProvider: this.keyProvider,
			worker: this.e2eeWorker
		};
	}

	/**
	 * Loads the livekit-client E2EE worker, which is served from the Meet server's
	 * assets. `resolveUrl` points it at that server — in webcomponent mode that may
	 * be a remote, cross-origin origin. A module Worker cannot be constructed
	 * directly from a cross-origin script URL, so in that case it is wrapped in a
	 * same-origin blob that imports the real worker (the backend serves assets with
	 * CORS). Same-origin (SPA / same-origin embed) loads the URL directly.
	 */
	private createE2EEWorker(): Worker {
		const url = new URL(this.assets.e2eeWorker, window.location.href);

		if (url.origin === window.location.origin) {
			return new Worker(url.href, { type: 'module' });
		}

		const bootstrap = `import ${JSON.stringify(url.href)};`;
		const blobUrl = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }));
		return new Worker(blobUrl, { type: 'module' });
	}

	/**
	 * Connects local participant to the room
	 */
	async connect(): Promise<void> {
		try {
			const room = this.getRoom();

			// Configure E2EE if key provider was initialized
			if (this.keyProvider) {
				const e2eeKey = this.configService.getE2EEKey();

				if (e2eeKey) {
					this.log.d('Setting E2EE key and enabling encryption');
					await this.keyProvider.setKey(e2eeKey);
					await room.setE2EEEnabled(true);
					this.log.d('E2EE successfully enabled');
				}
			}

			await this.livekitSdkService.connectRoom(room, this.livekitUrl, this.livekitToken);
			this.log.d(`Successfully connected to room ${room.name}`);

			const participantName = this.storageService.getParticipantName();

			if (participantName) {
				room.localParticipant.setName(participantName);
			}
		} catch (error) {
			this.log.e('Error connecting to room:', error);
			throw {
				code: 'CONNECTION_ERROR',
				message: `Error connecting to the server at the following URL: ${this.livekitUrl}`
			};
		}
	}

	/**
	 * Disconnects from the current room.
	 *
	 * This method will check if there's an active connection to a room before attempting to disconnect.
	 * If the room is connected, it will perform the disconnection and call the optional callback function.
	 *
	 * @param callback - Optional function to be executed after a successful disconnection
	 * @returns A Promise that resolves once the disconnection is complete
	 */
	async disconnect(
		callback?: () => void,
		shouldHandleClientInitiatedDisconnectEvent = true
	): Promise<void> {
		this.shouldHandleClientInitiatedDisconnectEvent = shouldHandleClientInitiatedDisconnectEvent;
		const room = this.room;

		if (room && this.isConnected()) {
			this.log.d('Disconnecting from room');
			await this.livekitSdkService.disconnectRoom(room);

			if (callback) callback();
		}
	}

	/**
	 * Tears down the current Room and leaves the service ready for a clean `init()`.
	 *
	 * The Room's lifecycle belongs to this service alone, so this is the only way out: it removes the
	 * listener it registered itself — never the caller's, and never `removeAllListeners()` — makes sure
	 * the connection is closed, and clears `this.room` so the next `init()` builds a fresh Room with a
	 * fresh connection-state subscription instead of silently reusing the outgoing one.
	 */
	async teardown(): Promise<void> {
		const room = this.room;

		if (!room) return;

		this.log.d('Tearing down the room');

		const state = this._connectionState();

		try {
			if (state === ConnectionState.Connected) {
				// Not a client-initiated leave: whoever ended the meeting emitted its own event already.
				await this.disconnect(undefined, false);
			} else if (state !== ConnectionState.Disconnected) {
				// Connecting / reconnecting: `disconnect()` guards on `isConnected()` and would skip this
				// Room, leaving it negotiating in the background with the local tracks still attached.
				this.log.d(`Closing a room left in state '${state}'`);
				this.shouldHandleClientInitiatedDisconnectEvent = false;
				await this.livekitSdkService.disconnectRoom(room);
			}
		} finally {
			this.untrackConnectionState(room);

			// Reset the service only if a new meeting has not claimed it while the disconnect was in
			// flight: Angular does not await `ngOnDestroy`, so a remount can overlap this teardown.
			if (this.room === room) {
				this.room = undefined;
				this.keyProvider = undefined;
				this.e2eeWorker?.terminate();
				this.e2eeWorker = undefined;
				this.shouldHandleClientInitiatedDisconnectEvent = true;
				this._connectionState.set(ConnectionState.Disconnected);
			}
		}
	}

	/**
	 * @returns Room instance
	 */
	getRoom(): Room {
		if (!this.room) {
			this.log.e('Room is not initialized. Make sure token is set before accessing the room.');
			throw new Error('Room is not initialized. Make sure token is set before accessing the room.');
		}

		return this.room;
	}

	/**
	 * Checks if room is initialized without throwing an error
	 * @returns true if room is initialized, false otherwise
	 */
	isInitialized(): boolean {
		return !!this.room;
	}

	/**
	 * Returns the room name
	 */
	getRoomName(): string {
		return this.room?.name ?? '';
	}

	hasRoomTracksPublished(): boolean {
		const { localParticipant, remoteParticipants } = this.getRoom();
		const localTracks = localParticipant.getTrackPublications();
		const remoteTracks = Array.from(remoteParticipants.values()).flatMap((p: any) => p.getTrackPublications());

		return localTracks.length > 0 || remoteTracks.length > 0;
	}

	/**
	 * @internal
	 */
	initializeAndSetToken(token: string, livekitUrl?: string): void {
		const { livekitUrl: urlFromToken } = this.extractLivekitData(token);

		this.livekitToken = token;
		const url = livekitUrl || urlFromToken;

		if (!url) {
			this.log.e(
				'LiveKit URL is not defined. Please, check the livekitUrl parameter of the VideoConferenceComponent'
			);
			throw new Error('Livekit URL is not defined');
		}

		this.livekitUrl = url;

		// Initialize room if it doesn't exist yet
		// This ensures that getRoom() won't fail if token is set before onTokenRequested
		if (!this.room) {
			this.log.d('Room not initialized yet, initializing room due to token assignment');
			this.init();
		}
	}

	/**
	 * Extracts Livekit data from the provided token and returns an object containing the Livekit URL and room admin status.
	 * @param token - The token to extract Livekit data from.
	 * @returns An object containing the Livekit URL and room admin status.
	 * @throws Error if there is an error decoding and parsing the token.
	 * @internal
	 */
	private extractLivekitData(token: string): { livekitUrl?: string; livekitRoomAdmin: boolean } {
		try {
			const base64Url = token.split('.')[1];
			const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
			const jsonPayload = decodeURIComponent(
				window
					.atob(base64)
					.split('')
					.map((c) => {
						return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
					})
					.join('')
			);

			const payload = JSON.parse(jsonPayload);

			if (payload?.metadata) {
				const tokenMetadata = JSON.parse(payload.metadata);
				return {
					livekitUrl: tokenMetadata.livekitUrl,
					livekitRoomAdmin: !!tokenMetadata.roomAdmin
				};
			}

			return { livekitRoomAdmin: false };
		} catch (error) {
			throw new Error('Error decoding and parsing token: ' + error, { cause: error });
		}
	}
}
