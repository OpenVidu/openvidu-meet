import { ChangeDetectionStrategy, Component, effect, ElementRef, input, OnDestroy, viewChild } from '@angular/core';
import { Track } from '../../services/livekit-adapter';
import { VideoPosterComponent } from '../video-poster/video-poster.component';

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
 */
@Component({
	selector: 'ov-video-element',
	imports: [VideoPosterComponent],
	template: `
		<ov-video-poster
			[animate.enter]="'ov-poster-enter'"
			[animate.leave]="'ov-poster-leave'"
			[showAvatar]="showAvatar()"
			[nickname]="avatarName()"
			[color]="avatarColor()"
			[hasEncryptionError]="hasEncryptionError()"
		/>
		@if (videoTrack()) {
			<video #videoElement class="OV_media-element OV_video-element" [class.ov-video-ready]="!showAvatar()" [attr.id]="videoTrack()!.sid"></video>
		}
	`,
	styleUrl: './video-element.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class VideoElementComponent implements OnDestroy {
	readonly videoTrack = input<Track | undefined>(undefined);
	readonly showAvatar = input(false);
	readonly avatarColor = input('#000000');
	readonly avatarName = input('User');
	readonly isLocal = input(false);
	readonly hasEncryptionError = input(false);
	readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

	private previousVideoTrack: Track | null = null;
	private previousVideoElement: HTMLVideoElement | null = null;

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

	private updateVideoStyles(track: Track, video: HTMLVideoElement, isLocal: boolean) {
		const isScreen = track.source === Track.Source.ScreenShare;
		const isCamera = track.source === Track.Source.Camera;

		video.classList.toggle('screen-source', isScreen);
		video.classList.toggle('camera-source', isCamera);

		// Screen shares should use 'contain' to avoid cropping, while camera streams use 'cover' to fill the area.
		video.style.objectFit = isScreen ? 'contain' : 'cover';
		// Mirror camera if it's a local participant, but never mirror screen shares.
		video.style.transform = isCamera && isLocal ? 'scaleX(-1)' : '';
	}
}
