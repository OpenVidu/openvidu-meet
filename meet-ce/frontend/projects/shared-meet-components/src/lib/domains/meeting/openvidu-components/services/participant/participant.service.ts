import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { ParticipantModel, ParticipantProperties } from '../../models/participant.model';
import { OpenViduComponentsConfigService } from '../config/directive-config.service';
import { GlobalConfigService } from '../config/global-config.service';
import { E2eeService } from '../e2ee/e2ee.service';
import type {
	OVAudioCaptureOptions,
	OVDataPublishOptions,
	OVLocalParticipant,
	OVLocalTrackPublication,
	OVParticipant,
	OVRemoteParticipant,
	OVScreenShareCaptureOptions,
	OVVideoCaptureOptions
} from '../livekit-adapter';
import { Track, VideoPresets } from '../livekit-adapter';
import { LoggerService } from '../logger/logger.service';
import { OpenViduService } from '../openvidu/openvidu.service';
import { StorageService } from '../storage/storage.service';

@Injectable({
	providedIn: 'root'
})
export class ParticipantService {
	private readonly globalService = inject(GlobalConfigService);
	private readonly directiveService = inject(OpenViduComponentsConfigService);
	private readonly openviduService = inject(OpenViduService);
	private readonly storageSrv = inject(StorageService);
	private readonly e2eeService = inject(E2eeService);
	private readonly log = inject(LoggerService).get('ParticipantService');

	/**
	 * Local participant Signal for reactive programming with Angular signals.
	 */
	localParticipantSignal: Signal<ParticipantModel | undefined>;
	private localParticipantWritableSignal: WritableSignal<ParticipantModel | undefined> = signal<
		ParticipantModel | undefined
	>(undefined);
	readonly localParticipantNameSignal = computed(() => this.localParticipantWritableSignal()?.name ?? '');
	readonly localParticipantIdentitySignal = computed(() => this.localParticipantWritableSignal()?.identity ?? '');

	/**
	 * Remote participants Signal for reactive programming with Angular signals.
	 * This is a modern alternative to remoteParticipants$ Observable.
	 * @since Angular 16+
	 */
	remoteParticipantsSignal: Signal<ParticipantModel[]>;
	private remoteParticipantsWritableSignal: WritableSignal<ParticipantModel[]> = signal<ParticipantModel[]>([]);
	readonly totalParticipantsSignal = computed(
		() => (this.localParticipantWritableSignal() ? 1 : 0) + this.remoteParticipantsWritableSignal().length
	);
	readonly hasRemoteEncryptionErrorsSignal = computed(() =>
		this.remoteParticipantsWritableSignal().some((participant) => participant.hasEncryptionError)
	);

	/**
	 * @internal
	 */
	constructor() {
		this.localParticipantSignal = this.localParticipantWritableSignal.asReadonly();
		this.remoteParticipantsSignal = this.remoteParticipantsWritableSignal.asReadonly();
	}

	/**
	 * @internal
	 */
	clear(): void {
		this.localParticipantWritableSignal.set(undefined);
		this.remoteParticipantsWritableSignal.set([]);
	}

	/**
	 * @internal
	 * Setting up the local participant object.
	 * @param participant
	 */
	setLocalParticipant(participant: OVLocalParticipant) {
		const room = this.openviduService.getRoom();
		const newParticipant = this.newParticipant({ participant, room });
		this.localParticipantWritableSignal.set(newParticipant);
	}

