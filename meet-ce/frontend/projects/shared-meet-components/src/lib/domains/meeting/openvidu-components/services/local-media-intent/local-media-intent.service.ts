import { Service, signal } from '@angular/core';

/**
 * Which local devices are meant to be open when the tracks are created. Resolved once per entry
 * outside this library and pushed in.
 */
export interface InitialMediaState {
	camera: boolean;
	microphone: boolean;
}

/**
 * What the local microphone/camera should be opened with — the participant's *intent*. Never
 * persisted: a remembered value would outrank the room's and the host's request on the next entry.
 *
 * Written from two places only: the embedding layer's resolved {@link InitialMediaState}, and
 * `LocalMediaControlService` when it actually toggles a device. Read when a track is created,
 * re-created or restarted onto another device — the moments when there is no track to read the answer
 * from. "Is the device on right now" is {@link LocalMediaStateService}; whether one is present at all
 * is `DeviceService`.
 */
@Service()
export class LocalMediaIntentService {
	private readonly _microphoneEnabled = signal(true);
	private readonly _cameraEnabled = signal(true);

	readonly microphoneEnabled = this._microphoneEnabled.asReadonly();
	readonly cameraEnabled = this._cameraEnabled.asReadonly();

	// Tracked per device because the initial state arrives through a reactive input that re-emits on
	// every recomputation: an unchanged value must not undo a toggle made in the meantime, and a change
	// on one device must not re-push the other.
	private lastAppliedState: Partial<InitialMediaState> = {};

	applyInitialState({ camera, microphone }: InitialMediaState): void {
		if (this.lastAppliedState.camera !== camera) {
			this.lastAppliedState.camera = camera;
			this._cameraEnabled.set(camera);
		}

		if (this.lastAppliedState.microphone !== microphone) {
			this.lastAppliedState.microphone = microphone;
			this._microphoneEnabled.set(microphone);
		}
	}

	setMicrophoneEnabled(enabled: boolean): void {
		this._microphoneEnabled.set(enabled);
	}

	setCameraEnabled(enabled: boolean): void {
		this._cameraEnabled.set(enabled);
	}

	/** Ends the entry: the next one re-applies whatever the embedding layer resolves for it, same value or not. */
	reset(): void {
		this.lastAppliedState = {};
		this._microphoneEnabled.set(true);
		this._cameraEnabled.set(true);
	}
}
