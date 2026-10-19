import { signal } from '@angular/core';
import { ToolbarComponent } from './toolbar.component';

describe('ToolbarComponent microphone toggle', () => {
	let resolve: () => void;
	let reject: (reason: Error) => void;
	let toolbar: { microphoneMuteChanging: ReturnType<typeof signal<boolean>> };
	let toggleMicrophone: () => Promise<void>;

	beforeEach(() => {
		const pending = new Promise<void>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		toolbar = { microphoneMuteChanging: signal(false) };
		Object.assign(toolbar, {
			isMicrophoneEnabled: () => false,
			localMedia: { setMicrophoneEnabled: () => pending },
			log: { e: () => {} }
		});
		toggleMicrophone = () => ToolbarComponent.prototype.toggleMicrophone.call(toolbar);
	});

	it('is changing while the microphone change is pending and settled after it resolves', async () => {
		const toggling = toggleMicrophone();

		expect(toolbar.microphoneMuteChanging()).toBeTrue();

		resolve();
		await toggling;

		expect(toolbar.microphoneMuteChanging()).toBeFalse();
	});

	it('settles after the microphone change fails', async () => {
		const toggling = toggleMicrophone();
		reject(new Error('device error'));
		await toggling;

		expect(toolbar.microphoneMuteChanging()).toBeFalse();
	});
});
