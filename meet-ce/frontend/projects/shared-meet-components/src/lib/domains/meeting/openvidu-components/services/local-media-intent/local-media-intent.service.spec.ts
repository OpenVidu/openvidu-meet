import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocalMediaIntentService } from './local-media-intent.service';

describe('LocalMediaIntentService', () => {
	let service: LocalMediaIntentService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideZonelessChangeDetection(), LocalMediaIntentService]
		});

		service = TestBed.inject(LocalMediaIntentService);
	});

	it('starts with both devices meant to be open', () => {
		expect(service.microphoneEnabled()).toBeTrue();
		expect(service.cameraEnabled()).toBeTrue();
	});

	it('takes the initial state resolved outside the library', () => {
		service.applyInitialState({ camera: false, microphone: false });

		expect(service.microphoneEnabled()).toBeFalse();
		expect(service.cameraEnabled()).toBeFalse();
	});

	it('records a toggle made by the participant or a host command', () => {
		service.setMicrophoneEnabled(false);
		service.setCameraEnabled(false);

		expect(service.microphoneEnabled()).toBeFalse();
		expect(service.cameraEnabled()).toBeFalse();

		service.setCameraEnabled(true);
		expect(service.cameraEnabled()).toBeTrue();
	});

	// The initial state arrives through a reactive input that re-emits on every recomputation, so
	// re-pushing the same value must not clobber a toggle made in the meantime.
	it('does not undo a toggle when the same initial state is pushed again', () => {
		service.applyInitialState({ camera: true, microphone: true });
		service.setMicrophoneEnabled(false);

		service.applyInitialState({ camera: true, microphone: true });

		expect(service.microphoneEnabled()).toBeFalse();
	});

	it('applies an initial state that actually changed, even after a toggle', () => {
		// A room config or a permission landing later resolves to a different initial state; that is a
		// new decision from outside and it does apply.
		service.applyInitialState({ camera: true, microphone: true });
		service.setCameraEnabled(true);

		service.applyInitialState({ camera: false, microphone: true });

		expect(service.cameraEnabled()).toBeFalse();
	});

	// Both devices travel in one object, but the guard is per device.
	it('leaves the other device alone when only one resolved value changed', () => {
		service.applyInitialState({ camera: true, microphone: true });
		service.setMicrophoneEnabled(false);

		service.applyInitialState({ camera: false, microphone: true });

		expect(service.cameraEnabled()).toBeFalse();
		expect(service.microphoneEnabled()).toBeFalse();
	});

	// Across entries the same resolved value is a NEW request, so the guard must not survive the reset.
	it('re-applies the same initial state in a new entry, after a reset', () => {
		service.applyInitialState({ camera: true, microphone: true });
		service.setCameraEnabled(false);

		service.reset();
		service.applyInitialState({ camera: true, microphone: true });

		expect(service.cameraEnabled()).toBeTrue();
	});

	it('starts a new entry from the product default until the initial state lands', () => {
		service.setMicrophoneEnabled(false);
		service.setCameraEnabled(false);

		service.reset();

		expect(service.microphoneEnabled()).toBeTrue();
		expect(service.cameraEnabled()).toBeTrue();
	});
});
