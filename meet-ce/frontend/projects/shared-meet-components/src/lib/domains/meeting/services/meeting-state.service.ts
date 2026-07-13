import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ParticipantModel, ParticipantService, Room } from '../openvidu-components';

/**
 * Holds the LIVE runtime state of the active meeting
 */
@Injectable({
	providedIn: 'root'
})
export class MeetingStateService {
	private readonly ovParticipantService = inject(ParticipantService);
	private readonly _lkRoom = signal<Room | undefined>(undefined);
	private readonly _localParticipant = signal<ParticipantModel | undefined>(undefined);
	private readonly _remoteParticipants = signal<ParticipantModel[]>([]);

	/** Readonly signal for the current LiveKit room */
	readonly lkRoom = this._lkRoom.asReadonly();
	/** Readonly signal for the local participant */
	readonly localParticipant = this._localParticipant.asReadonly();
	/** Readonly signal for the remote participants */
	readonly remoteParticipants = this._remoteParticipants.asReadonly();
	/** Computed signal that combines local and remote participants */
	readonly allParticipants = computed(() => {
		const local = this._localParticipant();
		const remotes = this._remoteParticipants();
		return local ? [local, ...remotes] : remotes;
	});
	/** Computed signal for whether the local participant is alone (no remote participants yet) */
	readonly isAlone = computed(() => this._remoteParticipants().length === 0);

	constructor() {
		// Sync local participant signal
		effect(() => {
			const localParticipant = this.ovParticipantService.localParticipant();
			this._localParticipant.set(localParticipant as ParticipantModel);
		});

		// Sync remote participants signal
		effect(() => {
			const remoteParticipants = this.ovParticipantService.remoteParticipants();
			this._remoteParticipants.set(remoteParticipants as ParticipantModel[]);
		});
	}

	/**
	 * Sets the LiveKit Room instance in the live meeting state
	 * @param room
	 */
	setLkRoom(room: Room): void {
		this._lkRoom.set(room);
	}

	/**
	 * Resets the live meeting state. The participant signals also track ParticipantService
	 * reactively, so they clear automatically when it is cleared.
	 */
	clear(): void {
		this._lkRoom.set(undefined);
		this._localParticipant.set(undefined);
		this._remoteParticipants.set([]);
	}
}
