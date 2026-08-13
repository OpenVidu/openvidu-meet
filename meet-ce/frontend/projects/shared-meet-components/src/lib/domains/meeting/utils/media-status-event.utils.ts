import { EmbeddedEvent, EmbeddedEventName, MeetEventOrigin } from '@openvidu-meet/typings';
import { Track } from '../openvidu-components';

/**
 * Maps a local track state change to the media status event the embedded contract notifies the
 * host with. Returns `undefined` for the track sources the contract says nothing about (screen
 * share audio, unknown sources), so callers can simply skip them.
 *
 * `origin` defaults to the participant acting on themselves; a remote moderation feature passes
 * {@link MeetEventOrigin.MODERATOR} through here instead.
 */
export const toMediaStatusChangedEvent = (
	source: Track.Source,
	enabled: boolean,
	origin: MeetEventOrigin = MeetEventOrigin.PARTICIPANT
): EmbeddedEvent | undefined => {
	switch (source) {
		case Track.Source.Microphone:
			return { event: EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED, payload: { enabled, origin } };
		case Track.Source.Camera:
			return { event: EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED, payload: { enabled, origin } };
		case Track.Source.ScreenShare:
			return { event: EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED, payload: { enabled, origin } };
		default:
			return undefined;
	}
};
