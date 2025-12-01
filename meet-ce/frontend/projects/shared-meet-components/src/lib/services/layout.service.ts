import { Injectable, signal, computed, effect, DestroyRef, inject } from '@angular/core';
import { Room, Participant } from 'livekit-client';
import { LayoutService, LoggerService, ViewportService } from 'openvidu-components-angular';
import { MeetLayoutMode } from '../models/layout.model';
import { MeetStorageService } from './storage.service';

@Injectable({ providedIn: 'root' })
export class MeetLayoutService extends LayoutService {
	private readonly destroyRef = inject(DestroyRef);

	private readonly DEFAULT_MAX_SPEAKERS = 4;
	private readonly DEFAULT_LAYOUT_MODE = MeetLayoutMode.MOSAIC;

	readonly MIN_REMOTE_SPEAKERS = 1;
	readonly MAX_REMOTE_SPEAKERS_LIMIT = 6;

	private readonly _layoutMode = signal<MeetLayoutMode>(MeetLayoutMode.MOSAIC);
	readonly layoutMode = this._layoutMode.asReadonly();

	private readonly _maxRemoteSpeakers = signal<number>(this.DEFAULT_MAX_SPEAKERS);
	readonly maxRemoteSpeakers = this._maxRemoteSpeakers.asReadonly();

	readonly isSmartMosaicEnabled = computed(() => this._layoutMode() === MeetLayoutMode.SMART_MOSAIC);

	private readonly _speakerRecencyOrder = signal<string[]>([]);
	readonly speakerRecencyOrder = this._speakerRecencyOrder.asReadonly();

	private currentRoom: Room | null = null;
	private isSpeakerTrackingActive = false;

	constructor(
		protected loggerService: LoggerService,
		protected viewPortService: ViewportService,
		private storageService: MeetStorageService
	) {
		super(loggerService, viewPortService);
		this.log = this.loggerService.get('MeetLayoutService');

		this.loadLayoutModeFromStorage();
		this.loadMaxSpeakersFromStorage();
		this.setupStoragePersistence();
	}

	private loadLayoutModeFromStorage(): void {
		const storedMode = this.storageService.getLayoutMode();
		const isValidMode = storedMode && Object.values(MeetLayoutMode).includes(storedMode);
		this._layoutMode.set(isValidMode ? storedMode : this.DEFAULT_LAYOUT_MODE);
	}

	private loadMaxSpeakersFromStorage(): void {
		const storedCount = this.storageService.getMaxRemoteSpeakers();
		const isValidCount =
			storedCount && storedCount >= this.MIN_REMOTE_SPEAKERS && storedCount <= this.MAX_REMOTE_SPEAKERS_LIMIT;
		this._maxRemoteSpeakers.set(isValidCount ? storedCount : this.DEFAULT_MAX_SPEAKERS);
	}

	private setupStoragePersistence(): void {
		effect(() => this.storageService.setLayoutMode(this._layoutMode()));
		effect(() => this.storageService.setMaxRemoteSpeakers(this._maxRemoteSpeakers()));
	}

	setLayoutMode(mode: MeetLayoutMode): void {
		if (!Object.values(MeetLayoutMode).includes(mode)) {
			this.log.w(`Invalid layout mode: ${mode}`);
			return;
		}
		if (this._layoutMode() === mode) return;

		this._layoutMode.set(mode);
		this.update();
	}

	setMaxRemoteSpeakers(count: number): void {
		if (count < this.MIN_REMOTE_SPEAKERS || count > this.MAX_REMOTE_SPEAKERS_LIMIT) {
			this.log.w(
				`Invalid speaker count: ${count}. Range: ${this.MIN_REMOTE_SPEAKERS}-${this.MAX_REMOTE_SPEAKERS_LIMIT}`
			);
			return;
		}
		if (this._maxRemoteSpeakers() === count) return;

		this._maxRemoteSpeakers.set(count);
		if (this.isSmartMosaicEnabled()) this.update();
	}

	initializeSpeakerTracking(room: Room): void {
		if (this.isSpeakerTrackingActive) return;

		this.currentRoom = room;
		this.isSpeakerTrackingActive = true;
		room.on('activeSpeakersChanged', this.handleActiveSpeakersChanged);

		this.destroyRef.onDestroy(() => this.cleanupSpeakerTracking());
	}

	cleanupSpeakerTracking(): void {
		this.currentRoom?.off('activeSpeakersChanged', this.handleActiveSpeakersChanged);
		this.currentRoom = null;
		this._speakerRecencyOrder.set([]);
		this.isSpeakerTrackingActive = false;
	}

	/**
	 * Removes participant IDs from the speaker recency order that are not in the set of connected participants.
	 * @param connectedParticipantIds Set of participant IDs that are currently connected.
	 */
	removeDisconnectedSpeakers(connectedParticipantIds: Set<string>): void {
		const currentOrder = this._speakerRecencyOrder();
		const filteredOrder = currentOrder.filter((id) => connectedParticipantIds.has(id));

		if (filteredOrder.length !== currentOrder.length) {
			this._speakerRecencyOrder.set(filteredOrder);
		}
	}

	/**
	 * Determines the set of participant IDs to display by prioritizing the most
	 * recent speakers and filling remaining slots with other available participants.
	 * Ensures the result does not exceed the maximum number of remote speakers.
	 * @param availableIds Set of participant IDs currently available for selection.
	 * @returns Set of participant IDs selected for display.
	 */
	computeParticipantsToDisplay(availableIds: Set<string>): Set<string> {
		const maxCount = this._maxRemoteSpeakers();
		const speakerOrder = this._speakerRecencyOrder();

		const recentSpeakers = speakerOrder.filter((id) => availableIds.has(id)).slice(-maxCount);

		if (recentSpeakers.length >= maxCount) {
			return new Set(recentSpeakers);
		}

		const recentSpeakerSet = new Set(recentSpeakers);
		const fillersNeeded = maxCount - recentSpeakers.length;
		const fillers = [...availableIds].filter((id) => !recentSpeakerSet.has(id)).slice(0, fillersNeeded);

		return new Set([...recentSpeakers, ...fillers]);
	}

	private readonly handleActiveSpeakersChanged = (speakers: Participant[]): void => {
		if (!this.isSmartMosaicEnabled()) return;

		const remoteSpeakerIds = speakers.filter((p) => !p.isLocal).map((p) => p.identity);
		if (remoteSpeakerIds.length > 0) {
			this.updateSpeakerRecency(remoteSpeakerIds);
		}
	};

	private updateSpeakerRecency(newSpeakerIds: string[]): void {
		const newSpeakerSet = new Set(newSpeakerIds);
		const currentOrder = this._speakerRecencyOrder();

		const withoutNewSpeakers = currentOrder.filter((id) => !newSpeakerSet.has(id));
		const updatedOrder = [...withoutNewSpeakers, ...newSpeakerIds];

		const maxHistorySize = this._maxRemoteSpeakers() * 2;
		this._speakerRecencyOrder.set(updatedOrder.slice(-maxHistorySize));
	}
}
