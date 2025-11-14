import { Component, signal, computed, effect, inject, DestroyRef, input, untracked, Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { Participant } from 'livekit-client';
import {
	ParticipantModel,
	LoggerService,
	ParticipantService,
	OpenViduService,
	ILogger,
	OpenViduComponentsUiModule
} from 'openvidu-components-angular';
import { MeetLayoutMode } from '../../models/layout.model';
import { MeetLayoutService } from '../../services/layout.service';
import { MEETING_COMPONENTS_TOKEN, MeetingComponentsPlugins } from '../../customization';

/**
 * MeetingLayoutComponent - Intelligent layout component for scalable video conferencing
 *
 * This component implements an optimized layout system that displays only the N most recent
 * active speakers to maximize client-side performance and scalability.
 */
@Component({
	selector: 'ov-meeting-layout',
	imports: [OpenViduComponentsUiModule, NgComponentOutlet],
	templateUrl: './meeting-layout.component.html',
	styleUrl: './meeting-layout.component.scss'
})
export class MeetingLayoutComponent {
	plugins: MeetingComponentsPlugins = inject(MEETING_COMPONENTS_TOKEN, { optional: true }) || {};

	private readonly loggerSrv = inject(LoggerService);
	private readonly layoutService = inject(MeetLayoutService);
	private readonly participantService = inject(ParticipantService);
	private readonly openviduService = inject(OpenViduService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly log: ILogger = this.loggerSrv.get('MeetingLayoutComponent');

	/**
	 * Maximum number of active remote speakers to show in the layout when the last speakers layout is enabled.
	 * Higher values provide more context but may impact performance on lower-end devices.
	 * @default 4
	 */
	readonly maxRemoteSpeakers = input<number>(4);

	/**
	 * Optional component to render additional elements in the layout (e.g., share link overlay)
	 * This allows plugins to inject custom UI elements into the layout.
	 */
	readonly additionalElementsComponent = input<Type<any> | undefined>(undefined);

	/**
	 * Inputs to pass to the additional elements component
	 */
	readonly additionalElementsInputs = input<any>(undefined);

	// Reactive state with Signals
	private readonly remoteParticipants = toSignal(this.participantService.remoteParticipants$, {
		initialValue: [] as ParticipantModel[]
	});

	private readonly layoutMode = toSignal(this.layoutService.layoutMode$, {
		initialValue: MeetLayoutMode.LAST_SPEAKERS
	});

	/**
	 * Tracks the order of active speakers (most recent last)
	 * Using array instead of Map for better ordered iteration performance
	 */
	private readonly activeSpeakersOrder = signal<string[]>([]);

	/**
	 * Computed signal that determines if last speakers layout is enabled
	 */
	private readonly isLastSpeakersLayoutEnabled = computed(() => this.layoutMode() === MeetLayoutMode.LAST_SPEAKERS);

	/**
	 * Computed signal that provides the filtered list of participants to display.
	 * This is the main output used by the template.
	 * Optimized with memoization via computed()
	 */
	readonly filteredRemoteParticipants = computed(() => {
		const remoteParticipants = this.remoteParticipants();
		const isLastSpeakersMode = this.isLastSpeakersLayoutEnabled();

		if (!isLastSpeakersMode) {
			// DEFAULT layout mode: show all participants
			return remoteParticipants;
		}

		// LAST_SPEAKERS layout mode: show only active speakers
		const activeSpeakersOrder = this.activeSpeakersOrder();
		const maxSpeakers = this.maxRemoteSpeakers();

		// If no active speakers yet, initialize with first N remote participants
		if (activeSpeakersOrder.length === 0) {
			return remoteParticipants.slice(0, maxSpeakers);
		}

		// Build participants map for O(1) lookup
		const participantsMap = new Map(remoteParticipants.map((p) => [p.identity, p]));

		// Filter active speakers that still exist in remote participants
		const validActiveSpeakers = activeSpeakersOrder
			.map((identity) => participantsMap.get(identity))
			.filter((p): p is ParticipantModel => p !== undefined)
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
		// Setup active speakers listener
		this.setupActiveSpeakersListener();

		// Effect to log layout mode changes (development only)
		effect(() => {
			const mode = this.layoutMode();
			this.log.d(`Layout mode changed to: ${mode}`);
		});

		// Effect to handle active speakers cleanup when participants leave
		effect(() => {
			const remoteParticipants = this.remoteParticipants();
			const activeSpeakersOrder = this.activeSpeakersOrder();

			// Only cleanup in last speakers mode
			if (!this.isLastSpeakersLayoutEnabled()) {
				return;
			}

			// Create set of current participant identities for O(1) lookup
			const currentIdentities = new Set(remoteParticipants.map((p) => p.identity));

			// Filter out speakers who are no longer in the room
			const cleanedOrder = activeSpeakersOrder.filter((identity) => currentIdentities.has(identity));

			// Only update if something changed
			if (cleanedOrder.length !== activeSpeakersOrder.length) {
				untracked(() => {
					this.activeSpeakersOrder.set(cleanedOrder);
					this.log.d(
						`Cleaned active speakers order. Removed ${activeSpeakersOrder.length - cleanedOrder.length} participants`
					);
				});
			}
		});
	}

	/**
	 * Sets up the listener for active speakers changes from LiveKit
	 * Uses efficient Set operations and early returns for performance
	 */
	private setupActiveSpeakersListener(): void {
		const room = this.openviduService.getRoom();

		// Register cleanup on component destroy
		this.destroyRef.onDestroy(() => {
			room.off('activeSpeakersChanged', this.handleActiveSpeakersChanged);
			this.log.d('Active speakers listener cleaned up');
		});

		room.on('activeSpeakersChanged', this.handleActiveSpeakersChanged);
	}

	/**
	 * Handles active speakers changed events from LiveKit
	 * Optimized with early returns and Set operations
	 */
	private readonly handleActiveSpeakersChanged = (speakers: Participant[]): void => {
		// Early return if not in last speakers mode
		if (!this.isLastSpeakersLayoutEnabled()) {
			return;
		}

		// Filter out local participant
		const remoteSpeakers = speakers.filter((p) => !p.isLocal);

		if (remoteSpeakers.length === 0) {
			return;
		}

		// Get new speaker identities (trimmed to max)
		const maxSpeakers = this.maxRemoteSpeakers();
		const newSpeakerIdentities = remoteSpeakers.map((p) => p.identity).slice(0, maxSpeakers);

		// Early return if speakers haven't changed (optimization)
		if (this.isSameSpeakersList(newSpeakerIdentities)) {
			return;
		}

		// Update active speakers order
		this.updateActiveSpeakersOrder(newSpeakerIdentities);
	};

	/**
	 * Checks if the new speakers list is identical to the current one
	 * Optimized comparison with early returns
	 */
	private isSameSpeakersList(newIdentities: string[]): boolean {
		const currentOrder = this.activeSpeakersOrder();
		const maxSpeakers = this.maxRemoteSpeakers();

		// Get the current active speakers (last N)
		const currentActiveIdentities = currentOrder.slice(-maxSpeakers);

		// Quick length check
		if (currentActiveIdentities.length !== newIdentities.length) {
			return false;
		}

		// Compare elements in order
		return currentActiveIdentities.every((identity, index) => identity === newIdentities[index]);
	}

	/**
	 * Updates the active speakers order with new speakers
	 * Maintains order with most recent speakers at the end
	 * Uses efficient Set operations for O(1) lookups
	 */
	private updateActiveSpeakersOrder(newSpeakerIdentities: string[]): void {
		const currentOrder = this.activeSpeakersOrder();
		const newIdentitiesSet = new Set(newSpeakerIdentities);

		// Remove new speakers from current position (if they exist)
		const filteredOrder = currentOrder.filter((identity) => !newIdentitiesSet.has(identity));

		// Add new speakers to the end (most recent)
		const updatedOrder = [...filteredOrder, ...newSpeakerIdentities];

		// Trim to reasonable max size to prevent memory leaks
		// Keep 2x maxRemoteSpeakers for smooth transitions
		const maxSpeakers = this.maxRemoteSpeakers();
		const trimmedOrder = updatedOrder.slice(-(maxSpeakers * 2));

		this.activeSpeakersOrder.set(trimmedOrder);

		this.log.d(`Active speakers updated: ${trimmedOrder.length} in order`);
	}
}
