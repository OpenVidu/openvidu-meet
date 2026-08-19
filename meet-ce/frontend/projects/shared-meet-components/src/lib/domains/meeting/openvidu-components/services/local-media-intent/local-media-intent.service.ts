import { Service, signal } from '@angular/core';

/**
 * What the local microphone/camera should be opened with — the participant's *intent*, held in
 * memory for the lifetime of the tab's app instance and **never persisted**.
 *
 * It starts as the initial state resolved by the embedding layer (permission ∧ the host's
 * `initial-*-enabled` attribute, or the room's `*EnabledOnJoin` default when the attribute says
 * nothing) and is then moved by the participant themselves, through
 * `LocalMediaControlService.set{Camera,Microphone}Enabled` — the single writer of a user/host toggle.
 *
 * Not persisted on purpose: a remembered value would outrank the room's and the host's request on the
 * *next* entry. Enforcement is a separate axis — the `mediaPublish*` permission.
 *
 * Distinct from {@link LocalMediaStateService}, which answers "is the device on *right now*" by
 * reading the actual tracks. This service answers "what did we ask for", which is what a track
 * consults when it is created, re-created or restarted onto another device — the moments when there
 * is no track to read the answer from.
 */
@Service()
export class LocalMediaIntentService {
	private readonly _microphoneEnabled = signal(true);
	private readonly _cameraEnabled = signal(true);

	/** Whether the microphone is meant to be open. Availability is a separate question (DeviceService). */
	readonly microphoneEnabled = this._microphoneEnabled.asReadonly();
	/** Whether the camera is meant to be open. Availability is a separate question (DeviceService). */
	readonly cameraEnabled = this._cameraEnabled.asReadonly();

	// Last initial state pushed in per device. Kept because the inputs are reactive and re-emit
	// whenever any unrelated feature changes: an unchanged value must not undo a toggle made in the
	// meantime, while a changed one must apply. Cleared by {@link reset}, since the same value arriving
	// in a NEW entry is a fresh request.
	private lastAppliedPolicy: { microphone?: boolean; camera?: boolean } = {};

	/**
	 * Seeds the microphone intent from the initial state resolved outside the library. Applied only
	 * when that resolved value changes, so it survives being re-pushed.
	 */
	applyInitialMicrophoneState(enabled: boolean): void {
		if (this.lastAppliedPolicy.microphone === enabled) return;

		this.lastAppliedPolicy.microphone = enabled;
		this._microphoneEnabled.set(enabled);
	}

	/**
	 * Seeds the camera intent from the initial state resolved outside the library. Applied only when
	 * that resolved value changes, so it survives being re-pushed.
	 */
	applyInitialCameraState(enabled: boolean): void {
		if (this.lastAppliedPolicy.camera === enabled) return;

		this.lastAppliedPolicy.camera = enabled;
		this._cameraEnabled.set(enabled);
	}

	/** Records a microphone toggle made by the participant or by a host command. */
	setMicrophoneEnabled(enabled: boolean): void {
		this._microphoneEnabled.set(enabled);
	}

	/** Records a camera toggle made by the participant or by a host command. */
	setCameraEnabled(enabled: boolean): void {
		this._cameraEnabled.set(enabled);
	}

	/**
	 * Ends the entry: drops the participant's toggles and forgets the applied initial state, so the
	 * next entry starts from the product default and re-applies what the embedding layer resolves for
	 * it, same value or not.
	 */
	reset(): void {
		this.lastAppliedPolicy = {};
		this._microphoneEnabled.set(true);
		this._cameraEnabled.set(true);
	}
}
