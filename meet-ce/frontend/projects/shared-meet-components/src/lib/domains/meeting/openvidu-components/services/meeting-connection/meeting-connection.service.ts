import { inject, Injectable } from '@angular/core';
import { OpenViduComponentsConfigService } from '../config/directive-config.service';
import { DeviceService } from '../device/device.service';
import {
	ConnectionState,
	ExternalE2EEKeyProvider,
	E2EEOptions,
	Room,
	RoomOptions,
	VideoPresets
} from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { StorageService } from '../storage/storage.service';
import { AssetsService } from '../../../../../shared/services/assets.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Owns the live meeting connection: the LiveKit Room lifecycle (create/connect/disconnect),
 * its E2EE setup (worker + key provider) and the connection token. Local media capture lives
 * separately in LocalTrackService.
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingConnectionService {
	private readonly deviceService = inject(DeviceService);
	private readonly storageService = inject(StorageService);
	private readonly configService = inject(OpenViduComponentsConfigService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly assets = inject(AssetsService);

	private room: Room | undefined = undefined;
	private keyProvider: ExternalE2EEKeyProvider | undefined;

	/**
	 * @internal
	 * Indicates whether the client initiated disconnect event should be handled.
	 * This is used to determine if the disconnect event should be emitted when the 'Disconnect' event is triggered
	 */
	shouldHandleClientInitiatedDisconnectEvent = true;

	private livekitToken = '';
	private livekitUrl = '';
	private log: ILogger = inject(LoggerService).get('MeetingConnectionService');

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
			return;
		}

		// If room exists but needs E2EE configuration, we need to recreate it
		if (this.room && needsE2EEConfig) {
			this.log.d('Room needs E2EE configuration, recreating room');
			this.room = undefined;
		}

		const videoDeviceId = this.deviceService.getCameraSelected()?.device ?? undefined;
		const audioDeviceId = this.deviceService.getMicrophoneSelected()?.device ?? undefined;

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
		this.log.d('Room initialized successfully');
	}

	private buildE2EEOptions(): E2EEOptions {
		this.log.d('Configuring E2EE with provided key');
		this.keyProvider = new ExternalE2EEKeyProvider();
		return {
			keyProvider: this.keyProvider,
			worker: this.createE2EEWorker()
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
		shouldHandleClientInitiatedDisconnectEvent: boolean = true
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

	/**
	 * Returns if local participant is connected to the room
	 * @returns
	 */
	isConnected(): boolean {
		return this.room?.state === ConnectionState.Connected;
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
			throw new Error('Error decoding and parsing token: ' + error);
		}
	}
}
