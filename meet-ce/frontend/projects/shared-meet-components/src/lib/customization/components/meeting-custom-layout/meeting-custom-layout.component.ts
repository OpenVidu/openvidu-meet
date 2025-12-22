import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ILogger, LoggerService, OpenViduComponentsUiModule, PanelService, PanelType, ParticipantModel } from 'openvidu-components-angular';
import { HiddenParticipantsIndicatorComponent, ShareMeetingLinkComponent } from '../../../components';
import { CustomParticipantModel } from '../../../models';
import { MeetingContextService, MeetingService, MeetLayoutService } from '../../../services';

@Component({
	selector: 'ov-meeting-custom-layout',
	imports: [
		CommonModule,
		OpenViduComponentsUiModule,
		ShareMeetingLinkComponent,
		HiddenParticipantsIndicatorComponent
	],
	templateUrl: './meeting-custom-layout.component.html',
	styleUrl: './meeting-custom-layout.component.scss'
})
export class MeetingCustomLayoutComponent {
	private readonly logger: ILogger = inject(LoggerService).get('MeetingCustomLayoutComponent');
	protected readonly layoutService = inject(MeetLayoutService);
	protected readonly meetingContextService = inject(MeetingContextService);
	protected readonly meetingService = inject(MeetingService);
	protected readonly panelService = inject(PanelService);
	protected readonly linkOverlayConfig = {
		title: 'Start collaborating',
		subtitle: 'Share this link to bring others into the meeting',
		titleSize: 'xl' as const,
		titleWeight: 'bold' as const
	};

	protected readonly meetingUrl = computed(() => this.meetingContextService.meetingUrl());
	protected readonly remoteParticipants = computed(() => this.meetingContextService.remoteParticipants());
	protected readonly shouldShowLinkOverlay = computed(() => {
		const hasNoRemotes = this.meetingContextService.remoteParticipants().length === 0;
		return this.meetingContextService.canModerateRoom() && hasNoRemotes;
	});

	protected readonly isLayoutSwitchingAllowed = this.meetingContextService.allowLayoutSwitching;

	private displayedParticipantIds: string[] = [];
	private audioElements = new Map<string, HTMLMediaElement>();
	private proxyCache = new WeakMap<ParticipantModel, { proxy: ParticipantModel; showCamera: boolean }>();

	private _visibleRemoteParticipants = signal<ParticipantModel[]>([]);
	readonly visibleRemoteParticipants = this._visibleRemoteParticipants.asReadonly();

	protected readonly hiddenParticipantsCount = computed(() => {
		const total = this.remoteParticipants().length;
		const visible = this.visibleRemoteParticipants().length;
		return Math.max(0, total - visible);
	});

	/**
	 * Indicates whether to show the hidden participants indicator in the top bar
	 * when in smart mosaic mode.
	 */
	protected readonly showTopBarHiddenParticipantsIndicator = computed(() => {
		const localParticipant = this.meetingContextService.localParticipant()!;
		const hasPinnedParticipant =
			localParticipant.isPinned || this.remoteParticipants().some((p) => (p as CustomParticipantModel).isPinned);
		const visibleParticipantsCount = this.visibleRemoteParticipants().length;
		const showTopBar =
			!hasPinnedParticipant && visibleParticipantsCount < this.layoutService.MAX_REMOTE_SPEAKERS_LIMIT;
		return showTopBar;
	});

	constructor() {
		this.setupSpeakerTrackingEffect();
		this.setupParticipantCleanupEffect();
		this.handleAudioElementsEffect();
		this.setupVisibleParticipantsUpdate();
	}

	protected onCopyMeetingLinkClicked(): void {
		const room = this.meetingContextService.meetRoom();
		if (!room) {
			this.logger.e('Cannot copy link: meeting room is undefined');
			return;
		}
		this.meetingService.copyMeetingSpeakerLink(room);
	}

	protected isSmartMosaicActive(): boolean {
		return this.isLayoutSwitchingAllowed() && this.layoutService.isSmartMosaicEnabled();
	}

	protected toggleParticipantsPanel(): void {
		this.panelService.togglePanel(PanelType.PARTICIPANTS);
	}

	private setupVisibleParticipantsUpdate(): void {
		effect(
			() => {
				const allRemotes = this.meetingContextService.remoteParticipants();

				if (!this.isSmartMosaicActive()) {
					this._visibleRemoteParticipants.set(allRemotes);
					return;
				}

				const participantMap = new Map(allRemotes.map((p) => [p.identity, p]));
				const availableIds = new Set(participantMap.keys());
				const targetIds = this.layoutService.computeParticipantsToDisplay(availableIds);

				// Include screen sharers in the display list, even if they are not active speakers
				const screenSharerIds = allRemotes.filter((p) => p.isScreenShareEnabled).map((p) => p.identity);
				const idsToDisplay = new Set([...targetIds, ...screenSharerIds]);

				this.syncDisplayedParticipantsWithTarget(idsToDisplay, availableIds);

				const visibleParticipants = this.displayedParticipantIds
					.map((id) => participantMap.get(id))
					.filter((p): p is CustomParticipantModel => p !== undefined);

				// Return proxies that hide audio tracks to prevent ov-layout from rendering audio
				// Also hide camera tracks if the participant is displayed ONLY because of screen share (not in targetIds)
				const proxiedParticipants = visibleParticipants.map((p) => {
					const showCamera = targetIds.has(p.identity);
					return this.getOrCreateVideoOnlyProxy(p, showCamera);
				});
				this._visibleRemoteParticipants.set(proxiedParticipants);
			},
			{ allowSignalWrites: true }
		);
	}

