import { Injectable, signal } from '@angular/core';
import { EmbeddedEventName, MeetParticipantPayload } from '@openvidu-meet/typings';

/** Reads the participant out of a `participantJoined` / `participantLeft` payload. */
const participantOf = (payload: unknown): MeetParticipantPayload | null => {
	const participant = (payload as { participant?: MeetParticipantPayload } | null)?.participant;
	return participant?.participantIdentity ? participant : null;
};

/**
 * The remote participants of the current meeting, folded from the lifecycle events
 * both transports emit, so the moderation commands can target an identity that
 * really exists instead of a hand-typed one.
 *
 * The embedded API only notifies live transitions, so a participant already in the
 * meeting when this host joined is never listed.
 */
@Injectable({ providedIn: 'root' })
export class ParticipantRosterService {
	private readonly _participants = signal<MeetParticipantPayload[]>([]);

	/** Participants seen joining and not yet seen leaving, in join order. */
	readonly participants = this._participants.asReadonly();

	/** Folds one lifecycle event into the roster; events that do not move it are ignored. */
	track(name: string, payload: unknown): void {
		switch (name) {
			case EmbeddedEventName.PARTICIPANT_JOINED:
				this.add(participantOf(payload));
				break;

			case EmbeddedEventName.PARTICIPANT_LEFT:
				this.remove(participantOf(payload));
				break;

			case EmbeddedEventName.MEETING_LEFT:
			case EmbeddedEventName.MEETING_CLOSED:
				this.clear();
				break;
		}
	}

	clear(): void {
		this._participants.set([]);
	}

	private add(participant: MeetParticipantPayload | null): void {
		if (!participant) return;

		this._participants.update((participants) => [...this.without(participants, participant), participant]);
	}

	private remove(participant: MeetParticipantPayload | null): void {
		if (!participant) return;

		this._participants.update((participants) => this.without(participants, participant));
	}

	private without(
		participants: MeetParticipantPayload[],
		participant: MeetParticipantPayload
	): MeetParticipantPayload[] {
		return participants.filter((current) => current.participantIdentity !== participant.participantIdentity);
	}
}