	/**
	 * Connects to the room and publishes the local tracks.
	 * @internal
	 */
	async connect(): Promise<void> {
		let isCameraEnabled: boolean = this.isMyCameraEnabled();
		let isMicrophoneEnabled: boolean = this.isMyMicrophoneEnabled();
		let prejoinTracks = this.openviduService.getLocalTracks();

		if (prejoinTracks.length === 0 && (isCameraEnabled || isMicrophoneEnabled)) {
			prejoinTracks = await this.openviduService.createLocalTracks(isCameraEnabled, isMicrophoneEnabled);
		}

		await this.openviduService.connectRoom();
		this.setLocalParticipant(this.openviduService.getRoom().localParticipant);

		const localParticipant = this.localParticipantSignal();
		const videoTrack = prejoinTracks.find((track) => track.kind === Track.Kind.Video);
		const audioTrack = prejoinTracks.find((track) => track.kind === Track.Kind.Audio);

		const promises: Promise<OVLocalTrackPublication>[] = [];
		if (localParticipant && videoTrack) {
			promises.push(localParticipant.publishTrack(videoTrack));
		}
		if (localParticipant && audioTrack) {
			promises.push(localParticipant?.publishTrack(audioTrack));
		}

		await Promise.all(promises);
		this.updateLocalParticipant();
		// if(!isCameraEnabled) await this.setCameraEnabled(isCameraEnabled);
		// if(!isMicrophoneEnabled) await this.setMicrophoneEnabled(isMicrophoneEnabled);
		// Once the Room is created, the temporary tracks are not longer needed.
		this.log.d('Connected to room', this.openviduService.getRoom());
		this.openviduService.getRoom().remoteParticipants.forEach((p) => {
			this.addRemoteParticipant(p);
		});
	}

	/**
	 * Publishes a new data payload to the room. Data will be forwarded to each participant in the room if the destination field in publishOptions is empty.
	 * @param data
	 * @param {DataPublishOptions} publishOptions [DataPublishOptions](https://docs.livekit.io/client-sdk-js/types/DataPublishOptions.html)
	 */
	publishData(data: Uint8Array, publishOptions: OVDataPublishOptions): Promise<void> {
		const localParticipant = this.localParticipantSignal();
		if (localParticipant) {
			return localParticipant.publishData(data, publishOptions);
		}
		return Promise.reject('Local participant not found');
	}

	/**
	 * Switches the active camera track used in this room to the given device id.
	 * @param deviceId
	 */
	async switchCamera(deviceId: string): Promise<void> {
		if (this.openviduService.isRoomConnected()) {
			const localParticipant = this.localParticipantSignal();
			await localParticipant?.switchCamera(deviceId);
		} else {
			await this.openviduService.switchCamera(deviceId);
		}
		// this.updateLocalParticipant();
	}

	/**
	 * Switches the active microphone track used in this room to the given device id.
	 * @param deviceId
	 */
	async switchMicrophone(deviceId: string): Promise<void> {
		if (this.openviduService.isRoomConnected()) {
			const localParticipant = this.localParticipantSignal();
			await localParticipant?.switchMicrophone(deviceId);
		} else {
			await this.openviduService.switchMicrophone(deviceId);
		}
		// this.updateLocalParticipant();
	}

	/**
	 * Switches the active screen share track showing a native browser dialog to select a screen or window.
	 */
	async switchScreenShare(): Promise<void> {
		const localParticipant = this.localParticipantSignal();
		if (!localParticipant) {
			this.log.e('Local participant is undefined when switching screenshare');
			return;
		}

		// Chrome / Safari: seamless replaceTrack keeps the same publication SID.
		const options = this.getScreenCaptureOptions();
		const [newTrack] = await localParticipant.createScreenTracks(options);
		if (newTrack) {
			newTrack.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setScreenShareEnabled(false);
			});

