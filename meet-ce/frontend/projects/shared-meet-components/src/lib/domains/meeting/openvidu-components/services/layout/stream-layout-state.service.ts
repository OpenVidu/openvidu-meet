import { Injector, Service, inject } from '@angular/core';
import { ParticipantService } from '../participant/participant.service';

/**
 * Owns the *stream layout* state and its mutations — pinning, floating/docking the local camera,
 * resizing streams back to normal, and screen-share pinning bookkeeping. These
 * operate on the `ParticipantModel` publication flags (`isPinned`/`isFloating`/screen dates), so
 * this service reads the participant registry from {@link ParticipantService}.
 *
 * Dependency direction is layout → registry. The registry (`ParticipantService.connect`) also
 * needs to trigger a layout action (auto-float on join), which would form a construction cycle;
 * to keep it benign, the registry is resolved lazily through the {@link Injector} at call time
 * rather than eagerly at construction. By then both singletons exist.
 */
@Service()
export class StreamLayoutStateService {
	private readonly injector = inject(Injector);

	/** Resolved lazily (see class doc) to avoid a construction-time DI cycle with the registry. */
	private get participantService(): ParticipantService {
		return this.injector.get(ParticipantService);
	}

	/**
	 * @internal
	 */
	toggleMyVideoPinned(sid: string | undefined) {
		const local = this.participantService.localParticipant();
		if (sid && local) local.toggleVideoPinned(sid);
		// toggleVideoPinned calls bump() internally — no explicit update needed.
	}

	/**
	 * @internal
	 */
	toggleLocalVideoFloating(sid: string | undefined) {
		const local = this.participantService.localParticipant();
		if (sid && local) local.toggleVideoFloating(sid);
		// toggleVideoFloating calls bump() internally — no explicit update needed.
	}

	/**
	 * Floats the local camera video if it is not already floating.
	 * Called automatically when the first remote participant joins the room.
	 * @internal
	 */
	floatLocalCameraVideo(): void {
		const local = this.participantService.localParticipant();
		if (!local || local.isFloating) return;
		const cameraStream = local.streams().find((s) => s.isCameraStream);
		if (cameraStream) local.toggleVideoFloating(cameraStream.streamId);
	}

	/**
	 * Restores the local camera video to the layout if it is currently floating.
	 * Called automatically when the last remote participant leaves the room.
	 * @internal
	 */
	dockLocalCameraVideo(): void {
		const local = this.participantService.localParticipant();
		if (!local || !local.isFloating) return;
		const cameraStream = local.streams().find((s) => s.isCameraStream);
		if (cameraStream) local.toggleVideoFloating(cameraStream.streamId);
	}

	/**
	 * @internal
	 */
	resetLocalStreamsToNormalSize() {
		this.participantService.localParticipant()?.setAllVideoPinned(false);
	}

	/**
	 * @internal
	 */
	resetRemoteStreamsToNormalSize() {
		// setAllVideoPinned calls bump() internally — no array update needed.
		this.participantService.remoteParticipants().forEach((p) => p.setAllVideoPinned(false));
	}

	/**
	 * @internal
	 */
	toggleRemoteVideoPinned(sid: string | undefined) {
		if (sid) {
			const participant = this.participantService
				.remoteParticipants()
				.find((p) => p.tracks.some((track) => track.trackSid === sid));
			// toggleVideoPinned calls bump() internally — no array update needed.
			participant?.toggleVideoPinned(sid);
		}
	}

	/**
	 * Set the screen track publication date of a remote participant with the aim of taking control of the last screen published
	 * @param participantSid
	 * @param trackSid
	 * @param createdAt
	 * @internal
	 */
	setScreenTrackPublicationDate(participantSid: string, trackSid: string, createdAt: number) {
		// setScreenTrackPublicationDate bumps _revision internally.
		this.participantService
			.remoteParticipants()
			.find((p) => p.sid === participantSid)
			?.setScreenTrackPublicationDate(trackSid, createdAt);
	}

	/**
	 * Sets the last screen element as pinned
	 * @internal
	 */
	setLastScreenPinned() {
		const local = this.participantService.localParticipant();
		if (!local?.isScreenShareEnabled && !this.participantService.someRemoteIsSharingScreen()) {
			return;
		}
		let localCreatedAt = -Infinity;
		let localTrackSid = '';
		if (local?.isScreenShareEnabled) {
			localCreatedAt = Math.max(...local.screenTrackPublicationDate.values());
			local.screenTrackPublicationDate.forEach((value, key) => {
				if (value === localCreatedAt) {
					localTrackSid = key;
					return;
				}
			});
		}

		let remoteCreatedAt = -Infinity;
		let remoteTrackSid = '';
		if (this.participantService.someRemoteIsSharingScreen()) {
			const lastRemoteParticipant = this.participantService.remoteParticipants().reduce((prev, current) => {
				const prevMax = Math.max(...prev.screenTrackPublicationDate.values());
				const currentMax = Math.max(...current.screenTrackPublicationDate.values());
				return prevMax > currentMax ? prev : current;
			});
			remoteCreatedAt = Math.max(...lastRemoteParticipant.screenTrackPublicationDate.values());
			lastRemoteParticipant.screenTrackPublicationDate.forEach((value, key) => {
				if (value === remoteCreatedAt) {
					remoteTrackSid = key;
					return;
				}
			});
		}

		if (remoteCreatedAt > localCreatedAt) {
			this.toggleRemoteVideoPinned(remoteTrackSid);
		} else {
			this.toggleMyVideoPinned(localTrackSid);
		}
	}
}
