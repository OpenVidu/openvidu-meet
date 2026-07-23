import { OnDestroy, Service, effect, inject, signal } from '@angular/core';
import type { ILogger } from '../../../../../shared/models/logger.model';
import { LoggerService } from '../../../../../shared/services/logger.service';
import type { LocalAudioTrack } from '../livekit';
import { createAudioAnalyser } from '../livekit';
import { LocalMediaStateService } from '../local-media-state/local-media-state.service';

// Voice-activity thresholds, expressed on a time-domain RMS scale (0-1) — see the loop for why
// we measure RMS rather than LiveKit's frequency-based `calculateVolume`. Typical readings:
// digital silence ~0, quiet room noise (with noise suppression) < 0.01, normal speech ~0.05-0.3.
const SPEAKING_THRESHOLD = 0.045;
// Voice must stay above the threshold this long before it counts as speech, so transients (a
// mouse click on the mute button, a keystroke, a door) do not trigger the warning.
const SPEAKING_ATTACK_MS = 150;
// Once speaking, stay "speaking" through short pauses between words/sentences.
const SPEAKING_RELEASE_MS = 1000;

/**
 * Monitors the live signal of the local microphone to power the "microphone status" warnings
 */
@Service()
export class MicActivityService implements OnDestroy {
	private readonly _level = signal(0);
	private readonly _isSpeaking = signal(false);
	private readonly _systemMuted = signal(false);
	private readonly _active = signal(false);

	/** Normalized (0-1) input level of the monitored microphone. */
	readonly level = this._level.asReadonly();
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
	private rafId: number | null = null;
	private lastSpeakingAt = 0;
	private aboveThresholdSince = 0;
	private currentTrackId?: string;

	private readonly log: ILogger = inject(LoggerService).get('MicActivityService');
	private readonly localMediaState = inject(LocalMediaStateService);

	constructor() {
		// Self-managed lifecycle: the monitored track follows the reactive local-media state,
		// so there are no external attach/detach call-sites. The effect fires only when the underlying
		// MediaStreamTrack changes (the signal is compared by MST id), re-cloning onto the new track or
		// detaching when it becomes undefined (prejoin torn down, participant cleared, left the meeting).
		effect(() => this.attach(this.localMediaState.microphoneTrack()));
	}

	/**
	 * Starts monitoring the given local microphone track. Idempotent for the same underlying
	 * MediaStreamTrack; when the track changes (device switch / re-acquisition) the previous
	 * analyser and clone are disposed first.
	 */
	private attach(track: LocalAudioTrack | undefined): void {
		const source = track?.mediaStreamTrack;

		if (!track || !source) {
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
			this.loop();
		} catch (error) {
			this.log.e('Failed to attach microphone activity analyser', error);
			this.detach();
		}
	}

	/**
	 * Stops monitoring: cancels the read loop, closes the AudioContext and stops the cloned
	 * MediaStreamTrack so the capture device is released. Safe to call repeatedly.
	 */
	private detach(): void {
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
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

		this._level.set(0);
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

	private readonly loop = (): void => {
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
		this._level.set(rms);

		// The system-mute state has no reliable event across browsers once tracks are cloned,
		// so it is refreshed on every read of the loop (~1 frame of latency).
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

		this.rafId = requestAnimationFrame(this.loop);
	};
}
