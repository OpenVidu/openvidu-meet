import { MicLevelMeter } from './mic-level-meter.model';

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
	const deadline = performance.now() + timeoutMs;

	while (!condition()) {
		if (performance.now() > deadline) throw new Error('Condition not met in time');

		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A live audio capture whose loudness the test controls, standing in for a microphone. */
function fakeMicrophone(): { track: MediaStreamTrack; setGain: (gain: number) => void; close: () => Promise<void> } {
	const context = new AudioContext();
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	const destination = context.createMediaStreamDestination();
	oscillator.connect(gain).connect(destination);
	oscillator.start();

	return {
		track: destination.stream.getAudioTracks()[0],
		setGain: (value) => gain.gain.setValueAtTime(value, context.currentTime),
		close: () => context.close()
	};
}

describe('MicLevelMeter', () => {
	let microphone: ReturnType<typeof fakeMicrophone>;
	let meter: MicLevelMeter | undefined;

	beforeEach(() => {
		microphone = fakeMicrophone();
	});

	afterEach(async () => {
		meter?.dispose();
		meter = undefined;
		microphone.track.stop();
		await microphone.close();
	});

	it('follows how loud the capture is', async () => {
		microphone.setGain(0);
		meter = new MicLevelMeter(microphone.track);
		await delay(200);
		expect(meter.level()).toBe(0);

		microphone.setGain(1);
		await waitFor(() => meter!.level() === 1);
	});

	it('keeps measuring while the capture is muted in the meeting', async () => {
		microphone.track.enabled = false;
		meter = new MicLevelMeter(microphone.track);

		await waitFor(() => meter!.level() > 0);
	});

	it('hands every raw reading to its listener', async () => {
		const readings: number[] = [];
		meter = new MicLevelMeter(microphone.track, (rms) => readings.push(rms));

		await waitFor(() => readings.length >= 3);
		expect(readings.every((rms) => rms >= 0 && rms <= 1)).toBeTrue();
	});

	it('releases its own capture and stops sampling when disposed', async () => {
		const cloneSpy = spyOn(microphone.track, 'clone').and.callThrough();
		const readings: number[] = [];
		meter = new MicLevelMeter(microphone.track, (rms) => readings.push(rms));
		const clone = cloneSpy.calls.mostRecent().returnValue;

		meter.dispose();
		const sampled = readings.length;

		expect(meter.level()).toBe(0);
		await waitFor(() => clone.readyState === 'ended');
		await delay(200);
		expect(readings.length).toBe(sampled);
		expect(microphone.track.readyState).toBe('live');
	});
});
