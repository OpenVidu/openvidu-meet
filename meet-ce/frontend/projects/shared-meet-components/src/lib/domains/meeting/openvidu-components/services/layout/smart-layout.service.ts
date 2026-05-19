import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { SmartLayoutMode } from '../../models/layout/smart-layout.model';
import { Participant } from '../../services/livekit-adapter';
import { LoggerService } from '../logger/logger.service';
import { SessionRoomEventsService } from '../session/session-room-events.service';
import { ViewportService } from '../viewport/viewport.service';
import { LayoutService } from './layout.service';

@Injectable({
	providedIn: 'root'
})
export class SmartLayoutService extends LayoutService {
	private readonly loggerService = inject(LoggerService);
	private readonly sessionRoomEventsService = inject(SessionRoomEventsService);
	private readonly viewportService = inject(ViewportService);
	private readonly INITIAL_VISIBLE_PARTICIPANTS_COUNT = 4;
	readonly MIN_VISIBLE_REMOTE_PARTICIPANTS = 1;
	readonly MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT = 6;

	/**
	 * Minimum audio level threshold (0-1) to consider a participant as actively speaking.
	 */
	private readonly AUDIO_LEVEL_THRESHOLD = 0.1;

	/**
	 * Minimum duration in milliseconds that a participant must be speaking
	 * before being considered for display in the smart layout.
	 */
	private readonly MIN_SPEAKING_DURATION_MS = 2000;

	/**
	 * Grace period in milliseconds to keep tracking a speaker after they stop.
	 */
	private readonly SPEAKING_GRACE_PERIOD_MS = 3000;

	private readonly _layoutMode = signal<SmartLayoutMode>(SmartLayoutMode.SMART_MOSAIC);
	readonly layoutMode = this._layoutMode.asReadonly();

	private readonly _maxVisibleRemoteParticipants = signal<number>(this.INITIAL_VISIBLE_PARTICIPANTS_COUNT);
	readonly maxVisibleRemoteParticipants = this._maxVisibleRemoteParticipants.asReadonly();

	readonly isSmartLayoutEnabled = computed(() => this._layoutMode() === SmartLayoutMode.SMART_MOSAIC);

	/**
	 * Ordered list of participant IDs based on their speaking priority.
	 */
	private readonly _speakerPriorityOrder = signal<string[]>([]);
	readonly speakerPriorityOrder = this._speakerPriorityOrder.asReadonly();

	private speakingStartTimes = new Map<string, number>();
	private speakingStopTimes = new Map<string, number>();

	private readonly smartLayoutUpdateEffect = effect(() => {
		if (this.isSmartLayoutEnabled()) {
			this.update();
		}
	});

	private readonly activeSpeakersTrackingEffect = effect(() => {
		if (!this.isSmartLayoutEnabled()) return;

		const speakers = this.sessionRoomEventsService.activeSpeakers();
		untracked(() => this.processActiveSpeakersChanged(speakers));
	});

	constructor() {
		super();
		this.log = this.loggerService.get('SmartLayoutService');

		const viewportInfo = this.viewportService.viewportInfo();
		const isMobileOrTablet = viewportInfo.isPhysicalMobile || viewportInfo.isPhysicalTablet;
		if (isMobileOrTablet) this._maxVisibleRemoteParticipants.set(2);
	}

	setLayoutMode(mode: SmartLayoutMode): void {
		if (!Object.values(SmartLayoutMode).includes(mode)) {
			this.log.w(`Invalid layout mode: ${mode}`);
			return;
		}

		if (this._layoutMode() === mode) return;

		this._layoutMode.set(mode);
		this.update();
	}

	setMaxVisibleRemoteParticipants(count: number): void {
		if (count < this.MIN_VISIBLE_REMOTE_PARTICIPANTS || count > this.MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT) {
			this.log.w(
				`Invalid participant count: ${count}. Range: ${this.MIN_VISIBLE_REMOTE_PARTICIPANTS}-${this.MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT}`
			);
			return;
		}

		if (this._maxVisibleRemoteParticipants() === count) return;

		this._maxVisibleRemoteParticipants.set(count);
		if (this.isSmartLayoutEnabled()) this.update();
	}

