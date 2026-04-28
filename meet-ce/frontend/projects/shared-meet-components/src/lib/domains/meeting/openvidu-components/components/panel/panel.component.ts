import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	contentChild,
	effect,
	inject,
	OnInit,
	output,
	TemplateRef
} from '@angular/core';
import {
	ActivitiesPanelDirective,
	AdditionalPanelsDirective,
	ChatPanelDirective,
	ParticipantsPanelDirective
} from '../../directives/template/openvidu-components-angular.directive';
import {
	ActivitiesPanelStatusEvent,
	ChatPanelStatusEvent,
	PanelStatusInfo,
	PanelType,
	ParticipantsPanelStatusEvent,
	SettingsPanelStatusEvent
} from '../../models/panel.model';
import { PanelService } from '../../services/panel/panel.service';

/**
 *
 * The **PanelComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the videoconference panels providing functionalities to the videoconference app
 * such as the chat ({@link ChatPanelComponent}) and list of participants ({@link ParticipantsPanelComponent})
 */

@Component({
	selector: 'ov-panel',
	imports: [CommonModule],
	templateUrl: './panel.component.html',
	styleUrls: ['./panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true
})
export class PanelComponent implements OnInit {
	/**
	 * @ignore
	 */
	readonly participantsPanelTemplate = contentChild('participantsPanel', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly backgroundEffectsPanelTemplate = contentChild('backgroundEffectsPanel', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly settingsPanelTemplate = contentChild('settingsPanel', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly activitiesPanelTemplate = contentChild('activitiesPanel', { read: TemplateRef });
	/**
	 * @ignore
	 */
	readonly chatPanelTemplate = contentChild('chatPanel', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly additionalPanelsTemplate = contentChild('additionalPanels', { read: TemplateRef });

	/**
	 * @ignore
	 */
	readonly externalParticipantPanel = contentChild(ParticipantsPanelDirective);

	/**
	 * @ignore
	 */
	readonly externalActivitiesPanel = contentChild(ActivitiesPanelDirective);

	/**
	 * @ignore
	 */
	readonly externalChatPanel = contentChild(ChatPanelDirective);

	/**
	 * @ignore
	 */
	readonly externalAdditionalPanels = contentChild(AdditionalPanelsDirective);

	/**
	 * This event is fired when the chat panel status has been changed.
	 * It provides the new status of the chat panel represented by the {@link ChatPanelStatusEvent} object.
	 */
	onChatPanelStatusChanged = output<ChatPanelStatusEvent>();

	/**
	 * This event is fired when the participants panel status has been changed.
	 * It provides the new status of the participants panel represented by the {@link ParticipantsPanelStatusEvent} object.
	 */
	onParticipantsPanelStatusChanged = output<ParticipantsPanelStatusEvent>();

	/**
	 * This event is fired when the settings panel status has been changed.
	 * It provides the new status of the settings panel represented by the {@link SettingsPanelStatusEvent} object.
	 */
	onSettingsPanelStatusChanged = output<SettingsPanelStatusEvent>();

	/**
	 * This event is fired when the activities panel status has been changed.
	 * It provides the new status of the activities panel represented by the {@link ActivitiesPanelStatusEvent} object.
	 */
	onActivitiesPanelStatusChanged = output<ActivitiesPanelStatusEvent>();

	/**
	 * This event is fired when the background effects panel status has been changed.
	 * It provides the new status of the background effects panel represented by the {@link BackgroundEffectsPanelStatusEvent} object.
	 * @internal
	 */
	// @Output() onBackgroundEffectsPanelStatusChanged: EventEmitter<BackgroundEffectsPanelStatusEvent> = new EventEmitter<BackgroundEffectsPanelStatusEvent>();

	private panelEmitersHandler: Map<
		PanelType,
		{
			emit: (
				value:
					| ChatPanelStatusEvent
					| ParticipantsPanelStatusEvent
					| SettingsPanelStatusEvent
					| ActivitiesPanelStatusEvent
			) => void;
		}
	> = new Map();

	/**
	 * @ignore
	 */
	private readonly panelService = inject(PanelService);
	readonly panelOpened = this.panelService.panelOpened;
	readonly isChatPanelOpened = computed(() => this.panelOpened().isOpened && this.panelOpened().panelType === PanelType.CHAT);
	readonly isParticipantsPanelOpened = computed(
		() => this.panelOpened().isOpened && this.panelOpened().panelType === PanelType.PARTICIPANTS
	);
	readonly isBackgroundEffectsPanelOpened = computed(
		() => this.panelOpened().isOpened && this.panelOpened().panelType === PanelType.BACKGROUND_EFFECTS
	);
	readonly isSettingsPanelOpened = computed(
		() => this.panelOpened().isOpened && this.panelOpened().panelType === PanelType.SETTINGS
	);
	readonly isActivitiesPanelOpened = computed(
		() => this.panelOpened().isOpened && this.panelOpened().panelType === PanelType.ACTIVITIES
	);
	readonly isExternalPanelOpened = computed(
		() =>
			this.panelOpened().isOpened &&
			!this.isSettingsPanelOpened() &&
			!this.isBackgroundEffectsPanelOpened() &&
			!this.isChatPanelOpened() &&
			!this.isParticipantsPanelOpened() &&
			!this.isActivitiesPanelOpened()
	);
	private readonly panelTogglingEffect = effect(() => {
		this.sendPanelStatusChangedEvent(this.panelOpened());
	});

	/**
	 * @ignore
	 */
	ngOnInit(): void {
		this.panelEmitersHandler.set(PanelType.CHAT, this.onChatPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.PARTICIPANTS, this.onParticipantsPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.SETTINGS, this.onSettingsPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.ACTIVITIES, this.onActivitiesPanelStatusChanged);
	}

	/**
	 * @ignore
	 */
	ngOnDestroy() {
	}

	private sendPanelStatusChangedEvent(event: PanelStatusInfo) {
		const { panelType, isOpened, previousPanelType } = event;

		// Emit to the current panel
		if (panelType) {
			const panelMatch = this.panelEmitersHandler.get(panelType as PanelType);
			if (panelMatch) panelMatch.emit({ isOpened });
		}

		// Emit to the previous panel if it's different from the current one
		if (previousPanelType && panelType !== previousPanelType) {
			const previousPanelMatch = this.panelEmitersHandler.get(previousPanelType as PanelType);
			if (previousPanelMatch) previousPanelMatch.emit({ isOpened: false });
		}
	}
}