	private getOrCreateVideoOnlyProxy(participant: ParticipantModel, showCamera: boolean): ParticipantModel {
		const cached = this.proxyCache.get(participant);
		if (cached && cached.showCamera === showCamera) {
			return cached.proxy;
		}
		const proxy = this.createVideoOnlyProxy(participant, showCamera);
		this.proxyCache.set(participant, { proxy, showCamera });
		return proxy;
	}

	/**
	 * Synchronizes the list of displayed participants with the target set of participant IDs.
	 * Ensures that only available participants are shown, replaces removed IDs with new ones
	 * when possible, and appends any remaining participants needed to match the target state.
	 * @param targetIds Set of participant IDs that should be displayed.
	 * @param availableIds Set of participant IDs that are currently available for display.
	 */

	private syncDisplayedParticipantsWithTarget(targetIds: Set<string>, availableIds: Set<string>): void {
		this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => availableIds.has(id));

		const currentDisplaySet = new Set(this.displayedParticipantIds);
		const idsToRemove = this.displayedParticipantIds.filter((id) => !targetIds.has(id));
		const idsToAdd = [...targetIds].filter((id) => !currentDisplaySet.has(id));

		// Substitute removed with added at same positions
		for (const removeId of idsToRemove) {
			const addId = idsToAdd.shift();
			if (addId) {
				const index = this.displayedParticipantIds.indexOf(removeId);
				if (index !== -1) this.displayedParticipantIds[index] = addId;
			} else {
				this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => id !== removeId);
			}
		}

		// Append remaining
		for (const addId of idsToAdd) {
			if (this.displayedParticipantIds.length < targetIds.size) {
				this.displayedParticipantIds.push(addId);
			}
		}
	}

	private setupSpeakerTrackingEffect(): void {
		effect(() => {
			const room = this.meetingContextService.lkRoom();
			if (this.isLayoutSwitchingAllowed() && room) {
				this.layoutService.initializeSpeakerTracking(room);
			}
		});
	}

	private handleAudioElementsEffect(): void {
		effect(() => {
			const participants = this.remoteParticipants();
			const isSmartMosaic = this.isSmartMosaicActive();

			// Use untracked to avoid re-running effect when we manipulate DOM or internal state
			untracked(() => {
				this.manageAudioTracks(participants, isSmartMosaic);
			});
		});
	}

	private setupParticipantCleanupEffect(): void {
		effect(() => {
			if (!this.isSmartMosaicActive()) return;

			const currentIds = new Set(this.remoteParticipants().map((p) => p.identity));
			untracked(() => this.layoutService.removeDisconnectedSpeakers(currentIds));
		});
	}

	private manageAudioTracks(participants: ParticipantModel[], isSmartMosaic: boolean) {
		if (!isSmartMosaic) {
			this.cleanupAudioElements(new Set());
			return;
		}

		const currentAudioTrackSids = new Set<string>();

		for (const p of participants) {
			// Access original audio tracks (not proxied)
			for (const t of p.audioTracks) {
				if (t.track && t.track.attach) {
					currentAudioTrackSids.add(t.trackSid);
					let audio = this.audioElements.get(t.trackSid);
					if (!audio) {
						audio = t.track.attach();
						this.audioElements.set(t.trackSid, audio);
					}
					audio.muted = p.isMutedForcibly;
				}
			}
		}

		this.cleanupAudioElements(currentAudioTrackSids);
	}

	private cleanupAudioElements(activeSids: Set<string>) {
		for (const [sid, audio] of this.audioElements) {
			if (!activeSids.has(sid)) {
				audio.pause();
				audio.srcObject = null;
				audio.remove();
				this.audioElements.delete(sid);
			}
		}
	}

	private createVideoOnlyProxy(participant: ParticipantModel, showCamera: boolean): ParticipantModel {
		return new Proxy(participant, {
			get: (target, prop, receiver) => {
				if (prop === 'tracks') {
					// Return only video tracks to hide audio from ov-layout
					// Also filter camera tracks if showCamera is false
					return target.tracks.filter((t) => {
						if (t.isAudioTrack) return false;
						if (t.isCameraTrack && !showCamera) return false;
						return true;
					});
				}
				return Reflect.get(target, prop, receiver);
			}
		});
	}
}
