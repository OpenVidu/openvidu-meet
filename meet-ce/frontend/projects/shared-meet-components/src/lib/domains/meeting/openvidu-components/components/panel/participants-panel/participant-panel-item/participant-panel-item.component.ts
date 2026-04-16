import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ContentChild, OnDestroy, OnInit, TemplateRef, inject, input } from '@angular/core';
import { Subscription } from 'rxjs';
import { ParticipantPanelParticipantBadgeDirective } from '../../../../directives/template/internals.directive';
import { ParticipantPanelItemElementsDirective } from '../../../../directives/template/openvidu-components-angular.directive';
import { ParticipantModel } from '../../../../models/participant.model';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ParticipantPanelItemTemplateConfiguration, TemplateManagerService } from '../../../../services/template/template-manager.service';

/**
 * The **ParticipantPanelItemComponent** is hosted inside of the {@link ParticipantsPanelComponent}.
 * It displays participant information with enhanced UI/UX, including support for custom content
 * injection through structural directives.
 */
@Component({
	selector: 'ov-participant-panel-item',
	templateUrl: './participant-panel-item.component.html',
	styleUrls: ['./participant-panel-item.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class ParticipantPanelItemComponent implements OnInit, OnDestroy {
	readonly participantInput = input<ParticipantModel | undefined>(undefined, { alias: 'participant' });
	readonly muteButtonInput = input(true, { alias: 'muteButton' });

	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly participantService = inject(ParticipantService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);

	/**
	 * @ignore
	 */
	@ContentChild('participantPanelItemElements', { read: TemplateRef }) participantPanelItemElementsTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	showMuteButton: boolean = true;
	private muteButtonSub: Subscription = new Subscription();

	/**
	 * @ignore
	 */
	@ContentChild(ParticipantPanelItemElementsDirective)
	set externalItemElements(externalItemElements: ParticipantPanelItemElementsDirective) {
		this._externalItemElements = externalItemElements;
		if (externalItemElements) {
			this.updateTemplatesAndMarkForCheck();
		}
	}

	/**
	 * @ignore
	 */
	@ContentChild(ParticipantPanelParticipantBadgeDirective)
	set externalParticipantBadge(participantBadge: ParticipantPanelParticipantBadgeDirective) {
		this._externalParticipantBadge = participantBadge;
		if (participantBadge) {
			this.updateTemplatesAndMarkForCheck();
		}
	}

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: ParticipantPanelItemTemplateConfiguration = {};

	// Store directive references for template setup
	private _externalItemElements?: ParticipantPanelItemElementsDirective;
	private _externalParticipantBadge?: ParticipantPanelParticipantBadgeDirective;

	get _participant(): ParticipantModel | undefined {
		return this.participantInput();
	}

	/**
	 * @ignore
	 */
	constructor() {}

	/**
	 * @ignore
	 */
	ngOnInit(): void {
		this.setupTemplates();
		this.subscribeToParticipantPanelItemDirectives();
	}

	/**
	 * @ignore
	 */
	ngOnDestroy(): void {
		if (this.muteButtonSub) this.muteButtonSub.unsubscribe();
	}

	/**
	 * Toggles the mute state of a remote participant
	 */
	toggleMuteForcibly() {
		if (this._participant && !this._participant.isLocal) {
			this.participantService.setRemoteMutedForcibly(this._participant.sid, !this._participant.isMutedForcibly);
		}
	}

	/**
	 * Gets the template for local participant badge
	 */
	get participantBadgeTemplate(): TemplateRef<any> | undefined {
		return this._externalParticipantBadge?.template;
	}

	/**
	 * Checks if the current participant is the local participant
	 */
	get isLocalParticipant(): boolean {
		return this._participant?.isLocal || false;
	}

	/**
	 * Gets the participant's display name
	 */
	get participantDisplayName(): string {
		return this._participant?.name || '';
	}

	/**
	 * Checks if external elements are available
	 */
	get hasExternalElements(): boolean {
		return !!this.participantPanelItemElementsTemplate;
	}

	/**
	 * @internal
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupParticipantPanelItemTemplates(this._externalItemElements);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		if (this.templateConfig.participantPanelItemElementsTemplate) {
			this.participantPanelItemElementsTemplate = this.templateConfig.participantPanelItemElementsTemplate;
		}
	}

	/**
	 * @internal
	 * Updates templates and triggers change detection
	 */
	private updateTemplatesAndMarkForCheck(): void {
		this.setupTemplates();
		this.cd.markForCheck();
	}

	private subscribeToParticipantPanelItemDirectives() {
		this.muteButtonSub = this.libService.participantItemMuteButton$.subscribe((value: boolean) => {
			this.showMuteButton = value;
			this.cd.markForCheck();
		});
	}
}
