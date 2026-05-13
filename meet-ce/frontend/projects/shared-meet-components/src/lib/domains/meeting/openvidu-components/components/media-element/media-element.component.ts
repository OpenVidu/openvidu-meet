import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Track } from '../../services/livekit-adapter';
import { VideoPosterComponent } from '../video-poster/video-poster.component';

/**
 *
 * Renders the media element for a participant stream.
 *
 * Two modes:
 * - **Video mode** (videoTrack is defined): renders a single `<video>` element and attaches
 *   both videoTrack and audioTrack to it. The browser handles AV synchronisation natively
 *   inside the same MediaStream.
 * - **Audio-only mode** (videoTrack is undefined, remote only): renders a hidden `<audio>`
 *   element for playback and shows the avatar poster instead of video. This avoids the
 *   overhead of the browser video decode/rendering pipeline for participants that have no
 *   camera or screen-share active.
 * - **Local audio-only**: no media element at all (local audio is never played back to
 *   avoid feedback), only the avatar poster is rendered.
 */
@Component({
	selector: 'ov-media-element',
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
		} @else if (!isLocal() && audioTrack()) {
			<audio #audioElement class="OV_media-element OV_audio-element" [attr.id]="audioTrack()!.sid"></audio>
		}
	`,
	styleUrl: './media-element.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class MediaElementComponent implements OnDestroy {
	readonly videoTrack = input<Track | undefined>(undefined);
	readonly audioTrack = input<Track | undefined>(undefined);
	readonly muted = input(false);
	readonly showAvatar = input(false);
	readonly avatarColor = input('#000000');
	readonly avatarName = input('User');
	readonly isLocal = input(false);
	readonly hasEncryptionError = input(false);
	readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');
	readonly audioElement = viewChild<ElementRef<HTMLAudioElement>>('audioElement');

	// Track references to correctly detach on change or destroy.
	private previousVideoTrack: Track | null = null;
	private previousVideoElement: HTMLVideoElement | null = null;
	private previousAudioTrack: Track | null = null;
	// The element the audio track was last attached to (video element in AV mode, audio element in audio-only mode).
	private previousAudioElement: HTMLMediaElement | null = null;

	// Effect 1: attach/detach tracks when the track reference or the DOM element changes.
	// Does NOT read muted() so a forced-mute change never triggers attachment logic.
	private attachTracksEffect = effect(() => {
		const newVideoTrack = this.videoTrack();
		const newAudioTrack = this.audioTrack();
		const video = this.videoElement()?.nativeElement ?? null;
		const audio = this.audioElement()?.nativeElement ?? null;
		const local = this.isLocal();

		// In video mode audio is attached to the video element (same MediaStream → AV sync).
		// In audio-only mode (remote) audio is attached to the dedicated audio element.
		const targetAudioElement: HTMLMediaElement | null = video ?? audio;

		// --- Video track ---
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

		// --- Audio track (remote only — local playback causes feedback) ---
		if (!local && (this.previousAudioTrack !== newAudioTrack || this.previousAudioElement !== targetAudioElement)) {
			if (this.previousAudioTrack && this.previousAudioElement) {
				this.previousAudioTrack.detach(this.previousAudioElement);
			}
			this.previousAudioTrack = newAudioTrack ?? null;
			this.previousAudioElement = targetAudioElement;
			if (newAudioTrack && targetAudioElement) {
				newAudioTrack.attach(targetAudioElement);
			}
		}
	});

	// Effect 2: keep forced-mute state in sync.
	// Isolated so muted() changes don't trigger attachment logic above.
	// Runs after Effect 1 (creation order) so muted is applied after attach().
	private syncMuteStateEffect = effect(() => {
		const newAudioTrack = this.audioTrack();
		const video = this.videoElement()?.nativeElement ?? null;
		const audio = this.audioElement()?.nativeElement ?? null;
		const local = this.isLocal();
		const muted = this.muted();

		if (!local && newAudioTrack) {
			const targetAudioElement: HTMLMediaElement | null = video ?? audio;
			if (targetAudioElement) {
				targetAudioElement.muted = muted;
				newAudioTrack.mediaStreamTrack.enabled = !muted;
			}
		}
	});

	ngOnDestroy() {
		if (this.previousVideoTrack && this.previousVideoElement) {
			this.previousVideoTrack.detach(this.previousVideoElement);
		}
		if (this.previousAudioTrack && this.previousAudioElement) {
			this.previousAudioTrack.detach(this.previousAudioElement);
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
