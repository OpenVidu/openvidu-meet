import { inject, Service } from '@angular/core';
import { BrowserStorageService, type StorageArea } from '../../../../../shared/services/browser-storage.service';
import { CustomDevice } from '../../models/device.model';
import { MediaStorageKeys, TAB_SPECIFIC_KEYS } from '../../models/storage.model';

/**
 * @internal
 *
 * Stores the user's meeting media preferences in the browser via the shared
 * {@link BrowserStorageService} engine (composition — this store does not inherit from, nor touch,
 * the raw Web Storage APIs).
 *
 * Each key is routed to a backend according to its lifecycle:
 * - {@link TAB_SPECIFIC_KEYS} (participant name, camera/microphone state) live in `sessionStorage`.
 *   It is isolated per tab and wiped by the browser when the tab closes, so the same room can be
 *   opened in several tabs with independent settings and no stale data is left behind — which is
 *   why this service carries no manual tab-cleanup logic.
 * - Every other key lives in `localStorage`, shared across all tabs of the same origin and kept
 *   until explicitly removed (devices, virtual background).
 */
@Service()
export class MediaStorageService {
	private readonly storage = inject(BrowserStorageService);

	getParticipantName(): string | null {
		return this.storage.get<string>(MediaStorageKeys.PARTICIPANT_NAME, this.areaFor(MediaStorageKeys.PARTICIPANT_NAME));
	}

	setParticipantName(name: string): void {
		this.storage.set(MediaStorageKeys.PARTICIPANT_NAME, name, this.areaFor(MediaStorageKeys.PARTICIPANT_NAME));
	}

	getVideoDevice(): CustomDevice | null {
		return this.storage.get<CustomDevice>(MediaStorageKeys.VIDEO_DEVICE, this.areaFor(MediaStorageKeys.VIDEO_DEVICE));
	}

	setVideoDevice(device: CustomDevice): void {
		this.storage.set(MediaStorageKeys.VIDEO_DEVICE, device, this.areaFor(MediaStorageKeys.VIDEO_DEVICE));
	}

	getAudioDevice(): CustomDevice | null {
		return this.storage.get<CustomDevice>(MediaStorageKeys.AUDIO_DEVICE, this.areaFor(MediaStorageKeys.AUDIO_DEVICE));
	}

	setAudioDevice(device: CustomDevice): void {
		this.storage.set(MediaStorageKeys.AUDIO_DEVICE, device, this.areaFor(MediaStorageKeys.AUDIO_DEVICE));
	}

	/** Defaults to enabled: a missing key means the participant never turned the camera off. */
	isCameraEnabled(): boolean {
		return this.storage.get<boolean>(MediaStorageKeys.CAMERA_ENABLED, this.areaFor(MediaStorageKeys.CAMERA_ENABLED)) ?? true;
	}

	setCameraEnabled(enabled: boolean): void {
		this.storage.set(MediaStorageKeys.CAMERA_ENABLED, enabled, this.areaFor(MediaStorageKeys.CAMERA_ENABLED));
	}

	/** Defaults to enabled: a missing key means the participant never turned the microphone off. */
	isMicrophoneEnabled(): boolean {
		return (
			this.storage.get<boolean>(MediaStorageKeys.MICROPHONE_ENABLED, this.areaFor(MediaStorageKeys.MICROPHONE_ENABLED)) ??
			true
		);
	}

	setMicrophoneEnabled(enabled: boolean): void {
		this.storage.set(MediaStorageKeys.MICROPHONE_ENABLED, enabled, this.areaFor(MediaStorageKeys.MICROPHONE_ENABLED));
	}

	getBackground(): string | null {
		return this.storage.get<string>(MediaStorageKeys.BACKGROUND, this.areaFor(MediaStorageKeys.BACKGROUND));
	}

	setBackground(id: string): void {
		this.storage.set(MediaStorageKeys.BACKGROUND, id, this.areaFor(MediaStorageKeys.BACKGROUND));
	}

	removeBackground(): void {
		this.storage.remove(MediaStorageKeys.BACKGROUND, this.areaFor(MediaStorageKeys.BACKGROUND));
	}

	/** Tab-scoped keys route to `sessionStorage`; everything else to `localStorage`. */
	private areaFor(key: MediaStorageKeys): StorageArea {
		return TAB_SPECIFIC_KEYS.has(key) ? 'session' : 'local';
	}
}
