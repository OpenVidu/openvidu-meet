import { inject, Injectable } from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';

/**
 * Service responsible for managing sound effects within the application.
 */
@Injectable()
export class SoundService {
	private runtimeConfig = inject(RuntimeConfigService);

	constructor() {}

	/**
	 * Plays a sound to indicate that a participant has joined the meeting.
	 */
	playParticipantJoinedSound(): void {
		const audio = new Audio(this.runtimeConfig.resolveAssetPath('assets/sounds/participant-joined.mp3'));
		audio.volume = 0.4;
		audio.play();
	}

	/**
	 * Plays a sound to indicate that a participant's role has been upgraded.
	 */
	playParticipantRoleUpgradedSound(): void {
		const audio = new Audio(this.runtimeConfig.resolveAssetPath('assets/sounds/role-upgraded.wav'));
		audio.volume = 0.4;
		audio.play();
	}

	/**
	 * Plays a sound to indicate that a participant's role has been downgraded.
	 */
	playParticipantRoleDowngradedSound(): void {
		const audio = new Audio(this.runtimeConfig.resolveAssetPath('assets/sounds/role-downgraded.wav'));
		audio.volume = 0.4;
		audio.play();
	}
}
