import { LocalParticipant, RemoteParticipant, Track, TrackPublication } from '../livekit';
import { ParticipantModel } from '../../models/participant.model';
import { StreamLayoutStateService } from './stream-layout-state.service';

const fakePublication = (trackSid: string, kind: Track.Kind, source: Track.Source): TrackPublication =>
	({ trackSid, trackName: trackSid, kind, source }) as unknown as TrackPublication;

interface FakeLiveKitParticipant {
	identity: string;
	sid: string;
	name: string;
	metadata: string | undefined;
	isLocal: boolean;
	publications: TrackPublication[];
	isCameraEnabled: boolean;
	isMicrophoneEnabled: boolean;
	isScreenShareEnabled: boolean;
	getTrackPublications(): TrackPublication[];
}

const fakeLiveKitParticipant = (identity: string, isLocal = false): FakeLiveKitParticipant => ({
	identity,
	sid: `PA_${identity}`,
	name: identity,
	metadata: undefined,
	isLocal,
	publications: [],
	isCameraEnabled: false,
	isMicrophoneEnabled: false,
	isScreenShareEnabled: false,
	getTrackPublications() {
		return this.publications;
	}
});

describe('StreamLayoutStateService', () => {
	let service: StreamLayoutStateService;
	let fake: FakeLiveKitParticipant;
	let participant: ParticipantModel;

	const modelFor = (fakeParticipant: FakeLiveKitParticipant): ParticipantModel =>
		new ParticipantModel({
			participant: fakeParticipant as unknown as LocalParticipant | RemoteParticipant,
			viewState: service
		});

	const cameraStream = () => participant.streams().find((s) => s.isCameraStream)!;
	const screenStream = () => participant.streams().find((s) => s.isScreenStream);

	beforeEach(() => {
		service = new StreamLayoutStateService();
		fake = fakeLiveKitParticipant('alice');
		participant = modelFor(fake);
	});

	describe('forcible mute', () => {
		it('keeps the participant getter and the stream field consistent with no tracks at all', () => {
			// Regression: the old placeholder-track storage made participant.isMutedForcibly true
			// while streams()[0].isMutedForcibly stayed false, and different templates read each.
			service.setParticipantMutedForcibly(participant.sid, true);

			expect(participant.isMutedForcibly).toBeTrue();
			expect(cameraStream().isMutedForcibly).toBeTrue();
		});

		it('mutes the camera stream even when no microphone track is published', () => {
			// Regression: the stream field used to derive only from the mic audio track.
			fake.publications = [fakePublication('TR_cam', Track.Kind.Video, Track.Source.Camera)];
			participant.bump();

			service.setParticipantMutedForcibly(participant.sid, true, Track.Source.Camera);

			expect(cameraStream().isMutedForcibly).toBeTrue();
			expect(participant.isMutedForcibly).toBeTrue();
		});

		it('does not resurrect a lifted mute when the camera toggles off again', () => {
			// Regression: the mute used to be written onto a persistent placeholder track that left
			// the track list while the camera was on — so unmuting could not clear it and the mute
			// came back when the camera turned off.
			service.setParticipantMutedForcibly(participant.sid, true);

			fake.publications = [fakePublication('TR_cam', Track.Kind.Video, Track.Source.Camera)];
			participant.bump();
			service.setParticipantMutedForcibly(participant.sid, false);

			fake.publications = [];
			participant.bump();

			expect(participant.isMutedForcibly).toBeFalse();
			expect(cameraStream().isMutedForcibly).toBeFalse();
		});

		it('survives the participant republishing tracks (mic re-acquired on unmute)', () => {
			fake.publications = [fakePublication('TR_mic', Track.Kind.Audio, Track.Source.Microphone)];
			participant.bump();
			service.setParticipantMutedForcibly(participant.sid, true, Track.Source.Camera);

			fake.publications = [];
			participant.bump();
			fake.publications = [fakePublication('TR_mic2', Track.Kind.Audio, Track.Source.Microphone)];
			participant.bump();

			expect(cameraStream().isMutedForcibly).toBeTrue();
		});

		it('scopes the mute to the camera or the screen stream', () => {
			fake.publications = [fakePublication('TR_screen', Track.Kind.Video, Track.Source.ScreenShare)];
			participant.bump();

			service.setParticipantMutedForcibly(participant.sid, true, Track.Source.ScreenShare);

			expect(cameraStream().isMutedForcibly).toBeFalse();
			expect(screenStream()?.isMutedForcibly).toBeTrue();

			service.setParticipantMutedForcibly(participant.sid, true);
			expect(cameraStream().isMutedForcibly).toBeTrue();

			service.setParticipantMutedForcibly(participant.sid, false);
			expect(participant.isMutedForcibly).toBeFalse();
		});
	});

	describe('pin and float', () => {
		it('floats and docks the local camera tile even when the camera is off (avatar-only tile)', () => {
			// Regression: float/pin used to look tracks up by trackSid, which never matched the
			// avatar tile, so auto-float silently did nothing while the camera was off.
			service.floatLocalCameraVideo(participant);

			expect(participant.isFloating).toBeTrue();
			expect(cameraStream().isFloating).toBeTrue();

			service.dockLocalCameraVideo(participant);

			expect(participant.isFloating).toBeFalse();
		});

		it('does not float twice when already floating', () => {
			service.floatLocalCameraVideo(participant);
			service.floatLocalCameraVideo(participant);

			expect(participant.isFloating).toBeTrue();
		});

		it('pins by streamId and unpins everything at once', () => {
			service.toggleStreamPinned(cameraStream().streamId);

			expect(participant.isPinned).toBeTrue();
			expect(cameraStream().isPinned).toBeTrue();

			service.unpinAllStreams();

			expect(participant.isPinned).toBeFalse();
		});

		it('recomputes streams() reactively on store changes without any bump()', () => {
			const before = participant.streams();

			service.toggleStreamPinned(before[0].streamId);
			const after = participant.streams();

			expect(after).not.toBe(before);
			expect(after[0].isPinned).toBeTrue();
		});
	});

	describe('setLastScreenPinned', () => {
		it('pins the most recently published screen share', () => {
			service.recordScreenSharePublication('TR_screen_old', 1000);
			service.recordScreenSharePublication('TR_screen_new', 2000);

			service.setLastScreenPinned();

			expect(service.isStreamPinned('TR_screen_new')).toBeTrue();
			expect(service.isStreamPinned('TR_screen_old')).toBeFalse();
		});

		it('is a no-op with no live screen shares and idempotent when already pinned', () => {
			// Regression: the old implementation ran Math.max over an empty map (-Infinity) and
			// toggled, so calling it twice could unpin the screen it had just pinned.
			expect(() => service.setLastScreenPinned()).not.toThrow();

			service.recordScreenSharePublication('TR_screen', 1000);
			service.setLastScreenPinned();
			service.setLastScreenPinned();

			expect(service.isStreamPinned('TR_screen')).toBeTrue();
		});

		it('skips shares whose publication record was cleared', () => {
			service.recordScreenSharePublication('TR_screen_a', 1000);
			service.recordScreenSharePublication('TR_screen_b', 2000);
			service.clearScreenSharePublication('TR_screen_b');

			service.setLastScreenPinned();

			expect(service.isStreamPinned('TR_screen_a')).toBeTrue();
		});
	});

	describe('lifecycle', () => {
		it('drops every view-state entry of a leaving participant so a rejoin starts clean', () => {
			fake.publications = [fakePublication('TR_screen', Track.Kind.Video, Track.Source.ScreenShare)];
			participant.bump();
			service.toggleStreamPinned(cameraStream().streamId);
			service.toggleStreamFloating(cameraStream().streamId);
			service.setParticipantMutedForcibly(participant.sid, true);
			service.recordScreenSharePublication('TR_screen', 1000);

			service.clearParticipantViewState(participant);

			expect(participant.isPinned).toBeFalse();
			expect(participant.isFloating).toBeFalse();
			expect(participant.isMutedForcibly).toBeFalse();

			service.setLastScreenPinned();
			expect(service.isStreamPinned('TR_screen')).toBeFalse();
		});

		it('clears all view state on meeting teardown', () => {
			service.toggleStreamPinned('some-stream');
			service.setParticipantMutedForcibly('PA_bob', true);
			service.recordScreenSharePublication('TR_screen', 1000);

			service.clearAllViewState();

			expect(service.isStreamPinned('some-stream')).toBeFalse();
			expect(service.isCameraStreamMuted('PA_bob')).toBeFalse();

			service.setLastScreenPinned();
			expect(service.isStreamPinned('TR_screen')).toBeFalse();
		});
	});
});
