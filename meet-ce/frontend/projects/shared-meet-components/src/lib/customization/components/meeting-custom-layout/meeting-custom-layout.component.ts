import { Component, signal, computed, effect, inject, DestroyRef, input, untracked } from '@angular/core';
import { Participant } from 'livekit-client';
import { LoggerService, OpenViduService, ILogger, OpenViduComponentsUiModule } from 'openvidu-components-angular';
import { MeetLayoutMode } from '../../../models/layout.model';
import { CustomParticipantModel } from '../../../models';
import { MeetLayoutService } from '../../../services/layout.service';
import { MeetingContextService } from '../../../services/meeting/meeting-context.service';
import { ShareMeetingLinkComponent } from '../../../components/share-meeting-link/share-meeting-link.component';
import { MeetingService } from '../../../services/meeting/meeting.service';

/**
 * MeetingLayoutComponent - Intelligent layout component for scalable video conferencing
 *
 * This component implements an optimized layout system that displays only the N most recent
 * active speakers to maximize client-side performance and scalability.
 */
@Component({
	selector: 'ov-meeting-custom-layout',
	imports: [OpenViduComponentsUiModule, ShareMeetingLinkComponent],
	templateUrl: './meeting-custom-layout.component.html',
	styleUrl: './meeting-custom-layout.component.scss'
})
export class MeetingCustomLayoutComponent {
	private readonly loggerSrv = inject(LoggerService);
	protected readonly layoutService = inject(MeetLayoutService);
	protected readonly openviduService = inject(OpenViduService);
	protected meetingContextService = inject(MeetingContextService);
	protected meetingService = inject(MeetingService);
	protected readonly destroyRef = inject(DestroyRef);
	private readonly log: ILogger = this.loggerSrv.get('MeetingCustomLayoutComponent');
	protected readonly linkOverlayTitle = 'Start collaborating';
	protected readonly linkOverlaySubtitle = 'Share this link to bring others into the meeting';
	protected readonly linkOverlayTitleSize: 'sm' | 'md' | 'lg' | 'xl' = 'xl';
	protected readonly linkOverlayTitleWeight: 'normal' | 'bold' = 'bold';

	protected readonly meetingUrl = computed(() => this.meetingContextService.meetingUrl());

	protected readonly showMeetingLinkOverlay = computed(() => {
		const remoteParticipants = this.meetingContextService.remoteParticipants();
		return this.meetingContextService.canModerateRoom() && remoteParticipants.length === 0;
	});

	/**
	 * Whether the layout selector feature is enabled
	 */
	protected readonly showLayoutSelector = this.meetingContextService.showLayoutSelector;

	/**
	 * Tracks the order of active speakers (most recent last)
	 */
	private readonly activeSpeakersOrder = signal<string[]>([]);

	/**
	 * Computed signal that provides the filtered list of participants to display.
	 * Automatically reacts to changes in layout service configuration.
	 * When showLayoutSelector is false, returns all remote participants (default behavior).
	 */
	readonly filteredRemoteParticipants = computed(() => {
		const remoteParticipants = this.meetingContextService.remoteParticipants();

		// If layout selector is disabled, use default behavior (show all participants)
		if (!this.showLayoutSelector()) {
			return remoteParticipants;
		}

		const isLastSpeakersMode = this.layoutService.isSmartMosaicEnabled();

		if (!isLastSpeakersMode) {
			// MOSAIC layout mode: show all participants
			return remoteParticipants;
		}

		// SMART_MOSAIC layout mode: show only active speakers
		const activeSpeakersOrder = this.activeSpeakersOrder();
		const maxSpeakers = this.layoutService.maxRemoteSpeakers();

		// If no active speakers yet, initialize with first N remote participants
		if (activeSpeakersOrder.length === 0) {
			return remoteParticipants.slice(0, maxSpeakers);
		}

		// Build participants map for O(1) lookup
		const participantsMap = new Map(remoteParticipants.map((p) => [p.identity, p]));

		// Filter active speakers that still exist in remote participants
		const validActiveSpeakers = activeSpeakersOrder
			.map((identity) => participantsMap.get(identity))
			.filter((p): p is CustomParticipantModel => p !== undefined)
			.slice(-maxSpeakers); // Take last N speakers (most recent)

		// If we have fewer active speakers than max, fill with additional participants
		if (validActiveSpeakers.length < maxSpeakers) {
			const activeSpeakerIdentities = new Set(validActiveSpeakers.map((p) => p.identity));
			const additionalParticipants = remoteParticipants
				.filter((p) => !activeSpeakerIdentities.has(p.identity))
				.slice(0, maxSpeakers - validActiveSpeakers.length);

			return [...validActiveSpeakers, ...additionalParticipants];
		}

		return validActiveSpeakers;
	});

