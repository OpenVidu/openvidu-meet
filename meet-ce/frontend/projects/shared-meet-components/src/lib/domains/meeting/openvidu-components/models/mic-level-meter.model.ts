import { signal } from '@angular/core';
import type { LocalAudioTrack } from '../services/livekit';
import { createAudioAnalyser } from '../services/livekit';

// The meter is logarithmic, like hearing: the ambient noise of a quiet room already moves it and loud,
// close speech fills it.
const SILENT_DB = -70;
const FULL_DB = -20;
// Level changes smaller than this do not show in the meter, so they do not wake whoever reads it:
// background noise would otherwise re-render the meter on every sample.
const LEVEL_CHANGE_THRESHOLD = 0.02;
// Voice activity is decided over a few samples, so there is nothing to gain from reading once per
// animation frame, and a frame-rate loop keeps the whole rendering pipeline awake.
const SAMPLE_INTERVAL_MS = 50;

/**
 * @internal
 * Measures how loud a microphone capture is, from its own clone so the reading goes on while the
 * capture is muted in the meeting. The clone and its audio context live until {@link dispose}.
 */
export class MicLevelMeter {
	private readonly _level = signal(0, { equal: (a, b) => Math.abs(a - b) < LEVEL_CHANGE_THRESHOLD });
	private readonly timer: ReturnType<typeof setInterval>;
	private readonly buffer: Float32Array<ArrayBuffer>;
	private readonly analyser: AnalyserNode;
	private readonly cleanup: () => Promise<void>;
	private readonly clone: MediaStreamTrack;

	/** From 0 (silence) to 1 (loud, close speech). */
	readonly level = this._level.asReadonly();

	/**
	 * Starts sampling right away. `onSample` receives every raw time-domain RMS (0 to 1), for
	 * callers that judge voice activity on a finer scale than the meter shows.
	 */
	constructor(
		source: MediaStreamTrack,
		private readonly onSample?: (rms: number) => void
	) {
		this.clone = source.clone();
		this.clone.enabled = true;

		try {
			// createAudioAnalyser only reads `mediaStreamTrack` from the track it receives.
			const { analyser, cleanup } = createAudioAnalyser({ mediaStreamTrack: this.clone } as LocalAudioTrack, {
				cloneTrack: false,
				fftSize: 512
			});
			this.analyser = analyser;
			this.cleanup = cleanup;
			// A context created before any interaction with the page, as in an embedded prejoin, starts
			// suspended and reads silence; the browser lets this request through at the first interaction.
			(analyser.context as AudioContext).resume?.().catch(() => {});
		} catch (error) {
			this.clone.stop();
			throw error;
		}

		// getFloatTimeDomainData needs a buffer of fftSize samples, backed by a plain ArrayBuffer.
		this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
		this.sample();
		this.timer = setInterval(this.sample, SAMPLE_INTERVAL_MS);
	}

	dispose(): void {
		clearInterval(this.timer);
		this._level.set(0);
		this.cleanup()
			.catch(() => {})
			.finally(() => this.clone.stop());
	}

	private readonly sample = (): void => {
		// Time-domain RMS: the real amplitude of the waveform, independent of the analyser's dB
		// calibration. Float samples, because 8-bit ones cannot tell a quiet room from silence.
		this.analyser.getFloatTimeDomainData(this.buffer);
		let sumSquares = 0;

		for (const sample of this.buffer) {
			sumSquares += sample * sample;
		}

		const rms = Math.sqrt(sumSquares / this.buffer.length);
		const decibels = 20 * Math.log10(rms);
		this._level.set(Math.min(1, Math.max(0, (decibels - SILENT_DB) / (FULL_DB - SILENT_DB))));
		this.onSample?.(rms);
	};
}
