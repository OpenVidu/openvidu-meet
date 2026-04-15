import type {
	AudioCaptureOptions,
	CreateLocalTracksOptions,
	LocalAudioTrack,
	LocalTrack,
	LocalTrackPublication,
	LocalVideoTrack,
	RemoteTrack,
	RemoteTrackPublication,
	ScreenShareCaptureOptions,
	TextStreamReader,
	Track,
	TrackPublication,
	TrackPublishOptions,
	VideoCaptureOptions,
	VideoPresets
} from '../../livekit/livekit-sdk.service';

export type ITrack = Track;
export type ITrackPublication = TrackPublication;
export type ILocalTrack = LocalTrack;
export type ILocalTrackPublication = LocalTrackPublication;
export type ILocalVideoTrack = LocalVideoTrack;
export type ILocalAudioTrack = LocalAudioTrack;
export type IRemoteTrack = RemoteTrack;
export type IRemoteTrackPublication = RemoteTrackPublication;

export type ITrackPublishOptions = TrackPublishOptions;
export type IScreenShareCaptureOptions = ScreenShareCaptureOptions;
export type IVideoCaptureOptions = VideoCaptureOptions;
export type IAudioCaptureOptions = AudioCaptureOptions;
export type ICreateLocalTracksOptions = CreateLocalTracksOptions;
export type ITextStreamReader = TextStreamReader;
export type IVideoPresets = typeof VideoPresets;
