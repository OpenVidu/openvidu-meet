import { MeetRoomMemberUIBadge } from '@openvidu-meet/typings';
import { LocalParticipant, RemoteParticipant, Track, TrackPublication } from '../services/livekit';
import { ParticipantModel, ParticipantViewStateReader } from './participant.model';

interface FakePublicationInit {
	trackSid: string;
	kind: Track.Kind;
	source: Track.Source;
}

const fakePublication = (init: FakePublicationInit): TrackPublication =>
	({
		trackSid: init.trackSid,
		trackName: init.trackSid,
		kind: init.kind,
		source: init.source
	}) as unknown as TrackPublication;

const cameraPublication = (trackSid = 'TR_camera') =>
	fakePublication({ trackSid, kind: Track.Kind.Video, source: Track.Source.Camera });
const micPublication = (trackSid = 'TR_mic') =>
	fakePublication({ trackSid, kind: Track.Kind.Audio, source: Track.Source.Microphone });
const screenPublication = (trackSid = 'TR_screen') =>
	fakePublication({ trackSid, kind: Track.Kind.Video, source: Track.Source.ScreenShare });
const screenAudioPublication = (trackSid = 'TR_screen_audio') =>
	fakePublication({ trackSid, kind: Track.Kind.Audio, source: Track.Source.ScreenShareAudio });

interface FakeParticipantOptions {
	identity?: string;
	sid?: string;
	name?: string;
	metadata?: string;
	isLocal?: boolean;
	publications?: TrackPublication[];
	isCameraEnabled?: boolean;
	isMicrophoneEnabled?: boolean;
	isScreenShareEnabled?: boolean;
}

interface FakeLiveKitParticipant {
	identity: string;
	sid: string;
	name: string | undefined;
	metadata: string | undefined;
	isLocal: boolean;
	publications: TrackPublication[];
	isCameraEnabled: boolean;
	isMicrophoneEnabled: boolean;
	isScreenShareEnabled: boolean;
	getTrackPublications(): TrackPublication[];
}

const fakeLiveKitParticipant = (options: FakeParticipantOptions = {}): FakeLiveKitParticipant => {
	const fake: FakeLiveKitParticipant = {
		identity: options.identity ?? 'alice',
		sid: options.sid ?? 'PA_alice',
		name: options.name ?? 'Alice',
		metadata: options.metadata,
		isLocal: options.isLocal ?? false,
		publications: options.publications ?? [],
		isCameraEnabled: options.isCameraEnabled ?? false,
		isMicrophoneEnabled: options.isMicrophoneEnabled ?? false,
		isScreenShareEnabled: options.isScreenShareEnabled ?? false,
		getTrackPublications() {
			return this.publications;
		}
	};
	return fake;
};

const modelFor = (fake: FakeLiveKitParticipant, viewState?: ParticipantViewStateReader): ParticipantModel =>
	new ParticipantModel({ participant: fake as unknown as LocalParticipant | RemoteParticipant, viewState });

