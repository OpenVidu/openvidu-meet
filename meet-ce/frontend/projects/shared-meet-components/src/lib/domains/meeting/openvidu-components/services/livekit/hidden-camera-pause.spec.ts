import { RemoteVideoTrack, TrackEvent } from 'livekit-client';
import { HiddenCameraPause } from './hidden-camera-pause';

const remoteCamera = ({ adaptiveStream = true } = {}): RemoteVideoTrack => {
	const [mediaTrack] = document.createElement('canvas').captureStream().getVideoTracks();
	const receiver = undefined as unknown as RTCRtpReceiver;
	return new RemoteVideoTrack(mediaTrack, `TR_${crypto.randomUUID()}`, receiver, adaptiveStream ? {} : undefined);
};

describe('HiddenCameraPause', () => {
	let pause: HiddenCameraPause;

	beforeEach(() => {
		pause = new HiddenCameraPause();
	});

	it('tells adaptive stream once that a hidden camera is not visible', () => {
		const camera = remoteCamera();
		const visibility: boolean[] = [];
		camera.on(TrackEvent.VisibilityChanged, (visible: boolean) => visibility.push(visible));
		const observe = spyOn(camera, 'observeElementInfo').and.callThrough();

		pause.pauseOnly([camera]);
		pause.pauseOnly([camera]);

		expect(observe).toHaveBeenCalledTimes(1);
		expect(visibility).toEqual([false]);
	});

	it('stops pausing a camera that is no longer hidden', () => {
		const camera = remoteCamera();
		const observe = spyOn(camera, 'observeElementInfo').and.callThrough();
		const stopObserving = spyOn(camera, 'stopObservingElementInfo').and.callThrough();

		pause.pauseOnly([camera]);
		pause.pauseOnly([]);

		expect(stopObserving).toHaveBeenCalledOnceWith(observe.calls.argsFor(0)[0]);
	});

	it('leaves alone a missing camera and one without adaptive stream', () => {
		const camera = remoteCamera({ adaptiveStream: false });
		const observe = spyOn(camera, 'observeElementInfo');

		pause.pauseOnly([undefined, camera]);

		expect(observe).not.toHaveBeenCalled();
	});

	it('stops pausing every camera on release', () => {
		const cameras = [remoteCamera(), remoteCamera()];
		const stopObserving = cameras.map((camera) => spyOn(camera, 'stopObservingElementInfo').and.callThrough());

		pause.pauseOnly(cameras);
		pause.release();

		stopObserving.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
	});
});
