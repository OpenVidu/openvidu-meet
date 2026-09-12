import { Component, computed, effect, ElementRef, input, OnDestroy, signal, viewChild } from '@angular/core';
import { AvatarView, DEFAULT_AVATAR_VIEW } from '../../models/avatar-view.model';
import { ScreenZoomState } from '../../models/screen-zoom.model';
import { Track } from '../../services/livekit';
import { ParticipantAvatarComponent } from '../participant-avatar/participant-avatar.component';

/**
 * Renders the video element (or avatar) for a participant stream.
 *
 * Audio is **not** handled here. Remote audio is managed by an ancestor audio layer
 * (the persistent `<audio>` elements owned by {@link SmartLayoutComponent}) so that
 * audio playback is decoupled from layout visibility and survives rotation,
 * pinning, and mode switches. Local audio is never played back locally to avoid
 * feedback.
 *
 * Modes:
 * - **Video mode** (videoTrack defined): renders a `<video>` with the video track attached.
 * - **Avatar-only mode**: renders the avatar poster — no media element is mounted.
 * - **Encryption-error mode** (avatar.hasEncryptionError): the frames only decode to black and
 *   the error never clears for the session, so the `<video>` is intentionally NOT rendered — the
 *   avatar's encryption-error poster stands in its place and {@link attachVideoTrackEffect}
 *   detaches the track when the element is removed.
 */
@Component({
	selector: 'ov-video-element',
	imports: [ParticipantAvatarComponent],
	template: `
		<ov-participant-avatar
			variant="poster"
			[showAvatar]="avatar().show"
			[nickname]="avatar().name"
			[color]="avatar().color"
			[isSpeaking]="avatar().isSpeaking"
			[hasEncryptionError]="avatar().hasEncryptionError"
		/>
		@if (videoTrack() && !avatar().hasEncryptionError) {
			<video
				#videoElement
				class="OV_media-element OV_video-element"
				[class.ov-video-ready]="!avatar().show"
				[class.zoomable]="isZoomable()"
				[class.panning]="isGesturing()"
				[style.transform]="videoTransform()"
				[style.transform-origin]="'center center'"
				(pointerdown)="onPointerDown($event)"
				[attr.id]="videoTrack()!.sid"
			></video>
		}
	`,
	styleUrl: './video-element.component.scss'
})
export class VideoElementComponent implements OnDestroy {
	readonly videoTrack = input<Track | undefined>(undefined);
	readonly isLocal = input(false);
	/**
	 * Avatar poster descriptor (shown when there is no playable video). Grouped into a single
	 * view-model so this presentational component stays decoupled from the participant/stream
	 * domain model — callers build a plain {@link AvatarView} literal.
	 */
	readonly avatar = input<AvatarView>(DEFAULT_AVATAR_VIEW);
	/**
	 * Zoom/pan state for screen-share videos, owned by the participant model. Undefined for camera
	 * streams (and ignored there). The view only maps this state to pixels — it holds no zoom state itself.
	 */
	readonly zoomState = input<ScreenZoomState | undefined>(undefined);
	readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

	private previousVideoTrack: Track | null = null;
	private previousVideoElement: HTMLVideoElement | null = null;

	/** True while pointers are driving the video, so the transform stops easing and tracks them 1:1. */
	readonly isGesturing = signal(false);
	private dragOrigin = { pointerX: 0, pointerY: 0, panX: 0, panY: 0 };
	private pinchOrigin: { distance: number; level: number } | undefined;
	private readonly activePointers = new Map<number, { x: number; y: number }>();

	private readonly isScreenShare = computed(() => this.videoTrack()?.source === Track.Source.ScreenShare);

	/** Whether the video can currently be panned by dragging (screen share zoomed past 1x). */
	readonly isZoomable = computed(() => this.isScreenShare() && (this.zoomState()?.isZoomed ?? false));

	/**
	 * Composes the CSS transform for the video element. Screen shares get pan + zoom (mapping the
	 * model's normalized pan to pixels); local cameras stay mirrored; everything else is untransformed.
	 */
	readonly videoTransform = computed(() => {
		const track = this.videoTrack();

		if (!track) {
			return 'none';
		}

		if (track.source === Track.Source.ScreenShare) {
			const state = this.zoomState();

			if (!state) {
				return 'none';
			}

			const level = state.level();
			const { x, y } = this.toPixelPan(state.pan(), level);
			return `translate(${x}px, ${y}px) scale(${level})`;
		}

		if (track.source === Track.Source.Camera && this.isLocal()) {
			return 'scaleX(-1)';
		}

		return 'none';
	});

	private attachVideoTrackEffect = effect(() => {
		const newVideoTrack = this.videoTrack();
		const video = this.videoElement()?.nativeElement ?? null;
		const local = this.isLocal();

		// Re-attach whenever the track OR the video element changes. The @if (videoTrack()) in the
		// template creates the <video> element in a subsequent render cycle after the track input
		// arrives, so videoElement() becomes non-null after previousVideoTrack is already set.
		if (this.previousVideoTrack !== newVideoTrack || this.previousVideoElement !== video) {
			if (this.previousVideoTrack && this.previousVideoElement) {
				this.previousVideoTrack.detach(this.previousVideoElement);
			}

			this.previousVideoTrack = newVideoTrack ?? null;
			this.previousVideoElement = video;

			if (newVideoTrack && video) {
				this.updateVideoStyles(newVideoTrack, video, local);
				newVideoTrack.attach(video);
			}
		}
	});

