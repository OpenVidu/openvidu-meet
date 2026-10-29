import { computed, OnDestroy, Service, effect, inject, signal, untracked } from '@angular/core';
import type { ILogger } from '../../../../../shared/models/logger.model';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MicLevelMeter } from '../../models/mic-level-meter.model';
import { LocalMediaService } from '../local-media/local-media.service';

// Voice-activity thresholds, expressed on a time-domain RMS scale (0-1) — see the meter for why
// we measure RMS rather than LiveKit's frequency-based `calculateVolume`. Typical readings:
// digital silence ~0, quiet room noise (with noise suppression) < 0.01, normal speech ~0.05-0.3.
const SPEAKING_THRESHOLD = 0.045;
// Voice must stay above the threshold this long before it counts as speech, so transients (a
// mouse click on the mute button, a keystroke, a door) do not trigger the warning.
const SPEAKING_ATTACK_MS = 150;
// Once speaking, stay "speaking" through short pauses between words/sentences.
const SPEAKING_RELEASE_MS = 1000;

/**
 * Monitors the live signal of the local microphone to power the "microphone status" warnings and
 * the level meter of the settings panel
 */
@Service()
export class MicActivityService implements OnDestroy {
	private readonly _isSpeaking = signal(false);
	private readonly _systemMuted = signal(false);
	private readonly meter = signal<MicLevelMeter | undefined>(undefined);

	/** Whether voice activity is currently detected (with a short release window). */
	readonly isSpeaking = this._isSpeaking.asReadonly();
	/** Whether the OS reports the microphone input as muted. */
	readonly systemMuted = this._systemMuted.asReadonly();
	/** Whether a microphone track is currently being monitored. */
	readonly active = computed(() => !!this.meter());
	/** How loud the microphone captures right now, from 0 (silence) to 1, even while muted in the meeting. */
	readonly level = computed(() => this.meter()?.level() ?? 0);

	private sourceTrack?: MediaStreamTrack;
	private lastSpeakingAt = 0;
	private aboveThresholdSince = 0;

	private readonly log: ILogger = inject(LoggerService).get('MicActivityService');
	private readonly localMedia = inject(LocalMediaService);

	constructor() {
		// Self-managed lifecycle: the monitored capture follows the reactive local-media state, so
		// there are no external attach/detach call-sites. The effect fires whenever the captured
		// MediaStreamTrack changes — a device switch swaps it behind the same LocalAudioTrack, which
		// is why the signal carries the raw capture — measuring the new one, or detaching when
		// it becomes undefined (prejoin torn down, participant cleared, left the meeting).
		effect(() => {
			const source = this.localMedia.microphone.mediaStreamTrack();
			untracked(() => this.attach(source));
		});
	}

	/**
	 * Starts monitoring the given microphone capture track. Idempotent for the same MediaStreamTrack;
	 * when the capture changes (device switch / re-acquisition) the previous meter is disposed first.
	 */
	private attach(source: MediaStreamTrack | undefined): void {
		if (source && source === this.sourceTrack && this.meter()) {
			return;
		}

		this.detach();

		if (!source) return;

		try {
			this.sourceTrack = source;
			this._systemMuted.set(source.muted);
			this.meter.set(new MicLevelMeter(source, this.onSample));
		} catch (error) {
			this.log.e('Failed to attach microphone activity analyser', error);
			this.detach();
		}
	}

	/** Stops monitoring and releases the meter's clone of the capture. Safe to call repeatedly. */
	private detach(): void {
		this.meter()?.dispose();
		this.meter.set(undefined);
		this.sourceTrack = undefined;
		this.aboveThresholdSince = 0;
		this._isSpeaking.set(false);
		this._systemMuted.set(false);
	}

	ngOnDestroy(): void {
		this.detach();
	}

	private readonly onSample = (rms: number): void => {
		// The system-mute state has no reliable event across browsers once tracks are cloned,
		// so it is refreshed on every read (one sampling period of latency).
		this._systemMuted.set(this.sourceTrack?.muted ?? false);

		const now = performance.now();

		if (rms > SPEAKING_THRESHOLD) {
			// Require the level to stay up for SPEAKING_ATTACK_MS before latching "speaking",
			// so a brief transient does not raise the warning.
			if (this.aboveThresholdSince === 0) {
				this.aboveThresholdSince = now;
			}

			this.lastSpeakingAt = now;

			if (!this._isSpeaking() && now - this.aboveThresholdSince >= SPEAKING_ATTACK_MS) {
				this._isSpeaking.set(true);
			}
		} else {
			this.aboveThresholdSince = 0;

			if (this._isSpeaking() && now - this.lastSpeakingAt > SPEAKING_RELEASE_MS) {
				this._isSpeaking.set(false);
			}
		}
	};
}
