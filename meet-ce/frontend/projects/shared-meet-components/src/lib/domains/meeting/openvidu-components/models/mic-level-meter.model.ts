import { signal } from '@angular/core';
import type { LocalAudioTrack } from '../services/livekit';
import { createAudioAnalyser } from '../services/livekit';

// The reading that fills the level meter: loud, close speech.
const FULL_LEVEL_RMS = 0.25;
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
	private readonly buffer: Uint8Array<ArrayBuffer>;
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
		} catch (error) {
			this.clone.stop();
			throw error;
		}

		// getByteTimeDomainData needs a buffer of fftSize samples, backed by a plain ArrayBuffer.
		this.buffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
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
		// calibration. Samples are 0-255 centered on 128, so recenter to [-1, 1] first.
		this.analyser.getByteTimeDomainData(this.buffer);
		let sumSquares = 0;

		for (const sample of this.buffer) {
			const centered = (sample - 128) / 128;
			sumSquares += centered * centered;
		}

		const rms = Math.sqrt(sumSquares / this.buffer.length);
		this._level.set(Math.min(1, rms / FULL_LEVEL_RMS));
		this.onSample?.(rms);
	};
}
