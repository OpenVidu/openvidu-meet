import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	contentChild,
	DestroyRef,
	inject,
	OnInit,
	output,
	TemplateRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { skip } from 'rxjs';
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
import { PanelTemplateConfiguration, TemplateManagerService } from '../../services/template/template-manager.service';

/**
 *
 * The **PanelComponent** is hosted inside of the {@link VideoconferenceComponent}.
 * It is in charge of displaying the videoconference panels providing functionalities to the videoconference app
 * such as the chat ({@link ChatPanelComponent}) and list of participants ({@link ParticipantsPanelComponent})
 */

@Component({
	selector: 'ov-panel',
	templateUrl: './panel.component.html',
	styleUrls: ['./panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
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

	/**
	 * @ignore
	 */
	isParticipantsPanelOpened: boolean = false;
	/**
	 * @ignore
	 */
	isChatPanelOpened: boolean = false;
	/**
	 * @ignore
	 */
	isBackgroundEffectsPanelOpened: boolean = false;
	/**
	 * @ignore
	 */
	isSettingsPanelOpened: boolean = false;
	/**
	 * @ignore
	 */
	isActivitiesPanelOpened: boolean = false;

	/**
	 * @internal
	 */
	isExternalPanelOpened: boolean = false;

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: PanelTemplateConfiguration = {};

	// Store directive references for template setup
	private _externalParticipantPanel?: ParticipantsPanelDirective;
	private _externalChatPanel?: ChatPanelDirective;
	private _externalActivitiesPanel?: ActivitiesPanelDirective;
	private _externalAdditionalPanels?: AdditionalPanelsDirective;

	private readonly destroyRef = inject(DestroyRef);

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
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);

	/**
	 * @ignore
	 */
	ngOnInit(): void {
		this.setupTemplates();
		this.subscribeToPanelToggling();
		this.panelEmitersHandler.set(PanelType.CHAT, this.onChatPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.PARTICIPANTS, this.onParticipantsPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.SETTINGS, this.onSettingsPanelStatusChanged);
		this.panelEmitersHandler.set(PanelType.ACTIVITIES, this.onActivitiesPanelStatusChanged);
	}

	/**
	 * @internal
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupPanelTemplates(
			this.externalParticipantPanel(),
			this.externalChatPanel(),
			this.externalActivitiesPanel(),
			this.externalAdditionalPanels()
		);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		// Template refs are now read directly from signals in the template.
	}

	/**
	 * @internal
	 * Updates templates and triggers change detection
	 */
	private updateTemplatesAndMarkForCheck(): void {
		this.setupTemplates();
		this.cd.markForCheck();
	}

	/**
	 * @ignore
	 */
	ngOnDestroy() {
		this.isChatPanelOpened = false;
		this.isParticipantsPanelOpened = false;
	}

	private subscribeToPanelToggling() {
		this.panelService.panelStatusObs
			.pipe(skip(1), takeUntilDestroyed(this.destroyRef))
			.subscribe((ev: PanelStatusInfo) => {
				this.isChatPanelOpened = ev.isOpened && ev.panelType === PanelType.CHAT;
				this.isParticipantsPanelOpened = ev.isOpened && ev.panelType === PanelType.PARTICIPANTS;
				this.isBackgroundEffectsPanelOpened = ev.isOpened && ev.panelType === PanelType.BACKGROUND_EFFECTS;
				this.isSettingsPanelOpened = ev.isOpened && ev.panelType === PanelType.SETTINGS;
				this.isActivitiesPanelOpened = ev.isOpened && ev.panelType === PanelType.ACTIVITIES;
				this.isExternalPanelOpened =
					ev.isOpened &&
					!this.isSettingsPanelOpened &&
					!this.isBackgroundEffectsPanelOpened &&
					!this.isChatPanelOpened &&
					!this.isParticipantsPanelOpened &&
					!this.isActivitiesPanelOpened;
				this.cd.markForCheck();

				this.sendPanelStatusChangedEvent(ev);
			});
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
