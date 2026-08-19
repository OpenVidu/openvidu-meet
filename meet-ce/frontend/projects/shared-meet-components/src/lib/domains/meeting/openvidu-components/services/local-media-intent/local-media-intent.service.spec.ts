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
		service.applyInitialMicrophoneState(false);
		service.applyInitialCameraState(false);

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

	// The initial state arrives through a reactive input, so it is re-pushed on every recomputation of
	// the features it derives from. Without this guard, muting from the prejoin would be undone by the
	// next unrelated feature change that re-emitted the same initial value.
	it('does not undo a toggle when the same initial state is pushed again', () => {
		service.applyInitialMicrophoneState(true);
		service.setMicrophoneEnabled(false);

		service.applyInitialMicrophoneState(true);

		expect(service.microphoneEnabled()).toBeFalse();
	});

	it('applies an initial state that actually changed, even after a toggle', () => {
		// A room config or a permission landing later resolves to a different initial state; that is a
		// new decision from outside and it does apply.
		service.applyInitialCameraState(true);
		service.setCameraEnabled(true);

		service.applyInitialCameraState(false);

		expect(service.cameraEnabled()).toBeFalse();
	});

	// The bug this reset exists for, caught by an e2e: within one entry the guard above must hold, but
	// across entries the same resolved value is a NEW request. Without the reset, a participant who
	// muted in the previous meeting stayed muted while the host explicitly asked for the device.
	it('re-applies the same initial state in a new entry, after a reset', () => {
		service.applyInitialCameraState(true);
		service.setCameraEnabled(false);

		service.reset();
		service.applyInitialCameraState(true);

		expect(service.cameraEnabled()).toBeTrue();
	});

	it('starts a new entry from the product default until the initial state lands', () => {
		service.setMicrophoneEnabled(false);
		service.setCameraEnabled(false);

		service.reset();

		expect(service.microphoneEnabled()).toBeTrue();
		expect(service.cameraEnabled()).toBeTrue();
	});

	it('keeps the two devices independent', () => {
		service.applyInitialMicrophoneState(false);

		expect(service.microphoneEnabled()).toBeFalse();
		expect(service.cameraEnabled()).toBeTrue();
	});
});