	ngOnDestroy() {
		if (this.previousVideoTrack && this.previousVideoElement) {
			this.previousVideoTrack.detach(this.previousVideoElement);
		}
	}

	private updateVideoStyles(track: Track, video: HTMLVideoElement, _isLocal: boolean) {
		const isScreen = track.source === Track.Source.ScreenShare;
		const isCamera = track.source === Track.Source.Camera;

		video.classList.toggle('screen-source', isScreen);
		video.classList.toggle('camera-source', isCamera);

		// Screen shares should use 'contain' to avoid cropping, while camera streams use 'cover' to fill the area.
		video.style.objectFit = isScreen ? 'contain' : 'cover';
		// The element transform (camera mirror + screen-share pan/zoom) is driven reactively by `videoTransform`.
	}

	/**
	 * @ignore
	 * Begins a gesture on a screen share: two pointers pinch the zoom, one pans an already zoomed
	 * video. Only pointerdown is a template binding; pointermove/pointerup are attached natively for
	 * the duration of the gesture, so an idle <video> never schedules change detection at pointer
	 * rate. The updates flow through the zoom-state signals, which is what keeps the
	 * [style.transform] binding in sync.
	 *
	 * Every pointer is captured, gesture or not, so a finger that slides off the video still
	 * delivers its pointerup and cannot be left behind in {@link activePointers}. The default is
	 * only prevented once a gesture actually starts, since preventing it makes CDK ignore the event
	 * and a floating tile has to stay draggable.
	 */
	onPointerDown(event: PointerEvent) {
		const state = this.zoomState();

		if (!this.isScreenShare() || !state || this.activePointers.size >= 2) {
			return;
		}

		this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		const target = event.target as HTMLElement;
		target.setPointerCapture?.(event.pointerId);
		this.attachDragListeners(target);

		const pinchDistance = this.pointerDistance();

		if (pinchDistance > 0) {
			this.pinchOrigin = { distance: pinchDistance, level: state.level() };
		} else if (this.isZoomable()) {
			const { x, y } = state.pan();
			this.dragOrigin = { pointerX: event.clientX, pointerY: event.clientY, panX: x, panY: y };
		} else {
			// A lone finger on an unzoomed share is not a gesture yet: a second one may still pinch.
			return;
		}

		event.preventDefault();
		this.isGesturing.set(true);
	}

	/**
	 * Translates the pointer delta into a normalized pan delta and pushes it to the zoom state,
	 * which clamps it. Working in normalized units keeps the pan valid across zoom changes and resizes.
	 */
	private readonly onPointerMove = (event: PointerEvent) => {
		const state = this.zoomState();

		if (!state || !this.activePointers.has(event.pointerId)) {
			return;
		}

		this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

		if (this.pinchOrigin) {
			const distance = this.pointerDistance();

			if (distance > 0) {
				state.setLevel((this.pinchOrigin.level * distance) / this.pinchOrigin.distance);
			}

			return;
		}

		if (!this.isGesturing()) {
			return;
		}

		const { maxX, maxY } = this.maxPixelPan(state.level());
		const dx = maxX ? (event.clientX - this.dragOrigin.pointerX) / maxX : 0;
		const dy = maxY ? (event.clientY - this.dragOrigin.pointerY) / maxY : 0;
		state.setPan(this.dragOrigin.panX + dx, this.dragOrigin.panY + dy);
	};

	private readonly onPointerUp = (event: PointerEvent) => {
		const target = event.target as HTMLElement;

		this.activePointers.delete(event.pointerId);
		target.releasePointerCapture?.(event.pointerId);

		// Lifting one finger of a pinch ends the gesture: the one still down has no drag origin, and
		// panning from a stale one would jump the video.
		if (this.activePointers.size < 2) {
			this.pinchOrigin = undefined;
			this.isGesturing.set(false);
		}

		if (this.activePointers.size === 0) {
			this.detachDragListeners(target);
		}
	};

	/** Distance between the two active pointers, or 0 unless exactly two are down. */
	private pointerDistance(): number {
		if (this.activePointers.size !== 2) {
			return 0;
		}

		const [first, second] = [...this.activePointers.values()];
		return Math.hypot(second.x - first.x, second.y - first.y);
	}

	private attachDragListeners(target: HTMLElement): void {
		target.addEventListener('pointermove', this.onPointerMove);
		target.addEventListener('pointerup', this.onPointerUp);
		target.addEventListener('pointercancel', this.onPointerUp);
	}

	private detachDragListeners(target: HTMLElement): void {
		target.removeEventListener('pointermove', this.onPointerMove);
		target.removeEventListener('pointerup', this.onPointerUp);
		target.removeEventListener('pointercancel', this.onPointerUp);
	}

	/** Maps a normalized pan offset ([-1, 1] per axis) to a pixel translation for the current zoom. */
	private toPixelPan(pan: { x: number; y: number }, level: number): { x: number; y: number } {
		const { maxX, maxY } = this.maxPixelPan(level);
		return { x: pan.x * maxX, y: pan.y * maxY };
	}

	/**
	 * Maximum pixel translation on each axis that still keeps the scaled video covering its
	 * container. Zero when not zoomed or before the element has been laid out.
	 */
	private maxPixelPan(level: number): { maxX: number; maxY: number } {
		const video = this.videoElement()?.nativeElement;

		if (!video || level <= 1) {
			return { maxX: 0, maxY: 0 };
		}

		return {
			maxX: (video.clientWidth * (level - 1)) / 2,
			maxY: (video.clientHeight * (level - 1)) / 2
		};
	}
}