	constructor() {
		effect(() => {
			// Only setup active speakers if layout selector is enabled
			if (this.showLayoutSelector() && this.meetingContextService.lkRoom()) {
				this.setupActiveSpeakersListener();
			}
		});

		// Effect to handle active speakers cleanup when participants leave
		effect(() => {
			// Skip if layout selector is disabled
			if (!this.showLayoutSelector()) return;
			if (!this.layoutService.isSmartMosaicEnabled()) return;

			const remoteParticipants = this.meetingContextService.remoteParticipants();
			const activeSpeakersOrder = this.activeSpeakersOrder();
			const currentIdentities = new Set(remoteParticipants.map((p) => p.identity));
			const cleanedOrder = activeSpeakersOrder.filter((identity) => currentIdentities.has(identity));

			if (cleanedOrder.length !== activeSpeakersOrder.length) {
				untracked(() => this.activeSpeakersOrder.set(cleanedOrder));
			}
		});
	}

	protected onCopyMeetingLinkClicked(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.log.e('Cannot copy link: meeting room is undefined');
			return;
		}

		this.meetingService.copyMeetingSpeakerLink(room);
	}

	/**
	 * Sets up the listener for active speakers changes from LiveKit
	 * Uses efficient Set operations and early returns for performance
	 */
	private setupActiveSpeakersListener(): void {
		const room = this.openviduService.getRoom();
		if (!room) {
			this.log.e('Cannot setup active speakers listener: room is undefined');
			return;
		}

		// Register cleanup on component destroy
		this.destroyRef.onDestroy(() => {
			room.off('activeSpeakersChanged', this.handleActiveSpeakersChanged);
		});

		room.on('activeSpeakersChanged', this.handleActiveSpeakersChanged);
	}

	/**
	 * Handles active speakers changed events from LiveKit
	 */
	private readonly handleActiveSpeakersChanged = (speakers: Participant[]): void => {
		if (!this.layoutService.isSmartMosaicEnabled()) return;

		const remoteSpeakers = speakers.filter((p) => !p.isLocal);
		if (remoteSpeakers.length === 0) return;

		const maxSpeakers = this.layoutService.maxRemoteSpeakers();
		const newSpeakerIdentities = remoteSpeakers.map((p) => p.identity).slice(0, maxSpeakers);

		if (this.isSameSpeakersList(newSpeakerIdentities)) return;

		this.updateActiveSpeakersOrder(newSpeakerIdentities);
	};

	/**
	 * Checks if the new speakers list is identical to the current one
	 */
	private isSameSpeakersList(newIdentities: string[]): boolean {
		const currentOrder = this.activeSpeakersOrder();
		const maxSpeakers = this.layoutService.maxRemoteSpeakers();
		const currentActiveIdentities = currentOrder.slice(-maxSpeakers);

		return (
			currentActiveIdentities.length === newIdentities.length &&
			currentActiveIdentities.every((identity, index) => identity === newIdentities[index])
		);
	}

	/**
	 * Updates the active speakers order with new speakers
	 */
	private updateActiveSpeakersOrder(newSpeakerIdentities: string[]): void {
		const currentOrder = this.activeSpeakersOrder();
		const newIdentitiesSet = new Set(newSpeakerIdentities);
		const filteredOrder = currentOrder.filter((identity) => !newIdentitiesSet.has(identity));
		const updatedOrder = [...filteredOrder, ...newSpeakerIdentities];
		const maxSpeakers = this.layoutService.maxRemoteSpeakers();
		const trimmedOrder = updatedOrder.slice(-(maxSpeakers * 2));

		this.activeSpeakersOrder.set(trimmedOrder);
	}
}
