import { computed, inject, Service, OnDestroy, signal } from '@angular/core';
import { CameraType, CustomDevice, DeviceType } from '../../models/device.model';
import type { LocalTrack } from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { PlatformService } from '../platform/platform.service';
import { MediaStorageService } from '../storage/storage.service';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { ILogger } from '../../../../../shared/models/logger.model';

/**
 * Device service with reactive state and independent audio/video handling.
 *
 * Design:
 * - Enumeration-only: this service never calls getUserMedia itself. Media permission is obtained
 *   when the real local tracks are created (prejoin / connect), so there is no throwaway probe
 *   that would acquire and immediately release the camera/microphone. Device labels, and hence a
 *   populated device list, only become available once that permission has been granted.
 * - Angular Signals for reactive state management (cameras, microphones as signals)
 * - Live device detection - automatically refreshes the list when devices are connected/disconnected
 * - LiveKit client integration for modern device enumeration
 *
 * @internal
 */
@Service()
export class DeviceService implements OnDestroy {
	private readonly loggerSrv = inject(LoggerService);
	private readonly platformSrv = inject(PlatformService);
	private readonly storageSrv = inject(MediaStorageService);
	private readonly livekitSdkService = inject(LivekitSdkService);

	// Reactive device lists with Signals
	readonly cameras = signal<CustomDevice[]>([]);
	readonly microphones = signal<CustomDevice[]>([]);
	readonly cameraSelected = signal<CustomDevice | undefined>(undefined);
	readonly microphoneSelected = signal<CustomDevice | undefined>(undefined);

	// Whether a device of each kind has been opened at least once; see {@link syncDevicesAfterAcquisition}.
	private readonly cameraOpenAttempted = signal(false);
	private readonly microphoneOpenAttempted = signal(false);

	// A device only enters the lists above once it carries a label, which the browser withholds until
	// media permission is granted, so an empty list means "not asked yet" until a device of that kind
	// has been opened. The media toggles gate on these, and it is the toggle that does the asking.
	readonly hasVideoDevices = computed(() => !this.cameraOpenAttempted() || this.cameras().length > 0);
	readonly hasAudioDevices = computed(() => !this.microphoneOpenAttempted() || this.microphones().length > 0);

	private log: ILogger;
	private deviceChangeHandler: (() => void) | null = null;
	private deviceChangeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	// Browsers commonly fire several `devicechange` events for a single hotplug; coalesce them.
	private readonly DEVICE_CHANGE_DEBOUNCE_MS = 300;

	constructor() {
		this.log = this.loggerSrv.get('DeviceService');
	}

	/**
	 * Cleanup when service is destroyed
	 */
	ngOnDestroy(): void {
		// Cancel any pending debounced refresh
		if (this.deviceChangeDebounceTimer) {
			clearTimeout(this.deviceChangeDebounceTimer);
			this.deviceChangeDebounceTimer = null;
		}

		// Remove device change listener
		if (this.deviceChangeHandler && navigator.mediaDevices?.removeEventListener) {
			navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
			this.deviceChangeHandler = null;
			this.log.d('Device change detection disabled');
		}
	}

	/**
	 * Enumerate media devices, populate the reactive lists and start following device hotplugs.
	 *
	 * This does NOT request media permission: before any track has been created the lists stay
	 * empty, and {@link syncDevicesAfterAcquisition} populates them once one has.
	 */
	async initializeDevices(): Promise<void> {
		this.clear();
		await this.refreshDevices();
		this.setupDeviceChangeDetection();
	}

	/**
	 * Enumerate devices using LiveKit's Room API or the browser API.
	 *
	 * Only devices that already expose a label are kept (see {@link filterValidDevices}); labels are
	 * exposed by the browser once media permission has been granted.
	 */
	private async enumerateDevices(): Promise<MediaDeviceInfo[]> {
		try {
			// Prefer LiveKit's enumeration (handles some cross-browser quirks).
			const devices = await this.livekitSdkService.getLocalDevices();
			return this.filterValidDevices(devices);
		} catch (error) {
			this.log.w('LiveKit device enumeration failed, falling back to browser API', error);
			const devices = await navigator.mediaDevices.enumerateDevices();
			return this.filterValidDevices(devices);
		}
	}

