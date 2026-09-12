import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ParticipantModel } from '../../models/participant.model';
import type { LocalAudioTrack, LocalVideoTrack } from '../livekit';
import { LocalTrackService } from '../local-track/local-track.service';
import { ParticipantService } from '../participant/participant.service';
import { LocalMediaStateService } from './local-media-state.service';

const fakeCapture = (id: string): MediaStreamTrack => ({ id }) as unknown as MediaStreamTrack;
const fakeTrack = (id: string): LocalAudioTrack =>
	({ mediaStreamTrack: fakeCapture(id) }) as unknown as LocalAudioTrack;
const fakeVideoTrack = (id: string): LocalVideoTrack =>
	({ mediaStreamTrack: fakeCapture(id) }) as unknown as LocalVideoTrack;
const roomCameraTrack = fakeVideoTrack('room-camera');

/**
 * Stand-in for the connected participant. Its enabled getters read a signal, the way the real
 * ParticipantModel's read `_revision()` — that is what makes the connected branch reactive.
 */
class FakeParticipant {
	readonly revision = signal(0);
	micEnabled = true;
	camEnabled = true;
	screenEnabled = false;

	get isMicrophoneEnabled(): boolean {
		this.revision();
		return this.micEnabled;
	}

	get isCameraEnabled(): boolean {
		this.revision();
		return this.camEnabled;
	}

	get isScreenShareEnabled(): boolean {
		this.revision();
		return this.screenEnabled;
	}

	getMicrophoneTrack(): LocalAudioTrack | undefined {
		return fakeTrack('room-mic');
	}

	getCameraTrack(): LocalVideoTrack | undefined {
		return roomCameraTrack;
	}

	/** Mutates like LiveKit does — in place — then notifies, as ParticipantModel.bump() does. */
	set(state: Partial<Pick<FakeParticipant, 'micEnabled' | 'camEnabled' | 'screenEnabled'>>): void {
		Object.assign(this, state);
		this.revision.update((v) => v + 1);
	}
}

describe('LocalMediaStateService', () => {
	let service: LocalMediaStateService;
	let localParticipant: WritableSignal<ParticipantModel | undefined>;
	let prejoinMicEnabled: WritableSignal<boolean>;
	let prejoinCameraEnabled: WritableSignal<boolean>;
	let prejoinMicCapture: WritableSignal<MediaStreamTrack | undefined>;
	let prejoinCameraTrack: WritableSignal<LocalVideoTrack | undefined>;
	let participant: FakeParticipant;

	beforeEach(() => {
		localParticipant = signal<ParticipantModel | undefined>(undefined);
		prejoinMicEnabled = signal(true);
		prejoinCameraEnabled = signal(true);
		prejoinMicCapture = signal<MediaStreamTrack | undefined>(fakeCapture('prejoin-capture'));
		prejoinCameraTrack = signal<LocalVideoTrack | undefined>(undefined);
		participant = new FakeParticipant();

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				LocalMediaStateService,
				{
					provide: LocalTrackService,
					useValue: {
						microphoneEnabled: prejoinMicEnabled,
						cameraEnabled: prejoinCameraEnabled,
						cameraTrack: prejoinCameraTrack,
						microphoneMediaStreamTrack: prejoinMicCapture
					} as unknown as LocalTrackService
				},
				{ provide: ParticipantService, useValue: { localParticipant } as unknown as ParticipantService }
			]
		});

		service = TestBed.inject(LocalMediaStateService);
	});

	/** Moves to the connected phase, the way ParticipantService.connect() does. */
	const connect = () => localParticipant.set(participant as unknown as ParticipantModel);

	describe('prejoin (no local participant yet)', () => {
		it('reads the enabled state from the prejoin tracks', () => {
			expect(service.microphoneEnabled()).toBeTrue();
			expect(service.cameraEnabled()).toBeTrue();

			prejoinMicEnabled.set(false);

			expect(service.microphoneEnabled()).toBeFalse();
			expect(service.cameraEnabled()).toBeTrue();
		});

		it('reads the camera track from the prejoin tracks', () => {
			expect(service.cameraTrack()).toBeUndefined();

			const camera = fakeVideoTrack('prejoin-camera');
			prejoinCameraTrack.set(camera);

			expect(service.cameraTrack()).toBe(camera);
		});

		it('reports no screen share: there is no prejoin sharing', () => {
			expect(service.screenShareEnabled()).toBeFalse();
		});
	});

	describe('meeting (connected)', () => {
		it('reads the enabled state from the participant, ignoring the released prejoin signals', () => {
			connect();
			participant.set({ micEnabled: false, camEnabled: true });
			// Stale prejoin values must not leak through once the participant owns the state.
			prejoinMicEnabled.set(true);
			prejoinCameraEnabled.set(false);

			expect(service.microphoneEnabled()).toBeFalse();
			expect(service.cameraEnabled()).toBeTrue();
		});

		it('follows the participant when LiveKit mutates it in place and bumps', () => {
			connect();
			expect(service.microphoneEnabled()).toBeTrue();

			participant.set({ micEnabled: false });

			expect(service.microphoneEnabled()).toBeFalse();
		});

		/*
		 * The camera track is what the virtual-background processor is attached to, and this service
		 * resolves it without ever reading the Room's connection state — so it still answers while a
		 * dropped connection is being resumed, when the Room reports neither Connected nor the prejoin
		 * tracks exist any more.
		 */
		it('reads the camera track from the participant, not from the connection state', () => {
			connect();
			prejoinCameraTrack.set(fakeVideoTrack('stale-prejoin-camera'));

			expect(service.cameraTrack()).toBe(roomCameraTrack);
		});

		it('reports the screen share of the participant', () => {
			connect();
			expect(service.screenShareEnabled()).toBeFalse();

			participant.set({ screenEnabled: true });

			expect(service.screenShareEnabled()).toBeTrue();
		});
	});

	describe('the microphone capture the mic monitor clones', () => {
		it('follows the prejoin capture track', () => {
			expect(service.microphoneMediaStreamTrack()?.id).toBe('prejoin-capture');
		});

		it('emits when a device switch swaps the capture track', () => {
			const before = service.microphoneMediaStreamTrack();

			prejoinMicCapture.set(fakeCapture('prejoin-capture-2'));

			// The switch keeps the same LocalAudioTrack object, so a signal of tracks could not report
			// it and the monitor would stay on a clone of the previous — stopped — device.
			expect(service.microphoneMediaStreamTrack()).not.toBe(before);
			expect(service.microphoneMediaStreamTrack()?.id).toBe('prejoin-capture-2');
		});

		it('reads the participant capture once connected', () => {
			connect();

			expect(service.microphoneMediaStreamTrack()?.id).toBe('room-mic');
		});
	});

	it('hands the source over on connect without a gap', () => {
		// Muted in prejoin, and the participant publishes muted too: the reading never flickers.
		prejoinMicEnabled.set(false);
		participant.set({ micEnabled: false });

		expect(service.microphoneEnabled()).toBeFalse();

		connect();

		expect(service.microphoneEnabled()).toBeFalse();
	});
});
