import { Directive, TemplateRef, ViewContainerRef, inject } from '@angular/core';

/**
 * The ***ovToolbar** directive allows to replace the default toolbar component with a custom one.
 */
@Directive({
	selector: '[ovToolbar]'
})
export class ToolbarDirective {
	/**
	 * @ignore
	 */
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovToolbarAdditionalButtons** directive enables the addition of extra buttons to the central button group within the toolbar.
 */

@Directive({
	selector: '[ovToolbarAdditionalButtons]'
})
export class ToolbarAdditionalButtonsDirective {
	/**
	 * @ignore
	 */
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovToolbarAdditionalPanelButtons** directive allows to add additional **panel buttons** to the toolbar.
 * To learn how to toggle the panel they open, check the {@link AdditionalPanelsDirective}.
 */
@Directive({
	selector: '[ovToolbarAdditionalPanelButtons]'
})
export class ToolbarAdditionalPanelButtonsDirective {
	/**
	 * @ignore
	 */
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovPanel** directive empowers you to seamlessly replace default panels with custom ones.
 * It also provides the flexibility to insert elements tagged with the {@link ChatPanelDirective}, {@link ParticipantsPanelDirective}, and {@link AdditionalPanelsDirective},
 * which tailor the appearance and behavior of the {@link ParticipantsPanelComponent} and {@link ChatPanelComponent}.
 */
@Directive({
	selector: '[ovPanel]'
})
export class PanelDirective {
	/**
	 * @ignore
	 */
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 *
 * The ***ovAdditionalPanels** directive enables you to effortlessly integrate additional panels with the {@link PanelComponent}.
 */
@Directive({
	selector: '[ovAdditionalPanels]'
})
export class AdditionalPanelsDirective {
	/**
	 * @ignore
	 */
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovChatPanel** directive empowers you to effortlessly substitute the default chat panel template with a custom one.
 */
@Directive({
	selector: '[ovChatPanel]'
})
export class ChatPanelDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * backgroundEffectsPanel does not provide any customization for now
 * @internal
 */
@Directive({
	selector: '[ovBackgroundEffectsPanel]'
})
export class BackgroundEffectsPanelDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovActivitiesPanel** directive empowers you to effortlessly substitute the default activities panel template with a custom one.
 */
@Directive({
	selector: '[ovActivitiesPanel]'
})
export class ActivitiesPanelDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantsPanel** directive empowers you to substitute the default participants panel template with a customized one.
 */

@Directive({
	selector: '[ovParticipantsPanel]'
})
export class ParticipantsPanelDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantPanelItem** directive allows you to customize the default participant panel item template within the {@link ParticipantsPanelComponent}.
 *
 * With the **ovParticipantPanelItem** directive, you can access the participant object from its context using the `let` keyword and referencing the `participant`
 * variable as follows: `*ovParticipantPanelItem="let participant"`. This allows you to access the {@link ParticipantModel} object.
 */

@Directive({
	selector: '[ovParticipantPanelItem]'
})
export class ParticipantPanelItemDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovParticipantPanelItemElements** directive allows you to incorporate additional elements into the {@link ParticipantPanelItemComponent}.
 *
 * With the ***ovParticipantPanelItemElements** directive, you can access the participant object within its context using the `let` keyword and referencing the `participant` variable as follows: `*ovParticipantPanelItem="let participant"`.
 * This enables you to access the {@link ParticipantModel} object and tell the local participant apart from the remote ones.
 */

@Directive({
	selector: '[ovParticipantPanelItemElements]'
})
export class ParticipantPanelItemElementsDirective {
	public template = inject(TemplateRef<any>);
	public viewContainer = inject(ViewContainerRef);
}

/**
 * The ***ovLayout** directive empowers you to replace the default room layout with a customized one.
 *
 * To ensure that the default {@link StreamComponent} functions correctly with participant streams, you can access all local streams
 * through the `streams` accessor of {@link ParticipantModel}. Remote participants are flattened into a single array of streams by the
 * {@link RemoteParticipantTracksPipe}, applied in the template as `| tracks`.
 */
@Directive({
	selector: '[ovLayout]'
})
export class LayoutDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}

/**
 * The ***ovStream** directive empowers you to substitute the default {@link StreamComponent} template with a custom one.
 *
 * With the **ovStream** directive, you can access the stream object within its context using the `let` keyword and referencing the `stream` variable as follows: `*ovStream="let stream"`. This allows you to access the {@link ParticipantModel} object using `stream.participant`.
 */

@Directive({
	selector: '[ovStream]'
})
export class StreamDirective {
	public template = inject(TemplateRef<any>);
	public container = inject(ViewContainerRef);
}