			try {
				await localParticipant.switchScreenshare(newTrack);
			} catch (error) {
				newTrack.stop();
				throw error;
			}
		}

		// this.updateLocalParticipant();
	}

	/**
	 * Sets the local participant camera enabled or disabled.
	 * @param enabled
	 */
	async setCameraEnabled(enabled: boolean): Promise<void> {
		if (this.openviduService.isRoomConnected()) {
			const storageDevice = this.storageSrv.getVideoDevice();
			let options: OVVideoCaptureOptions | undefined;
			if (storageDevice) {
				options = {
					deviceId: storageDevice.device,
					facingMode: 'user',
					resolution: VideoPresets.h720.resolution
				};
			}
			await this.localParticipantWritableSignal()?.setCameraEnabled(enabled, options);
			this.updateLocalParticipant();
		} else {
			await this.openviduService.setVideoTrackEnabled(enabled);
		}
	}

	/**
	 * Sets the local participant microphone enabled or disabled.
	 * @param enabled
	 */
	async setMicrophoneEnabled(enabled: boolean): Promise<void> {
		if (this.openviduService.isRoomConnected()) {
			const storageDevice = this.storageSrv.getAudioDevice();
			let options: OVAudioCaptureOptions | undefined;
			if (storageDevice) {
				options = {
					deviceId: storageDevice.device
				};
			}
			await this.localParticipantWritableSignal()?.setMicrophoneEnabled(enabled, options);
			this.updateLocalParticipant();
		} else {
			this.openviduService.setAudioTrackEnabled(enabled);
		}
	}

	/**
	 * Share or unshare the local participant screen.
	 * @param enabled: true to share the screen, false to unshare it
	 *
	 */
	async setScreenShareEnabled(enabled: boolean): Promise<void> {
		const options = this.getScreenCaptureOptions();
		const track = await this.localParticipantWritableSignal()?.setScreenShareEnabled(enabled, options);
		if (enabled && track) {
			// Set all videos to normal size when a local screen is shared
			this.resetRemoteStreamsToNormalSize();
			this.resetMyStreamsToNormalSize();
			this.localParticipantWritableSignal()?.toggleVideoPinned(track.trackSid);
			this.localParticipantWritableSignal()?.setScreenTrackPublicationDate(track.trackSid, new Date().getTime());

			track?.addListener('ended', async () => {
				this.log.d('Clicked native stop button. Stopping screen sharing');
				await this.setScreenShareEnabled(false);
			});
		} else if (!enabled && track) {
			// Enlarge the last screen shared when a local screen is stopped
			this.localParticipantWritableSignal()?.setScreenTrackPublicationDate(track.trackSid, -1);
			this.resetRemoteStreamsToNormalSize();
			this.resetMyStreamsToNormalSize();
			this.setLastScreenPinned();
		}
		this.updateLocalParticipant();
	}

	/**
	 * @internal
	 * As updating name requires that the participant has the `canUpdateOwnMetadata` to true in server side, which is a little bit insecure,
	 * we decided to not allow this feature for now.
	 */
	// setMyName(name: string) {
	// 	if (!this.localParticipantWritableSignal()) return;
	// 	this.localParticipantWritableSignal().setName(name);
	// 	this.updateLocalParticipant();
	// }

	/**
	 * Sets as speaking to all participants given in the array.
	 * @param speakers
	 * @internal
	 */
	setSpeaking(speakers: OVParticipant[]) {
		let shouldUpdateLocal = false;
		let shouldUpdateRemotes = false;

		// Set all participants' isSpeaking property to false
		const local = this.localParticipantWritableSignal();
		if (local?.isSpeaking) {
			local.setSpeaking(false);
			shouldUpdateLocal = true;
		}
		this.remoteParticipantsSignal().forEach((participant) => {
			if (participant.isSpeaking) {
				participant.setSpeaking(false);
				shouldUpdateRemotes = true;
			}
		});

		speakers.forEach((s) => {
			if (s.isLocal) {
				const local = this.localParticipantWritableSignal();
				if (local && !local.isSpeaking) {
					local.setSpeaking(true);
					shouldUpdateLocal = true;
				}
			} else {
				const participant = this.remoteParticipantsSignal().find((p) => p.sid === s.sid);
				if (participant && !participant.isSpeaking) {
					participant.setSpeaking(true);
					shouldUpdateRemotes = true;
				}
			}
		});

		if (shouldUpdateLocal) {
			this.updateLocalParticipant();
		}
		if (shouldUpdateRemotes) {
			this.updateRemoteParticipants();
		}
	}

	/**
	 * Sets the encryption error state for a participant.
	 * This is called when a participant cannot decrypt video streams due to an incorrect encryption key.
	 * @param participantSid - The SID of the participant with the encryption error
	 * @param hasError - Whether the participant has an encryption error
	 * @internal
	 */
	setEncryptionError(participantSid: string, hasError: boolean) {
		const local = this.localParticipantWritableSignal();
		if (local?.sid === participantSid) {
			if (local.hasEncryptionError !== hasError) {
				local.setEncryptionError(hasError);
				this.updateLocalParticipant();
			}
		} else {
			const remotes = [...this.remoteParticipantsSignal()];
			const participant = remotes.find((p) => p.sid === participantSid);
			if (participant && participant.hasEncryptionError !== hasError) {
				participant.setEncryptionError(hasError);
				this.remoteParticipantsWritableSignal.set(remotes);
			}
		}
	}

	/**
	 * Returns the local participant name.
	 */
	getMyName(): string | undefined {
		return this.localParticipantNameSignal() || undefined;
	}

	getMyIdentity(): string | undefined {
		return this.localParticipantIdentitySignal() || undefined;
	}

	/**
	 * @internal
	 */
	toggleMyVideoPinned(sid: string | undefined) {
		const local = this.localParticipantWritableSignal();
		if (sid && local) local.toggleVideoPinned(sid);
		this.updateLocalParticipant();
	}

	/**
	 * @internal
	 */
	toggleMyVideoMinimized(sid: string | undefined) {
		const local = this.localParticipantWritableSignal();
		if (sid && local) local.toggleVideoMinimized(sid);
		this.updateLocalParticipant();
	}

	/**
	 * @internal
	 */
	resetMyStreamsToNormalSize() {
		this.localParticipantWritableSignal()?.setAllVideoPinned(false);
	}

	/**
	 * Returns if the local participant camera is enabled.
	 */
	isMyCameraEnabled(): boolean {
		const local = this.localParticipantWritableSignal();
		if (this.openviduService.isRoomConnected() && local) {
			return local.isCameraEnabled;
		} else {
			const directiveCameraEnabled = this.directiveService.isVideoEnabled();

			if (!directiveCameraEnabled) {
				return false;
			}
			return this.openviduService.isVideoTrackEnabled() && this.storageSrv.isCameraEnabled();
		}
	}

	/**
	 * Returns if the local participant microphone is enabled.
	 */
	isMyMicrophoneEnabled(): boolean {
		const local = this.localParticipantWritableSignal();
		if (this.openviduService.isRoomConnected() && local) {
			return local.isMicrophoneEnabled;
		} else {
			const directiveMicropgoneEnabled = this.directiveService.isAudioEnabled();

			if (!directiveMicropgoneEnabled) {
				return false;
			}
			return this.openviduService.isAudioTrackEnabled() && this.storageSrv.isMicrophoneEnabled();
		}
	}

	/**
	 * Returns if the local participant screen is enabled.
	 */
	isMyScreenShareEnabled(): boolean {
		return this.localParticipantWritableSignal()?.isScreenShareEnabled || false;
	}

	/**
	 * Forces to update the local participant object and notify signal consumers.
	 */
	updateLocalParticipant() {
		const participant = this.localParticipantWritableSignal();
		if (participant) {
			this.localParticipantWritableSignal.set(this.cloneParticipant(participant));
		} else {
			this.localParticipantWritableSignal.set(undefined);
		}
	}

	private cloneParticipant<T extends ParticipantModel>(participant: T): T {
		return Object.assign(Object.create(Object.getPrototypeOf(participant)), {
			...participant
		});
	}

	/**
	 * Sets the last screen element as pinned
	 * @internal
	 */
	setLastScreenPinned() {
		const local = this.localParticipantWritableSignal();
		if (!local?.isScreenShareEnabled && !this.someRemoteIsSharingScreen()) {
			return;
		}
		let localCreatedAt = -Infinity;
		let localTrackSid = '';
		if (local?.isScreenShareEnabled) {
			localCreatedAt = Math.max(...local.screenTrackPublicationDate.values());
			local.screenTrackPublicationDate.forEach((value, key) => {
				if (value === localCreatedAt) {
					localTrackSid = key;
					return;
				}
			});
		}

		let remoteCreatedAt = -Infinity;
		let remoteTrackSid = '';
		if (this.someRemoteIsSharingScreen()) {
			const lastRemoteParticipant = this.remoteParticipantsSignal().reduce((prev, current) => {
				const prevMax = Math.max(...prev.screenTrackPublicationDate.values());
				const currentMax = Math.max(...current.screenTrackPublicationDate.values());
				return prevMax > currentMax ? prev : current;
			});
			remoteCreatedAt = Math.max(...lastRemoteParticipant.screenTrackPublicationDate.values());
			lastRemoteParticipant.screenTrackPublicationDate.forEach((value, key) => {
				if (value === remoteCreatedAt) {
					remoteTrackSid = key;
					return;
				}
			});
		}

		if (remoteCreatedAt > localCreatedAt) {
			this.toggleRemoteVideoPinned(remoteTrackSid);
		} else {
			this.toggleMyVideoPinned(localTrackSid);
		}
	}

	/**
	 * Returns the participant with the given identity.
	 * @param identity
	 * @returns
	 */
	getParticipantByIdentity(identity: string): ParticipantModel | undefined {
		if (this.localParticipantWritableSignal()?.identity === identity) {
			return this.localParticipantWritableSignal();
		}
		return this.remoteParticipantsSignal().find((p) => p.identity === identity);
	}

	/* ------------------------------ Remote Participants ------------------------------ */

	/**
	 * Forces to update the remote participants array and notify signal consumers.
	 * Required because mutating internal object properties does not trigger signal equality checks.
	 * A shallow spread ([...array]) creates a new array reference, which is enough to
	 * invalidate computed/effects that depend on remoteParticipantsWritableSignal.
	 */
	private updateRemoteParticipants(): void {
		this.remoteParticipantsWritableSignal.set([...this.remoteParticipantsWritableSignal()]);
	}
	/**
	 * Returns the remote participant with the given sid.
	 * @param sid
	 */
	getRemoteParticipantBySid(sid: string): ParticipantModel | undefined {
		return this.remoteParticipantsSignal().find((p) => p.sid === sid);
	}

	/**
	 * @internal
	 */
	addRemoteParticipant(participant: OVRemoteParticipant) {
		const remotes = [...this.remoteParticipantsSignal()];
		const index = remotes.findIndex((p) => p.sid === participant.sid);
		if (index >= 0) {
			const remoteParticipant = remotes[index];
			const pp: ParticipantProperties = remoteParticipant.getProperties();
			pp.participant = participant;
			remotes[index] = this.newParticipant(pp);
		} else {
			remotes.push(this.newParticipant({ participant }));
		}
		this.remoteParticipantsWritableSignal.set(remotes);
	}

	/**
	 * Removes participant track from the remote participant object.
	 * @param participant
	 * @param trackSid
	 * @internal
	 */
	removeRemoteParticipantTrack(participant: OVRemoteParticipant, trackSid: string) {
		const remotes = [...this.remoteParticipantsSignal()];
		const index = remotes.findIndex((p) => p.sid === participant.sid);
		if (index >= 0) {
			const track = remotes[index].tracks.find((t) => t.trackSid === trackSid);
			track?.track?.stop();
			track?.track?.detach();
			const pp: ParticipantProperties = remotes[index].getProperties();
			pp.participant = participant;
			remotes[index] = this.newParticipant(pp);
			this.remoteParticipantsWritableSignal.set(remotes);
		}
	}

	/**
	 * @internal
	 */
	removeRemoteParticipant(sid: string) {
		const remotes = [...this.remoteParticipantsSignal()];
		const index = remotes.findIndex((p) => p.sid === sid);
		if (index !== -1) {
			remotes.splice(index, 1);
			this.remoteParticipantsWritableSignal.set(remotes);
		}
	}

	/**
	 * @internal
	 */
	resetRemoteStreamsToNormalSize() {
		const remotes = [...this.remoteParticipantsSignal()];
		remotes.forEach((participant) => participant.setAllVideoPinned(false));
		this.remoteParticipantsWritableSignal.set(remotes);
	}

	/**
	 * Set the screen track publication date of a remote participant with the aim of taking control of the last screen published
	 * @param participantSid
	 * @param trackSid
	 * @param createdAt
	 * @internal
	 */
	setScreenTrackPublicationDate(participantSid: string, trackSid: string, createdAt: number) {
		const remotes = [...this.remoteParticipantsSignal()];
		const participant = remotes.find((p) => p.sid === participantSid);
		if (participant) {
			participant.setScreenTrackPublicationDate(trackSid, createdAt);
			this.remoteParticipantsWritableSignal.set(remotes);
		}
	}

	/**
	 * @internal
	 */
	someRemoteIsSharingScreen(): boolean {
		return this.remoteParticipantsSignal().some((p) => p.isScreenShareEnabled);
	}

	/**
	 * @internal
	 */
	toggleRemoteVideoPinned(sid: string | undefined) {
		if (sid) {
			const remotes = [...this.remoteParticipantsSignal()];
			const participant = remotes.find((p) => p.tracks.some((track) => track.trackSid === sid));
			if (participant) {
				participant.toggleVideoPinned(sid);
			}
			this.remoteParticipantsWritableSignal.set(remotes);
		}
	}

	/**
	 * Sets the remote participant video track element muted or unmuted .
	 * @internal
	 */
	setRemoteMutedForcibly(sid: string, value: boolean) {
		const remotes = [...this.remoteParticipantsSignal()];
		const p = remotes.find((p) => p.sid === sid);
		if (p && p.isMutedForcibly !== value) {
			p.setMutedForcibly(value);
			this.remoteParticipantsWritableSignal.set(remotes);
		}
	}

	private newParticipant(props: ParticipantProperties): ParticipantModel {
		let participant: ParticipantModel;
		if (this.globalService.hasParticipantFactory()) {
			participant = this.globalService.getParticipantFactory().apply(this, [props]);
		} else {
			participant = new ParticipantModel(props);
		}

		// Decrypt participant name asynchronously if E2EE is enabled
		this.decryptParticipantName(participant);

		return participant;
	}

	/**
	 * Decrypts the participant name if E2EE is enabled.
	 * Updates the participant model asynchronously.
	 * @param participant - The participant model to decrypt the name for
	 * @private
	 */
	private async decryptParticipantName(participant: ParticipantModel): Promise<void> {
		const originalName = participant.name;
		if (!originalName) {
			return;
		}

		try {
			const decryptedName = await this.e2eeService.decryptOrMask(originalName, participant.identity);
			participant.setDecryptedName(decryptedName);

			// Update signals to reflect the decrypted name.
			if (participant.isLocal) {
				this.updateLocalParticipant();
			} else {
				this.updateRemoteParticipants();
			}
		} catch (error) {
			this.log.w('Failed to decrypt participant name:', error);
		}
	}

	private getScreenCaptureOptions(): OVScreenShareCaptureOptions {
		return {
			audio: true,
			video: {
				displaySurface: 'browser' // Set browser tab as default options
			},
			systemAudio: 'include', // Include system audio as an option
			resolution: VideoPresets.h1080.resolution,
			contentHint: 'text', // Optimized for detailed content, adjust based on use case
			suppressLocalAudioPlayback: true, // Prevent echo by not playing local audio
			selfBrowserSurface: 'exclude', // Avoid self capture to prevent mirror effect
			surfaceSwitching: 'include', // Allow users to switch shared tab dynamically
			preferCurrentTab: false // Do not force current tab to be selected
		};
	}
}