describe('ParticipantModel', () => {
	describe('streams()', () => {
		it('always produces a camera stream (avatar tile) even with no publications at all', () => {
			const participant = modelFor(fakeLiveKitParticipant({ identity: 'ghost', publications: [] }));

			const streams = participant.streams();

			expect(streams.length).toBe(1);
			expect(streams[0].isCameraStream).toBeTrue();
			expect(streams[0].videoTrack).toBeUndefined();
			expect(streams[0].audioTrack).toBeUndefined();
			expect(streams[0].streamId).toBe('camera-ghost');
		});

		it('groups the camera video and microphone audio into a single camera stream', () => {
			const camera = cameraPublication();
			const mic = micPublication();
			const participant = modelFor(fakeLiveKitParticipant({ publications: [camera, mic] }));

			const streams = participant.streams();

			expect(streams.length).toBe(1);
			expect(streams[0].videoTrack).toBe(camera);
			expect(streams[0].audioTrack).toBe(mic);
			expect(streams[0].streamId).toBe('camera-alice');
		});

		// The tracks arrive in whatever order LiveKit publishes them, and a stream that grabs the
		// wrong one puts the screen share in the camera tile, or mutes the wrong audio.
		it('gives each stream its own publication, whatever order they were published in', () => {
			const screenVideo = screenPublication();
			const mic = micPublication();
			const camera = cameraPublication();
			const screenAudio = screenAudioPublication();
			const participant = modelFor(
				fakeLiveKitParticipant({ publications: [screenVideo, mic, camera, screenAudio] })
			);

			const [cameraStream, screenStream] = participant.streams();

			expect(cameraStream.videoTrack).toBe(camera);
			expect(cameraStream.audioTrack).toBe(mic);
			expect(screenStream.videoTrack).toBe(screenVideo);
			expect(screenStream.audioTrack).toBe(screenAudio);
		});

		// Pinning, floating and a moderator's mute are per viewer, so a model built without that
		// state (a participant nobody is rendering yet) must not claim any of them.
		it('claims no pin, no float and no forced mute without per-viewer state', () => {
			const participant = modelFor(
				fakeLiveKitParticipant({ publications: [cameraPublication(), screenPublication()] })
			);

			expect(
				participant.streams().map(({ isPinned, isFloating, isMutedForcibly }) => ({
					isPinned,
					isFloating,
					isMutedForcibly
				}))
			).toEqual([
				{ isPinned: false, isFloating: false, isMutedForcibly: false },
				{ isPinned: false, isFloating: false, isMutedForcibly: false }
			]);
		});

		it('reads pin, float and forced mute from the per-viewer state, per stream', () => {
			const viewState: ParticipantViewStateReader = {
				isStreamPinned: (streamId) => streamId === 'TR_screen',
				isStreamFloating: (streamId) => streamId === 'camera-alice',
				isCameraStreamMuted: (sid) => sid === 'PA_alice',
				isScreenStreamMuted: () => false
			};
			const participant = modelFor(
				fakeLiveKitParticipant({ publications: [cameraPublication(), screenPublication()] }),
				viewState
			);

			const [cameraStream, screenStream] = participant.streams();

			expect({
				isPinned: cameraStream.isPinned,
				isFloating: cameraStream.isFloating,
				isMutedForcibly: cameraStream.isMutedForcibly
			}).toEqual({ isPinned: false, isFloating: true, isMutedForcibly: true });
			expect({
				isPinned: screenStream.isPinned,
				isFloating: screenStream.isFloating,
				isMutedForcibly: screenStream.isMutedForcibly
			}).toEqual({ isPinned: true, isFloating: false, isMutedForcibly: false });
		});

		it('keeps the camera streamId stable when the camera track is republished with a new SID', () => {
			// Regression: the camera streamId used to be the track SID, so per-viewer pin/float
			// state keyed to it died on every republish (camera toggle, reconnect).
			const fake = fakeLiveKitParticipant({ publications: [cameraPublication('TR_camera_1')] });
			const participant = modelFor(fake);

			const before = participant.streams()[0].streamId;

			fake.publications = [cameraPublication('TR_camera_2')];
			participant.bump();

			expect(participant.streams()[0].streamId).toBe(before);
		});

		it('produces a second stream grouping screen video and screen audio while sharing', () => {
			const screen = screenPublication();
			const screenAudio = screenAudioPublication();
			const participant = modelFor(
				fakeLiveKitParticipant({ publications: [cameraPublication(), screen, screenAudio] })
			);

			const streams = participant.streams();

			expect(streams.length).toBe(2);
			const screenStream = streams[1];
			expect(screenStream.isScreenStream).toBeTrue();
			expect(screenStream.videoTrack).toBe(screen);
			expect(screenStream.audioTrack).toBe(screenAudio);
			expect(screenStream.streamId).toBe('TR_screen');
		});

		it('produces a screen stream from a lone screen-audio publication (audio-only tab share)', () => {
			const screenAudio = screenAudioPublication();
			const participant = modelFor(fakeLiveKitParticipant({ identity: 'bob', publications: [screenAudio] }));

			const streams = participant.streams();

			expect(streams.length).toBe(2);
			expect(streams[1].isScreenStream).toBeTrue();
			expect(streams[1].videoTrack).toBeUndefined();
			expect(streams[1].audioTrack).toBe(screenAudio);
			expect(streams[1].streamId).toBe('screen-bob');
		});

		it('caches the computed streams until bump() signals a LiveKit mutation', () => {
			const fake = fakeLiveKitParticipant({ publications: [] });
			const participant = modelFor(fake);

			const before = participant.streams();
			expect(participant.streams()).toBe(before);

			fake.publications = [cameraPublication()];
			expect(participant.streams()).toBe(before);

			participant.bump();
			const after = participant.streams();
			expect(after).not.toBe(before);
			expect(after[0].videoTrack).toBeDefined();
		});

		it('keeps the same ScreenZoomState instance for a screen stream across recomputations', () => {
			const fake = fakeLiveKitParticipant({ publications: [screenPublication()] });
			const participant = modelFor(fake);

			const zoomBefore = participant.streams()[1].zoom;
			participant.bump();
			const zoomAfter = participant.streams()[1].zoom;

			expect(zoomBefore).toBeDefined();
			expect(zoomAfter).toBe(zoomBefore);
		});
	});

	describe('media state getters', () => {
		it('delegates isCameraEnabled/isMicrophoneEnabled/isScreenShareEnabled to LiveKit', () => {
			const fake = fakeLiveKitParticipant({
				isCameraEnabled: true,
				isMicrophoneEnabled: false,
				isScreenShareEnabled: true
			});
			const participant = modelFor(fake);

			expect(participant.isCameraEnabled).toBeTrue();
			expect(participant.isMicrophoneEnabled).toBeFalse();
			expect(participant.isScreenShareEnabled).toBeTrue();
		});

		it('never reports speaking while the microphone is disabled', () => {
			const fake = fakeLiveKitParticipant({ isMicrophoneEnabled: false });
			const participant = modelFor(fake);

			participant.setSpeaking(true);
			expect(participant.isSpeaking).toBeFalse();

			fake.isMicrophoneEnabled = true;
			expect(participant.isSpeaking).toBeTrue();
		});
	});

	describe('name', () => {
		it('returns the LiveKit name and prefers the decrypted name once set', () => {
			const participant = modelFor(fakeLiveKitParticipant({ name: 'Alice (encrypted)' }));

			expect(participant.name).toBe('Alice (encrypted)');

			participant.setDecryptedName('Alice');
			expect(participant.name).toBe('Alice');
		});
	});

	describe('moderation metadata', () => {
		it('reads the badge and promoted-moderator flag from the connection metadata', () => {
			const metadata = JSON.stringify({ badge: MeetRoomMemberUIBadge.MODERATOR, isPromotedModerator: true });
			const participant = modelFor(fakeLiveKitParticipant({ metadata }));

			expect(participant.getBadge()).toBe(MeetRoomMemberUIBadge.MODERATOR);
			expect(participant.hasBadge()).toBeTrue();
			expect(participant.isPromotedModerator()).toBeTrue();
		});

		it('defaults to the OTHER badge when metadata is missing or malformed', () => {
			const withoutMetadata = modelFor(fakeLiveKitParticipant({ metadata: undefined }));
			const malformed = modelFor(fakeLiveKitParticipant({ metadata: 'not-json{' }));

			expect(withoutMetadata.getBadge()).toBe(MeetRoomMemberUIBadge.OTHER);
			expect(withoutMetadata.hasBadge()).toBeFalse();
			expect(malformed.getBadge()).toBe(MeetRoomMemberUIBadge.OTHER);
			expect(malformed.isPromotedModerator()).toBeFalse();
		});
	});
});
