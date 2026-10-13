import { computed, inject, Service, signal } from '@angular/core';
import { MeetParticipantReactionOptions, MeetReaction } from '@openvidu-meet/typings';
import { HttpService } from '../../../shared/services/http.service';
import { LoggerService } from '../../../shared/services/logger.service';
import {
	LiveReaction,
	REACTION_COOLDOWN_MS,
	REACTION_LIFETIME_MS,
	ReactionCount
} from '../openvidu-components/models/reaction.model';
import { MeetingContextService } from './meeting-context.service';
import { MeetingStateService } from './meeting-state.service';

const PICKER_ORDER = Object.values(MeetReaction);

/**
 * The reactions on screen and the local participant's way of sending one. None is stored: each shows
 * for {@link REACTION_LIFETIME_MS} from the moment it arrives, until a newer one from the same
 * participant replaces it. The server relays every reaction to everyone in the meeting; the local
 * participant's own shows the moment it is picked instead, so it never waits for the round trip.
 */
@Service()
export class MeetingReactionsService {
	private readonly httpService = inject(HttpService);
	private readonly meetingContext = inject(MeetingContextService);
	private readonly meetingState = inject(MeetingStateService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - MeetingReactionsService');

	private readonly _live = signal<ReadonlyMap<string, LiveReaction>>(new Map());
	private readonly expiries = new Map<string, ReturnType<typeof setTimeout>>();
	/** The last pick not sent yet, which goes once the second after the previous send ends. */
	private pending?: MeetReaction;
	private sending = false;

	/** The reaction each participant has on screen, by identity. */
	readonly live = this._live.asReadonly();

	readonly localReaction = computed(() => {
		const identity = this.meetingState.localParticipant()?.identity;
		return identity === undefined ? undefined : this.live().get(identity);
	});

	/** How many participants show each reaction, most shown first and in the picker's order on a tie. */
	readonly counts = computed<ReactionCount[]>(() => {
		const counts = new Map<MeetReaction, number>();

		for (const { reaction } of this.live().values()) {
			counts.set(reaction, (counts.get(reaction) ?? 0) + 1);
		}

		return PICKER_ORDER.filter((reaction) => counts.has(reaction))
			.map((reaction) => ({ reaction, count: counts.get(reaction)! }))
			.sort((a, b) => b.count - a.count);
	});

	/**
	 * Shows a reaction of the local participant at once and sends it. At most one goes to the server
	 * every {@link REACTION_COOLDOWN_MS}: the picks made in between replace each other on screen, and
	 * only the last is sent, when that time ends. A reaction the server rejects leaves the screen.
	 */
	send(reaction: MeetReaction): void {
		const roomId = this.meetingContext.roomId();
		const identity = this.meetingState.localParticipant()?.identity;

		if (!roomId) return;

		if (identity !== undefined) this.show(identity, reaction);

		this.pending = reaction;

		if (!this.sending) void this.sendPending(roomId, identity);
	}

	/** Shows a reaction the server relayed. The local participant's own is already on screen since its pick. */
	receive(participantIdentity: string, reaction: MeetReaction): void {
		if (participantIdentity === this.meetingState.localParticipant()?.identity) return;

		this.show(participantIdentity, reaction);
	}

	/** Shows a participant's reaction, replacing the one they had on screen. */
	private show(participantIdentity: string, reaction: MeetReaction): void {
		clearTimeout(this.expiries.get(participantIdentity));
		this.expiries.set(
			participantIdentity,
			setTimeout(() => this.forget(participantIdentity), REACTION_LIFETIME_MS)
		);
		this._live.update((live) => new Map(live).set(participantIdentity, { reaction, shownAt: Date.now() }));
	}

	/** Takes a participant's reaction off screen before its time, as when they leave. */
	forget(participantIdentity: string): void {
		clearTimeout(this.expiries.get(participantIdentity));
		this.expiries.delete(participantIdentity);

		if (!this.live().has(participantIdentity)) return;

		this._live.update((live) => {
			const remaining = new Map(live);
			remaining.delete(participantIdentity);
			return remaining;
		});
	}

	clear(): void {
		for (const expiry of this.expiries.values()) {
			clearTimeout(expiry);
		}

		this.expiries.clear();
		this.pending = undefined;
		this._live.set(new Map());
	}

	private async sendPending(roomId: string, identity: string | undefined): Promise<void> {
		this.sending = true;

		try {
			while (this.pending) {
				const next = this.pending;
				this.pending = undefined;
				await Promise.all([this.deliver(roomId, identity, next), delay(REACTION_COOLDOWN_MS)]);
			}
		} finally {
			this.sending = false;
		}
	}

	private async deliver(roomId: string, identity: string | undefined, reaction: MeetReaction): Promise<void> {
		try {
			const body: MeetParticipantReactionOptions = { reaction };
			await this.httpService.postRequest(
				`${HttpService.INTERNAL_API_PATH_PREFIX}/meetings/${roomId}/reactions`,
				body
			);
		} catch (error) {
			this.log.e('Error sending a reaction:', error);

			if (identity !== undefined && this.live().get(identity)?.reaction === reaction) this.forget(identity);
		}
	}
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