	resetSpeakerTrackingState(): void {
		this._speakerPriorityOrder.set([]);
		this.speakingStartTimes.clear();
		this.speakingStopTimes.clear();
	}

	removeDisconnectedSpeakers(connectedParticipantIds: Set<string>): void {
		const currentOrder = this._speakerPriorityOrder();
		const filteredOrder = currentOrder.filter((id) => connectedParticipantIds.has(id));

		if (filteredOrder.length !== currentOrder.length) {
			this._speakerPriorityOrder.set(filteredOrder);
		}

		for (const id of [...this.speakingStartTimes.keys()]) {
			if (!connectedParticipantIds.has(id)) {
				this.speakingStartTimes.delete(id);
			}
		}

		for (const id of [...this.speakingStopTimes.keys()]) {
			if (!connectedParticipantIds.has(id)) {
				this.speakingStopTimes.delete(id);
			}
		}
	}

	computeParticipantsToDisplay(availableIds: Set<string>): Set<string> {
		const maxCount = this._maxVisibleRemoteParticipants();
		const speakerOrder = this._speakerPriorityOrder();

		const recentSpeakers = speakerOrder.filter((id) => availableIds.has(id)).slice(0, maxCount);

		if (recentSpeakers.length >= maxCount) {
			return new Set(recentSpeakers);
		}

		const recentSpeakerSet = new Set(recentSpeakers);
		const fillersNeeded = maxCount - recentSpeakers.length;
		const fillers = [...availableIds].filter((id) => !recentSpeakerSet.has(id)).slice(0, fillersNeeded);

		return new Set([...recentSpeakers, ...fillers]);
	}

	private processActiveSpeakersChanged(speakers: Participant[]): void {
		if (!this.isSmartLayoutEnabled()) return;

		const now = Date.now();
		const loudSpeakers = speakers.filter((participant) => !participant.isLocal && participant.audioLevel >= this.AUDIO_LEVEL_THRESHOLD);
		const loudSpeakerIds = new Set(loudSpeakers.map((participant) => participant.identity));

		this.updateSpeakerActivityTimers(loudSpeakerIds, now);

		const activeForLayoutIds: string[] = [];
		for (const [id, startTime] of this.speakingStartTimes) {
			const isLoud = loudSpeakerIds.has(id);
			const stopTime = this.speakingStopTimes.get(id);
			const endTime = isLoud ? now : stopTime || now;
			const duration = endTime - startTime;

			if (duration >= this.MIN_SPEAKING_DURATION_MS) {
				activeForLayoutIds.push(id);
			}
		}

		this.updateSpeakerPriority(activeForLayoutIds);
	}

	private updateSpeakerActivityTimers(currentLoudSpeakerIds: Set<string>, now: number): void {
		for (const id of currentLoudSpeakerIds) {
			this.speakingStopTimes.delete(id);

			if (!this.speakingStartTimes.has(id)) {
				this.speakingStartTimes.set(id, now);
			}
		}

		for (const id of this.speakingStartTimes.keys()) {
			if (!currentLoudSpeakerIds.has(id)) {
				if (!this.speakingStopTimes.has(id)) {
					this.speakingStopTimes.set(id, now);
				}

				const stopTime = this.speakingStopTimes.get(id);
				if (stopTime && now - stopTime >= this.SPEAKING_GRACE_PERIOD_MS) {
					this.speakingStartTimes.delete(id);
					this.speakingStopTimes.delete(id);
				}
			}
		}
	}

	private updateSpeakerPriority(activeSpeakerIds: string[]): void {
		const currentOrder = this._speakerPriorityOrder();
		const activeSet = new Set(activeSpeakerIds);

		const existingActive = currentOrder.filter((id) => activeSet.has(id));
		const newActive = activeSpeakerIds.filter((id) => !currentOrder.includes(id));
		const inactive = currentOrder.filter((id) => !activeSet.has(id));

		const newOrder = [...existingActive, ...newActive, ...inactive];
		const maxHistorySize = this._maxVisibleRemoteParticipants() * 2;
		this._speakerPriorityOrder.set(newOrder.slice(0, maxHistorySize));
	}
}