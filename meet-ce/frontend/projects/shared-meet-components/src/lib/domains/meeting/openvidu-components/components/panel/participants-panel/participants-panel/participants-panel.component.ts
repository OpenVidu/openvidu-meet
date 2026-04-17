import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	contentChild,
	DestroyRef,
	effect,
	inject,
	OnDestroy,
	OnInit,
	TemplateRef,
	viewChild
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
	readonly defaultParticipantPanelItemTemplateQuery = viewChild('defaultParticipantPanelItem', { read: TemplateRef });
	defaultParticipantPanelItemTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly participantPanelItemTemplateQuery = contentChild('participantPanelItem', { read: TemplateRef });
	participantPanelItemTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly participantPanelAfterLocalParticipantTemplateQuery = contentChild('participantPanelAfterLocalParticipant', { read: TemplateRef });
	participantPanelAfterLocalParticipantTemplate: TemplateRef<any> | undefined = undefined;

	/**
	 * @ignore
	 */
	readonly externalParticipantPanelItem = contentChild(ParticipantPanelItemDirective);

	/**
	 * @internal
	 * Template configuration managed by the service
	 */
	templateConfig: ParticipantsPanelTemplateConfiguration = {};

	private readonly destroyRef = inject(DestroyRef);
	private readonly querySyncEffect = effect(() => {
		this.defaultParticipantPanelItemTemplate = this.defaultParticipantPanelItemTemplateQuery() ?? this.defaultParticipantPanelItemTemplate;
		this.participantPanelItemTemplate = this.participantPanelItemTemplateQuery() ?? this.participantPanelItemTemplate;
		this.participantPanelAfterLocalParticipantTemplate =
			this.participantPanelAfterLocalParticipantTemplateQuery() ?? this.participantPanelAfterLocalParticipantTemplate;
		this.setupTemplates();
		this.cd.markForCheck();
	});

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
		const participantPanelItemTemplate =
			this.participantPanelItemTemplate ?? this.defaultParticipantPanelItemTemplate;

		this.templateConfig = this.templateManagerService.setupParticipantsPanelTemplates(
			this.externalParticipantPanelItem(),
			participantPanelItemTemplate,
			this.participantPanelAfterLocalParticipantTemplate
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
	 * @ignore
	 */
	close() {
		this.panelService.closePanel();
	}
}
