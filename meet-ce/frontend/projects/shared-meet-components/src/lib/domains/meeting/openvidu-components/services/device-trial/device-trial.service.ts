import { computed, effect, inject, Injectable, OnDestroy, Signal, signal, untracked } from '@angular/core';
import { acquireDevice } from '../../models/device-acquisition.model';
import { CustomDevice } from '../../models/device.model';
import { cameraCaptureOptions, microphoneCaptureOptions } from '../../models/media-capture.model';
import { MicLevelMeter } from '../../models/mic-level-meter.model';
import { DeviceService } from '../device/device.service';
import type { CreateLocalTracksOptions, LocalAudioTrack, LocalTrack, LocalVideoTrack } from '../livekit';
import { Track } from '../livekit';
import { LivekitSdkService } from '../livekit/livekit-sdk.service';
import { LocalMediaService } from '../local-media/local-media.service';
import { LoggerService } from '../../../../../shared/services/logger.service';

/** The devices an {@link DeviceTrialService.apply} put in place, for whoever announces device changes. */
export interface AppliedDevices {
	camera?: CustomDevice;
	microphone?: CustomDevice;
}

/**
 * A device picked to be tried, with its own capture, opened alongside the published one. Every
 * pick, discard and open carries a generation, so a capture that arrives after a newer pick or a
 * discard is closed on arrival instead of replacing the current one.
 */
class TriedDevice<T extends LocalTrack> {
	private readonly _device = signal<CustomDevice | undefined>(undefined);
	private readonly _track = signal<T | undefined>(undefined);
	private readonly meter = signal<MicLevelMeter | undefined>(undefined);
	private generation = 0;

	/** The picked device, from the pick until it is applied or discarded. */
	readonly device = this._device.asReadonly();
	/** The capture of the picked device, once it has opened. */
	readonly track = this._track.asReadonly();
	/** How loud a tried microphone captures, from 0 to 1. */
	readonly level = computed(() => this.meter()?.level() ?? 0);

	constructor(
		private readonly open: (deviceId: string) => Promise<T>,
		private readonly published: Signal<CustomDevice | undefined>
	) {}

	/** Opens the picked device; picking the published one only discards the current pick. Rejects when it cannot be opened. */
	async try(device: CustomDevice): Promise<void> {
		this.discard();

		if (device.device === this.published()?.device) return;

		const generation = this.generation;
		this._device.set(device);

		try {
			const track = await this.open(device.device);

			if (generation !== this.generation) {
				track.stop();
				return;
			}

			this._track.set(track);

			if (track.kind === Track.Kind.Audio) this.meter.set(new MicLevelMeter(track.mediaStreamTrack));
		} catch (error) {
			if (generation === this.generation) this.discard();

			throw error;
		}
	}

	discard(): void {
		this.generation++;
		this.meter()?.dispose();
		this.meter.set(undefined);

		const track = this._track();
		track?.stop();
		track?.detach();
		this._track.set(undefined);
		this._device.set(undefined);
	}
}

/**
 * The devices picked in the meeting's Audio & video settings and not applied yet. Picking opens a
 * capture of its own, so the participant sees and hears the device before the others receive it.
 * Provided by the component that hosts those settings: when it goes away, so does every capture
 * opened here. Selectors that find no instance switch the published device at once.
 */
@Injectable()
export class DeviceTrialService implements OnDestroy {
	private readonly localMedia = inject(LocalMediaService);
	private readonly deviceService = inject(DeviceService);
	private readonly livekitSdkService = inject(LivekitSdkService);
	private readonly log = inject(LoggerService).get('DeviceTrialService');
	private readonly _applying = signal(false);

	readonly camera = new TriedDevice<LocalVideoTrack>(
		(deviceId) => this.openOne({ video: cameraCaptureOptions(deviceId), audio: false }),
		this.deviceService.cameraSelected
	);
	readonly microphone = new TriedDevice<LocalAudioTrack>(
		(deviceId) => this.openOne({ video: false, audio: microphoneCaptureOptions(deviceId) }),
		this.deviceService.microphoneSelected
	);

	/** Whether a picked device is waiting to be applied. */
	readonly pending = computed(() => !!this.camera.device() || !!this.microphone.device());
	/** Whether {@link apply} is switching the published devices. */
	readonly applying = this._applying.asReadonly();

	constructor() {
		this.discardWhenGone(this.camera, this.localMedia.camera.enabled, this.deviceService.cameras);
		this.discardWhenGone(this.microphone, this.localMedia.microphone.enabled, this.deviceService.microphones);
	}

	async tryCamera(device: CustomDevice): Promise<void> {
		await this.tryDevice(this.camera, device, Track.Kind.Video);
	}

	async tryMicrophone(device: CustomDevice): Promise<void> {
		await this.tryDevice(this.microphone, device, Track.Kind.Audio);
	}

	/**
	 * Moves the published camera and microphone onto the picked ones. Each tried capture is closed
	 * before its device is reopened for publishing, since some platforms refuse a second capture of
	 * a device that is still held. A device that fails to switch goes back to the published one,
	 * which the switch itself reports, and is left out of the result.
	 */
	async apply(): Promise<AppliedDevices> {
		this._applying.set(true);

		try {
			const camera = await this.applyOne(this.camera, async (deviceId) => {
				await this.localMedia.switchCamera(deviceId);
				this.deviceService.setCameraSelected(deviceId);
				return this.deviceService.cameraSelected();
			});
			const microphone = await this.applyOne(this.microphone, async (deviceId) => {
				await this.localMedia.switchMicrophone(deviceId);
				this.deviceService.setMicSelected(deviceId);
				return this.deviceService.microphoneSelected();
			});

			return { camera, microphone };
		} finally {
			this._applying.set(false);
		}
	}

	ngOnDestroy(): void {
		this.camera.discard();
		this.microphone.discard();
	}

	private async tryDevice<T extends LocalTrack>(tried: TriedDevice<T>, device: CustomDevice, kind: Track.Kind) {
		try {
			await tried.try(device);
		} catch (error) {
			this.log.w(`Could not open ${device.label} to try it:`, error);
			this.localMedia.reportUnavailable(kind);
		}
	}

	private async applyOne<T extends LocalTrack>(
		tried: TriedDevice<T>,
		switchTo: (deviceId: string) => Promise<CustomDevice | undefined>
	): Promise<CustomDevice | undefined> {
		const device = tried.device();

		if (!device) return undefined;

		tried.discard();

		try {
			return await switchTo(device.device);
		} catch (error) {
			this.log.w(`Could not apply ${device.label}:`, error);
			return undefined;
		}
	}

	/** A pick is dropped when its device is turned off or is no longer connected. */
	private discardWhenGone<T extends LocalTrack>(
		tried: TriedDevice<T>,
		enabled: Signal<boolean>,
		devices: Signal<CustomDevice[]>
	): void {
		effect(() => {
			const picked = tried.device();

			if (!picked) return;

			if (!enabled() || !devices().some((device) => device.device === picked.device)) {
				untracked(() => tried.discard());
			}
		});
	}

	private async openOne<T extends LocalTrack>(options: CreateLocalTracksOptions): Promise<T> {
		const tracks = await acquireDevice(() => this.livekitSdkService.createLocalTracks(options), this.log);
		return tracks[0] as T;
	}
}
