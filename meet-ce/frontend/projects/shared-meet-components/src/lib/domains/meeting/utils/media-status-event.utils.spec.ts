import { EmbeddedEventName, MeetEventOrigin } from '@openvidu-meet/typings';
import { Track } from '../openvidu-components';
import { toMediaStatusChangedEvent } from './media-status-event.utils';

describe('toMediaStatusChangedEvent', () => {
	it('should map each notified track source to its media status event', () => {
		expect(toMediaStatusChangedEvent(Track.Source.Microphone, true)).toEqual({
			event: EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED,
			payload: { enabled: true, origin: MeetEventOrigin.PARTICIPANT }
		});

		expect(toMediaStatusChangedEvent(Track.Source.Camera, false)).toEqual({
			event: EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED,
			payload: { enabled: false, origin: MeetEventOrigin.PARTICIPANT }
		});

		expect(toMediaStatusChangedEvent(Track.Source.ScreenShare, true)).toEqual({
			event: EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED,
			payload: { enabled: true, origin: MeetEventOrigin.PARTICIPANT }
		});
	});

	it('should say nothing about the sources the contract does not notify', () => {
		expect(toMediaStatusChangedEvent(Track.Source.ScreenShareAudio, true)).toBeUndefined();
		expect(toMediaStatusChangedEvent(Track.Source.Unknown, true)).toBeUndefined();
	});

	it('should carry the origin it is given (the seam for moderator-caused changes)', () => {
		const embeddedEvent = toMediaStatusChangedEvent(Track.Source.Microphone, false, MeetEventOrigin.MODERATOR);

		expect(embeddedEvent).toEqual({
			event: EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED,
			payload: { enabled: false, origin: MeetEventOrigin.MODERATOR }
		});
	});
});
