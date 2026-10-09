import { computed, inject, Service } from '@angular/core';
import { LoggerService } from '../../../shared/services/logger.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingModerationService } from './meeting-moderation.service';
import { MeetingStateService } from './meeting-state.service';

/**
 * The local participant's side of the raise hand feature: their own hand, and the hands a holder of
 * `participantHandLower` may lower. No state is kept here: the server writes it into each participant's LiveKit
 * attributes, which every client renders from.
 */
@Service()
export class MeetingHandService {
	private readonly meetingContext = inject(MeetingContextService);
	private readonly meetingState = inject(MeetingStateService);
	private readonly meetingModerationService = inject(MeetingModerationService);
	private readonly log = inject(LoggerService).get('OpenVidu Meet - MeetingHandService');

	/** Whether the local participant's hand is raised. */
	readonly localHandRaised = computed(() => this.meetingState.localParticipant()?.isHandRaised ?? false);

	/** Whether `participantIdentity` names the local participant; naming nobody means the same. */
	isOwn(participantIdentity?: string): boolean {
		return !participantIdentity || participantIdentity === this.meetingState.localParticipant()?.identity;
	}

	async toggle(): Promise<void> {
		await (this.localHandRaised() ? this.lower() : this.raise());
	}

	async raise(): Promise<void> {
		await this.update(undefined, true);
	}

	/**
	 * Lowers the local participant's hand, or another participant's when given.
	 */
	async lower(participantIdentity?: string): Promise<void> {
		await this.update(participantIdentity, false);
	}

	async lowerAll(): Promise<void> {
		const roomId = this.meetingContext.roomId();

		if (!roomId) {
			this.log.w('Cannot lower every hand outside a meeting');
			return;
		}

		await this.meetingModerationService.lowerAllHands(roomId);
	}

	private async update(participantIdentity: string | undefined, raised: boolean): Promise<void> {
		const roomId = this.meetingContext.roomId();
		const identity = participantIdentity ?? this.meetingState.localParticipant()?.identity;

		if (!roomId || !identity) {
			this.log.w('Cannot update a hand outside a meeting');
			return;
		}

		await this.meetingModerationService.updateParticipantHand(roomId, identity, raised);
	}
}
