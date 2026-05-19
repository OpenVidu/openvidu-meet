import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, contentChildren, effect, inject, input, OnDestroy, output, signal, untracked } from '@angular/core';
import { LayoutRemoteParticipantsDirective } from '../../directives/api/internals.directive';
import { LayoutAdditionalElementsDirective } from '../../directives/template/internals.directive';
import { ParticipantModel } from '../../models/participant.model';
import { ParticipantService } from '../../services/participant/participant.service';
import { LayoutComponent } from '../layout/layout.component';
import { StreamComponent } from '../stream/stream.component';
import { Track } from '../../services/livekit-adapter';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { HiddenParticipantsIndicatorComponent } from '../hidden-participants-indicator/hidden-participants-indicator.component';

@Component({
	selector: 'ov-smart-layout',
	imports: [
		NgTemplateOutlet,
		LayoutComponent,
		LayoutRemoteParticipantsDirective,
		LayoutAdditionalElementsDirective,
		StreamComponent,
		HiddenParticipantsIndicatorComponent
	],
	templateUrl: './smart-layout.component.html',
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class SmartLayoutComponent implements OnDestroy {
	readonly layoutService = inject(SmartLayoutService);
	private readonly participantService = inject(ParticipantService);

	/** Collects *ovLayoutAdditionalElements directives projected from the parent into this component */
	readonly projectedAdditionalElements = contentChildren(LayoutAdditionalElementsDirective);

	readonly remoteParticipantsInput = input<ParticipantModel[] | undefined>(undefined, { alias: 'remoteParticipants' });
	readonly smartLayoutEnabled = input(true);
	readonly showHiddenParticipantsIndicator = input(true);
	readonly hiddenParticipantsIndicatorClicked = output<void>();
	readonly remoteParticipants = computed(() => this.remoteParticipantsInput() ?? this.participantService.remoteParticipants());
	readonly localParticipant = this.participantService.localParticipant;

	readonly isSmartLayoutActive = computed(() => this.smartLayoutEnabled() && this.layoutService.isSmartLayoutEnabled());

	private readonly _visibleRemoteParticipants = signal<ParticipantModel[]>([]);
	readonly visibleRemoteParticipants = this._visibleRemoteParticipants.asReadonly();

	readonly hiddenParticipantsCount = computed(() => {
		const total = this.remoteParticipants().length;
		const visible = this.visibleRemoteParticipants().length;
		return Math.max(0, total - visible);
	});

	readonly hiddenParticipantNames = computed(() => {
		const visibleIds = new Set(this.visibleRemoteParticipants().map((participant) => participant.identity));
		return this.remoteParticipants()
			.filter((participant) => !visibleIds.has(participant.identity))
			.map((participant) => participant.name || 'Unknown');
	});

	readonly shouldShowHiddenParticipantsIndicator = computed(
		() => this.showHiddenParticipantsIndicator() && this.isSmartLayoutActive() && this.hiddenParticipantsCount() > 0
	);

	readonly showTopBarHiddenParticipantsIndicator = computed(() => {
		const hasPinnedParticipant =
			!!this.localParticipant()?.isPinned || this.remoteParticipants().some((participant) => participant.isPinned);
		const visibleParticipantsCount = this.visibleRemoteParticipants().length;
		return !hasPinnedParticipant && visibleParticipantsCount < this.layoutService.MAX_VISIBLE_REMOTE_PARTICIPANTS_LIMIT;
	});

	private displayedParticipantIds: string[] = [];
	private audioElements = new Map<string, HTMLMediaElement>();
	private proxyCache = new WeakMap<ParticipantModel, { proxy: ParticipantModel; showCamera: boolean }>();

	private readonly visibleParticipantsEffect = effect(() => {
		const allRemotes = this.remoteParticipants();

		if (!this.isSmartLayoutActive()) {
			this._visibleRemoteParticipants.set(allRemotes);
			return;
		}

		const participantMap = new Map(allRemotes.map((participant) => [participant.identity, participant]));
		const availableIds = new Set(participantMap.keys());
		const targetIds = this.layoutService.computeParticipantsToDisplay(availableIds);

		const screenSharerIds = allRemotes
			.filter((participant) => participant.isScreenShareEnabled)
			.map((participant) => participant.identity);
		const idsToDisplay = new Set([...targetIds, ...screenSharerIds]);

		this.syncDisplayedParticipantsWithTarget(idsToDisplay, availableIds);

		const visibleParticipants = this.displayedParticipantIds
			.map((id) => participantMap.get(id))
			.filter((participant): participant is ParticipantModel => participant !== undefined);

		const proxiedParticipants = visibleParticipants.map((participant) => {
			const showCamera = targetIds.has(participant.identity);
			return this.getOrCreateVideoOnlyProxy(participant, showCamera);
		});

		this._visibleRemoteParticipants.set(proxiedParticipants);
	});

	private readonly smartLayoutResetEffect = effect(() => {
		if (this.isSmartLayoutActive()) return;

		untracked(() => this.layoutService.resetSpeakerTrackingState());
	});

	private readonly audioElementsEffect = effect(() => {
		const participants = this.remoteParticipants();
		const isSmartLayout = this.isSmartLayoutActive();

		untracked(() => {
			this.manageAudioTracks(participants, isSmartLayout);
		});
	});

	private readonly participantCleanupEffect = effect(() => {
		if (!this.isSmartLayoutActive()) return;

		const currentIds = new Set(this.remoteParticipants().map((participant) => participant.identity));
		untracked(() => this.layoutService.removeDisconnectedSpeakers(currentIds));
	});

	ngOnDestroy(): void {
		this.cleanupAudioElements(new Set());
		this.layoutService.resetSpeakerTrackingState();
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

	private syncDisplayedParticipantsWithTarget(targetIds: Set<string>, availableIds: Set<string>): void {
		this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => availableIds.has(id));

		const currentDisplaySet = new Set(this.displayedParticipantIds);
		const idsToRemove = this.displayedParticipantIds.filter((id) => !targetIds.has(id));
		const idsToAdd = [...targetIds].filter((id) => !currentDisplaySet.has(id));

		for (const removeId of idsToRemove) {
			const addId = idsToAdd.shift();
			if (addId) {
				const index = this.displayedParticipantIds.indexOf(removeId);
				if (index !== -1) this.displayedParticipantIds[index] = addId;
			} else {
				this.displayedParticipantIds = this.displayedParticipantIds.filter((id) => id !== removeId);
			}
		}

		for (const addId of idsToAdd) {
			if (this.displayedParticipantIds.length < targetIds.size) {
				this.displayedParticipantIds.push(addId);
			}
		}
	}

	private manageAudioTracks(participants: ParticipantModel[], isSmartLayout: boolean): void {
		if (!isSmartLayout) {
			this.cleanupAudioElements(new Set());
			return;
		}

		const currentAudioTrackSids = new Set<string>();

		for (const participant of participants) {
			for (const stream of participant.streams()) {
				const audioTrack = stream.audioTrack;
				if (audioTrack?.track && audioTrack.track.attach) {
					currentAudioTrackSids.add(audioTrack.trackSid);
					let audio = this.audioElements.get(audioTrack.trackSid);
					if (!audio) {
						audio = audioTrack.track.attach();
						this.audioElements.set(audioTrack.trackSid, audio);
					}
					audio.muted = participant.isMutedForcibly;
				}
			}
		}

		this.cleanupAudioElements(currentAudioTrackSids);
	}

	private cleanupAudioElements(activeSids: Set<string>): void {
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
					return target.tracks.filter((track) => {
						if (track.kind === Track.Kind.Audio) return false;
						if (track.source === Track.Source.Camera && !showCamera) return false;
						return true;
					});
				}

				return Reflect.get(target, prop, receiver);
			}
		});
	}
}