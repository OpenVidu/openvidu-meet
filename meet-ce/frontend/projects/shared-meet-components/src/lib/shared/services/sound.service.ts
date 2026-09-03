import { inject, Injectable } from '@angular/core';
import { AssetsService } from './assets.service';

/**
 * Service responsible for managing sound effects within the application.
 */
@Injectable()
export class SoundService {
	private readonly assets = inject(AssetsService);

	private participantJoinedAudio?: HTMLAudioElement;
	private roleUpgradedAudio?: HTMLAudioElement;
	private roleDowngradedAudio?: HTMLAudioElement;
	private meetingEndingSoonAudio?: HTMLAudioElement;

	/**
	 * Plays a sound to indicate that a participant has joined the meeting.
	 */
	playParticipantJoinedSound(): void {
		this.participantJoinedAudio ??= this.createAudio(this.assets.participantJoinedSound);
		this.play(this.participantJoinedAudio);
	}

	/**
	 * Plays a sound to indicate that a participant's role has been upgraded.
	 */
	playParticipantRoleUpgradedSound(): void {
		this.roleUpgradedAudio ??= this.createAudio(this.assets.roleUpgradedSound);
		this.play(this.roleUpgradedAudio);
	}

	/**
	 * Plays a sound to indicate that a participant's role has been downgraded.
	 */
	playParticipantRoleDowngradedSound(): void {
		this.roleDowngradedAudio ??= this.createAudio(this.assets.roleDowngradedSound);
		this.play(this.roleDowngradedAudio);
	}

	/**
	 * Plays a sound to indicate that a duration-limited meeting is about to end.
	 */
	playMeetingEndingSoonSound(): void {
		this.meetingEndingSoonAudio ??= this.createAudio(this.assets.meetingEndingSoonSound);
		this.play(this.meetingEndingSoonAudio);
	}

	private createAudio(src: string): HTMLAudioElement {
		const audio = new Audio(src);
		audio.volume = 0.4;
		return audio;
	}

	private play(audio: HTMLAudioElement): void {
		audio.currentTime = 0;
		audio.play().catch(() => {});
	}
}
