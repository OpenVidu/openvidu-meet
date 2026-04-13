import {
    AfterViewInit,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ContentChild,
    DestroyRef,
    inject,
    OnDestroy,
    OnInit,
    TemplateRef,
    ViewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParticipantPanelItemDirective } from '../../../../directives/template/openvidu-components-angular.directive';
import { ParticipantModel } from '../../../../models/participant.model';
import { OpenViduComponentsConfigService } from '../../../../services/config/directive-config.service';
import { PanelService } from '../../../../services/panel/panel.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { ParticipantsPanelTemplateConfiguration, TemplateManagerService } from '../../../../services/template/template-manager.service';

/**
 * The **ParticipantsPanelComponent** is hosted inside of the {@link PanelComponent}.
 * It is in charge of displaying the participants connected to the session.
 * This component is composed by the {@link ParticipantPanelItemComponent}.
 */
@Component({
	selector: 'ov-participants-panel',
	templateUrl: './participants-panel.component.html',
	styleUrls: ['../../panel.component.scss', './participants-panel.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: false
})
export class ParticipantsPanelComponent implements OnInit, OnDestroy, AfterViewInit {
	/**
	 * @ignore
	 */
	localParticipant: ParticipantModel | undefined;
	/**
	 * @ignore
	 */
	remoteParticipants: ParticipantModel[] = [];

	/**
	 * @ignore
	 */
	@ViewChild('defaultParticipantPanelItem', { static: false, read: TemplateRef })
	defaultParticipantPanelItemTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	@ContentChild('participantPanelItem', { read: TemplateRef }) participantPanelItemTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	@ContentChild('participantPanelAfterLocalParticipant', { read: TemplateRef })
	participantPanelAfterLocalParticipantTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	@ContentChild(ParticipantPanelItemDirective)
	set externalParticipantPanelItem(externalParticipantPanelItem: ParticipantPanelItemDirective) {
		this._externalParticipantPanelItem = externalParticipantPanelItem;
		if (externalParticipantPanelItem) {
			this.updateTemplatesAndMarkForCheck();
		}
	}

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: ParticipantsPanelTemplateConfiguration = {};

	// Store directive references for template setup
	private _externalParticipantPanelItem?: ParticipantPanelItemDirective;

	private readonly destroyRef = inject(DestroyRef);

	/**
	 * @ignore
	 */
	private readonly participantService = inject(ParticipantService);
	private readonly panelService = inject(PanelService);
	private readonly cd = inject(ChangeDetectorRef);
	private readonly templateManagerService = inject(TemplateManagerService);
	private readonly libService = inject(OpenViduComponentsConfigService);

	/**
	 * @ignore
	 */
	ngOnInit(): void {
		this.setupTemplates();

		this.subscribeToParticipantsChanges();
	}

	/**
	 * @ignore
	 */
	ngOnDestroy() {
	}

	/**
	 * @ignore
	 */
	ngAfterViewInit() {
		if (!this.participantPanelItemTemplate) {
			// the user has override the default participants panel but not the 'participant-panel-item'
			// so the default component must be injected
			this.participantPanelItemTemplate = this.defaultParticipantPanelItemTemplate;
			this.cd.detectChanges();
		}
	}

	private subscribeToParticipantsChanges() {
		this.participantService.localParticipant$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: ParticipantModel | undefined) => {
			if (p) {
				this.localParticipant = p;
				this.cd.markForCheck();
			}
		});

		this.participantService.remoteParticipants$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((p: ParticipantModel[]) => {
			this.remoteParticipants = p;
			this.cd.markForCheck();
		});
	}


	/**
	 * @internal
	 * Sets up all templates using the template manager service
	 */
	private setupTemplates(): void {
		this.templateConfig = this.templateManagerService.setupParticipantsPanelTemplates(
			this._externalParticipantPanelItem,
			this.defaultParticipantPanelItemTemplate
		);

		// Apply templates to component properties for backward compatibility
		this.applyTemplateConfiguration();
	}

	/**
	 * @internal
	 * Applies the template configuration to component properties
	 */
	private applyTemplateConfiguration(): void {
		if (this.templateConfig.participantPanelItemTemplate) {
			this.participantPanelItemTemplate = this.templateConfig.participantPanelItemTemplate;
		}
		if (this.templateConfig.participantPanelAfterLocalParticipantTemplate) {
			this.participantPanelAfterLocalParticipantTemplate = this.templateConfig.participantPanelAfterLocalParticipantTemplate;
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

	/**
	 * @ignore
	 */
	close() {
		this.panelService.closePanel();
	}
}
