import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Track } from '../../services/livekit-adapter';

/**
 * @internal
 */
@Component({
	selector: 'ov-media-element',
	template: `
		<ov-video-poster
			[animate.enter]="'ov-poster-enter'"
			[animate.leave]="'ov-poster-leave'"
			[showAvatar]="showAvatar()"
			[nickname]="avatarName()"
			[color]="avatarColor()"
			[hasEncryptionError]="hasEncryptionError()"
		/>
		@if (track()?.kind === 'video') {
			<video #videoElement class="OV_media-element OV_video-element" [attr.id]="track()?.sid"></video>
		}
		@if (track()?.kind === 'audio') {
			<audio #audioElement class="OV_media-element OV_audio-element" [attr.id]="track()?.sid"></audio>
		}
	`,
	styleUrl: './media-element.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class MediaElementComponent implements OnDestroy {
	readonly track = input<Track | undefined>(undefined);
	readonly muted = input(false);
	readonly showAvatar = input(false);
	readonly avatarColor = input('#000000');
	readonly avatarName = input('User');
	readonly isLocal = input(false);
	readonly hasEncryptionError = input(false);
	readonly videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');
	readonly audioElement = viewChild<ElementRef<HTMLAudioElement>>('audioElement');

	private previousTrack: Track | null = null;

	constructor() {
		effect(() => {
			const activeTrack = this.track();
			const video = this.videoElement()?.nativeElement;
			const audio = this.audioElement()?.nativeElement;
			const local = this.isLocal();
			const muted = this.muted();

			if (this.previousTrack && this.previousTrack !== activeTrack) {
				if (video) this.previousTrack.detach(video);
				if (audio) this.previousTrack.detach(audio);
			}

			if (!activeTrack) return;
			this.previousTrack = activeTrack;

			if (activeTrack.kind === Track.Kind.Video && video) {
				this.updateVideoStyles(activeTrack, video, local);
				activeTrack.attach(video);
			}

			if (activeTrack.kind === Track.Kind.Audio && audio && !local) {
				audio.muted = muted;
				activeTrack.mediaStreamTrack.enabled = !muted;
				activeTrack.attach(audio);
			}
		});
	}

	ngOnDestroy() {
		if (this.previousTrack) {
			const video = this.videoElement()?.nativeElement;
			const audio = this.audioElement()?.nativeElement;
			if (video) this.previousTrack.detach(video);
			if (audio) this.previousTrack.detach(audio);
		}
	}

	private updateVideoStyles(track: Track, videoElement: HTMLVideoElement, isLocal: boolean) {
		videoElement.classList.remove('screen-type', 'camera-type');
		videoElement.style.transform = '';

		if (track.source === Track.Source.ScreenShare) {
			videoElement.style.objectFit = 'contain';
			videoElement.classList.add('screen-type');
		} else if (track.source === Track.Source.Camera) {
			if (isLocal) {
				videoElement.style.transform = 'scaleX(-1)';
			}
			videoElement.style.objectFit = 'cover';
			videoElement.classList.add('camera-type');
		}
	}
}
