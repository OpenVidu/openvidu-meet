import { OnDestroy, Service, effect, inject, signal } from '@angular/core';
import type { ILogger } from '../../../../../shared/models/logger.model';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { LocalAudioTrack } from '../livekit';
import { createAudioAnalyser } from '../livekit';
import { LocalMediaService } from '../local-media/local-media.service';

// Voice-activity thresholds, expressed on a time-domain RMS scale (0-1) — see the loop for why
// we measure RMS rather than LiveKit's frequency-based `calculateVolume`. Typical readings:
// digital silence ~0, quiet room noise (with noise suppression) < 0.01, normal speech ~0.05-0.3.
const SPEAKING_THRESHOLD = 0.045;
// Voice must stay above the threshold this long before it counts as speech, so transients (a
// mouse click on the mute button, a keystroke, a door) do not trigger the warning.
const SPEAKING_ATTACK_MS = 150;
// Once speaking, stay "speaking" through short pauses between words/sentences.
const SPEAKING_RELEASE_MS = 1000;
// How often the analyser is read. Voice activity is decided over SPEAKING_ATTACK_MS, so there is
// nothing to gain from reading once per animation frame — and a frame-rate loop keeps the whole
// rendering pipeline awake for as long as a microphone track exists.
const SAMPLE_INTERVAL_MS = 50;

/**
 * Monitors the live signal of the local microphone to power the "microphone status" warnings
 */
@Service()
export class MicActivityService implements OnDestroy {
	private readonly _isSpeaking = signal(false);
	private readonly _systemMuted = signal(false);
	private readonly _active = signal(false);

	/** Whether voice activity is currently detected (with a short release window). */
	readonly isSpeaking = this._isSpeaking.asReadonly();
	/** Whether the OS reports the microphone input as muted. */
	readonly systemMuted = this._systemMuted.asReadonly();
	/** Whether a microphone track is currently being monitored. */
	readonly active = this._active.asReadonly();

	private cleanupAnalyser?: () => Promise<void>;
	private analyser?: AnalyserNode;
	private timeDomainBuffer?: Uint8Array<ArrayBuffer>;
	private monitorTrack?: MediaStreamTrack;
	private sourceTrack?: MediaStreamTrack;
	private sampleTimer: ReturnType<typeof setInterval> | null = null;
	private lastSpeakingAt = 0;
	private aboveThresholdSince = 0;
	private currentTrackId?: string;

	private readonly log: ILogger = inject(LoggerService).get('MicActivityService');
	private readonly localMediaService = inject(LocalMediaService);

	constructor() {
		// Self-managed lifecycle: the monitored capture follows the reactive local-media state, so
		// there are no external attach/detach call-sites. The effect fires whenever the captured
		// MediaStreamTrack changes — a device switch swaps it behind the same LocalAudioTrack, which
		// is why the signal carries the raw capture — re-cloning onto the new one, or detaching when
		// it becomes undefined (prejoin torn down, participant cleared, left the meeting).
		effect(() => this.attach(this.localMediaService.microphoneMediaStreamTrack()));
	}

	/**
	 * Starts monitoring the given microphone capture track. Idempotent for the same MediaStreamTrack;
	 * when the capture changes (device switch / re-acquisition) the previous analyser and clone are
	 * disposed first.
	 */
	private attach(source: MediaStreamTrack | undefined): void {
		if (!source) {
			this.detach();
			return;
		}

		if (this.currentTrackId === source.id && this._active()) {
			return;
		}

		this.detach();

		try {
			// Own clone, re-enabled so it produces audio even when the source is muted in-app.
			const monitorTrack = source.clone();
			monitorTrack.enabled = true;

			const { analyser, cleanup } = createAudioAnalyser(
				// createAudioAnalyser only reads `mediaStreamTrack` from the track it receives.
				{ mediaStreamTrack: monitorTrack } as LocalAudioTrack,
				{ cloneTrack: false, fftSize: 512 }
			);

			this.monitorTrack = monitorTrack;
			this.sourceTrack = source;
			this.analyser = analyser;
			// getByteTimeDomainData requires a buffer the size of fftSize (not frequencyBinCount).
			// Back it with an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer> (TS 5.9
			// typed-array generics), which is what the DOM signature expects.
			this.timeDomainBuffer = new Uint8Array(new ArrayBuffer(analyser.fftSize));
			this.cleanupAnalyser = cleanup;
			this.currentTrackId = source.id;
			this.aboveThresholdSince = 0;
			this._systemMuted.set(source.muted);
			this._active.set(true);
			this.sample();
			this.sampleTimer = setInterval(this.sample, SAMPLE_INTERVAL_MS);
		} catch (error) {
			this.log.e('Failed to attach microphone activity analyser', error);
			this.detach();
		}
	}

	/**
	 * Stops monitoring: stops the sampling timer, closes the AudioContext and stops the cloned
	 * MediaStreamTrack so the capture device is released. Safe to call repeatedly.
	 */
	private detach(): void {
		if (this.sampleTimer !== null) {
			clearInterval(this.sampleTimer);
			this.sampleTimer = null;
		}

		const cleanupAnalyser = this.cleanupAnalyser;
		const monitorTrack = this.monitorTrack;
		this.cleanupAnalyser = undefined;
		this.analyser = undefined;
		this.timeDomainBuffer = undefined;
		this.monitorTrack = undefined;
		this.sourceTrack = undefined;
		this.currentTrackId = undefined;
		this.aboveThresholdSince = 0;

		this._isSpeaking.set(false);
		this._systemMuted.set(false);
		this._active.set(false);

		if (cleanupAnalyser) {
			cleanupAnalyser()
				.catch(() => {})
				.finally(() => monitorTrack?.stop());
		} else {
			monitorTrack?.stop();
		}
	}

	ngOnDestroy(): void {
		this.detach();
	}

	private readonly sample = (): void => {
		const analyser = this.analyser;
		const buffer = this.timeDomainBuffer;

		if (!analyser || !buffer) {
			return;
		}

		// Time-domain RMS: the real amplitude of the waveform, independent of the analyser's
		// dB calibration. Samples are 0-255 centered on 128, so recenter to [-1, 1] before RMS.
		analyser.getByteTimeDomainData(buffer);
		let sumSquares = 0;

		for (const sample of buffer) {
			const centered = (sample - 128) / 128;
			sumSquares += centered * centered;
		}

		const rms = Math.sqrt(sumSquares / buffer.length);

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
