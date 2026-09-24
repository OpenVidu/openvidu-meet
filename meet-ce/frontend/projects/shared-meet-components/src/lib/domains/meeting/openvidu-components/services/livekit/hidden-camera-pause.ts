import { RemoteVideoTrack, type ElementInfo, type Track } from 'livekit-client';

/**
 * Registered on a hidden camera so adaptive stream pauses it exactly as it pauses a detached `<video>`.
 * `RemoteTrackPublication.setEnabled` is not an option: once called it overrides adaptive stream for good
 * on that publication, background-tab pause included.
 */
class NeverVisibleElement implements ElementInfo {
	readonly element: object = {};
	readonly visible = false;
	readonly pictureInPicture = false;
	readonly visibilityChangedAt = undefined;

	width(): number {
		return 0;
	}

	height(): number {
		return 0;
	}

	observe(): void {}

	stopObserving(): void {}
}

/**
 * Pauses the video of the remote cameras nobody renders. Their subscription is kept, so a camera shown
 * again plays as soon as a `<video>` is attached, without renegotiating.
 */
export class HiddenCameraPause {
	private readonly paused = new Map<RemoteVideoTrack, ElementInfo>();

	/** Pauses exactly the given cameras and lets every other one paused before resume. */
	pauseOnly(cameras: Iterable<Track | undefined>): void {
		const hidden = new Set<RemoteVideoTrack>();

		for (const camera of cameras) {
			if (camera instanceof RemoteVideoTrack && camera.isAdaptiveStream) hidden.add(camera);
		}

		for (const [camera, element] of this.paused) {
			if (hidden.has(camera)) continue;

			camera.stopObservingElementInfo(element);
			this.paused.delete(camera);
		}

		for (const camera of hidden) {
			if (this.paused.has(camera)) continue;

			const element = new NeverVisibleElement();
			camera.observeElementInfo(element);
			this.paused.set(camera, element);
		}
	}

	release(): void {
		this.pauseOnly([]);
	}
}