	/**
	 * Filter out invalid or default devices
	 */
	private filterValidDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
		return devices.filter(
			(d) => d.label && d.deviceId && d.deviceId !== 'default'
		);
	}

	/**
	 * Process raw devices into typed camera and microphone lists
	 */
	private processDevices(devices: MediaDeviceInfo[]): void {
		// Process video devices
		const camerasArray = devices
			.filter((d) => d.kind === DeviceType.VIDEO_INPUT)
			.map((d) => this.createCustomDevice(d, CameraType.BACK));

		// Process audio devices
		const microphonesArray = devices
			.filter((d) => d.kind === DeviceType.AUDIO_INPUT)
			.map((d) => ({ label: d.label, device: d.deviceId }));

		// Detect camera types (front/back)
		this.detectCameraTypes(camerasArray);

		// Update signals (availability/permission computeds derive from these)
		this.cameras.set(camerasArray);
		this.microphones.set(microphonesArray);
	}

	/**
	 * Detect camera types (front/back) based on platform and labels
	 */
	private detectCameraTypes(cameras: CustomDevice[]): void {
		if (cameras.length === 0) return;

		if (this.platformSrv.isMobile()) {
			// On mobile, detect by label
			cameras.forEach((camera) => {
				if (camera.label.toLowerCase().includes(CameraType.FRONT.toLowerCase())) {
					camera.type = CameraType.FRONT;
				}
			});
		} else {
			// On desktop, first camera is typically front-facing
			cameras[0].type = CameraType.FRONT;
		}
	}

	/**
	 * Create custom device object
	 */
	private createCustomDevice(device: MediaDeviceInfo, defaultType: CameraType): CustomDevice {
		return {
			label: device.label,
			device: device.deviceId,
			type: defaultType
		};
	}

	/**
	 * Keeps each selection on a listed device: the current one while it is still there, else the
	 * stored preference, else the first device.
	 */
	private updateSelectedDevices(): void {
		this.cameraSelected.set(
			this.pickSelected(this.cameras(), this.cameraSelected(), this.storageSrv.getVideoDevice())
		);
		this.microphoneSelected.set(
			this.pickSelected(this.microphones(), this.microphoneSelected(), this.storageSrv.getAudioDevice())
		);
	}

	private pickSelected(
		devices: CustomDevice[],
		...preferred: (CustomDevice | null | undefined)[]
	): CustomDevice | undefined {
		for (const candidate of preferred) {
			const match = devices.find((d) => d.device === candidate?.device);

			if (match) return match;
		}

		return devices[0];
	}

	/**
	 * Align the selected camera/microphone with the devices actually backing the given local tracks.
	 *
	 * Called right after the initial track creation so the device selectors reflect the hardware the
	 * browser really opened (e.g. the default device picked on first visit) rather than a guess made
	 * before enumeration. A stored preference, when the matching device exists, has already been
	 * honoured by the track creation, so this is a no-op in that common case.
	 */
	private syncSelectedFromTracks(tracks: LocalTrack[]): void {
		for (const track of tracks) {
			const deviceId = track?.mediaStreamTrack?.getSettings?.().deviceId;

			if (!deviceId) continue;

			if (track.kind === Track.Kind.Video) {
				const match = this.cameras().find((c) => c.device === deviceId);

				if (match) this.cameraSelected.set(match);
			} else if (track.kind === Track.Kind.Audio) {
				const match = this.microphones().find((m) => m.device === deviceId);

				if (match) this.microphoneSelected.set(match);
			}
		}
	}

	/**
	 * Settles the device state after an attempt to open the given kinds, whatever its outcome.
	 *
	 * Opening a device is what grants media permission and reveals the device labels, so this is the
	 * moment the lists become conclusive, populated or still empty, and the moment
	 * {@link hasVideoDevices}/{@link hasAudioDevices} stop being optimistic about those kinds.
	 *
	 * Best-effort: an enumeration failure is logged, never thrown, so it can neither block joining
	 * nor make the caller re-acquire the tracks.
	 */
	async syncDevicesAfterAcquisition(kinds: Track.Kind[], tracks: LocalTrack[] = []): Promise<void> {
		if (kinds.includes(Track.Kind.Video)) this.cameraOpenAttempted.set(true);

		if (kinds.includes(Track.Kind.Audio)) this.microphoneOpenAttempted.set(true);

		try {
			await this.refreshDevices();
			this.syncSelectedFromTracks(tracks);
		} catch (error) {
			this.log.w('Failed to enumerate devices after opening a device', error);
		}
	}

	/**
	 * Refresh devices (e.g., when a device is plugged/unplugged).
	 *
	 * Re-enumerates only: it does not request permission, so it is cheap to call from the
	 * `devicechange` handler.
	 */
	async refreshDevices(): Promise<void> {
		const devices = await this.enumerateDevices();
		this.processDevices(devices);
		this.updateSelectedDevices();

		this.log.d('Devices refreshed', {
			cameras: this.cameras().length,
			microphones: this.microphones().length
		});
	}

	/**
	 * Setup live device change detection
	 * Automatically refreshes device list when devices are connected/disconnected
	 */
	private setupDeviceChangeDetection(): void {
		if (!navigator.mediaDevices?.addEventListener) {
			this.log.w('Device change detection not supported');
			return;
		}

		// Remove existing listener if any
		if (this.deviceChangeHandler) {
			navigator.mediaDevices.removeEventListener('devicechange', this.deviceChangeHandler);
		}

		// Create new handler: debounce so a burst of `devicechange` events triggers a single refresh
		this.deviceChangeHandler = () => {
			if (this.deviceChangeDebounceTimer) {
				clearTimeout(this.deviceChangeDebounceTimer);
			}

			this.deviceChangeDebounceTimer = setTimeout(() => {
				this.deviceChangeDebounceTimer = null;
				this.log.d('Device change detected, refreshing device list');
				void this.refreshDevices();
			}, this.DEVICE_CHANGE_DEBOUNCE_MS);
		};

		// Register listener
		navigator.mediaDevices.addEventListener('devicechange', this.deviceChangeHandler);
		this.log.d('Device change detection enabled');
	}

	/**
	 * Set selected camera and persist to storage
	 */
	setCameraSelected(deviceId: string): void {
		const device = this.cameras().find((c) => c.device === deviceId);

		if (!device) {
			this.log.w('Camera not found:', deviceId);
			return;
		}

		this.cameraSelected.set(device);
		this.storageSrv.setVideoDevice(device);
		this.log.d('Camera selected:', device.label);
	}

	/**
	 * Set selected microphone and persist to storage
	 */
	setMicSelected(deviceId: string): void {
		const device = this.microphones().find((m) => m.device === deviceId);

		if (!device) {
			this.log.w('Microphone not found:', deviceId);
			return;
		}

		this.microphoneSelected.set(device);
		this.storageSrv.setAudioDevice(device);
		this.log.d('Microphone selected:', device.label);
	}

	/**
	 * Check if video track needs to be updated
	 */
	needUpdateVideoTrack(newDevice: CustomDevice): boolean {
		const current = this.cameraSelected();
		return (
			current?.device !== newDevice.device ||
			current?.label !== newDevice.label
		);
	}

	/**
	 * Check if audio track needs to be updated
	 */
	needUpdateAudioTrack(newDevice: CustomDevice): boolean {
		const current = this.microphoneSelected();
		return (
			current?.device !== newDevice.device ||
			current?.label !== newDevice.label
		);
	}

	/**
	 * Clear all device data
	 */
	clear(): void {
		this.cameras.set([]);
		this.microphones.set([]);
		this.cameraSelected.set(undefined);
		this.microphoneSelected.set(undefined);
		this.cameraOpenAttempted.set(false);
		this.microphoneOpenAttempted.set(false);
	}
}
