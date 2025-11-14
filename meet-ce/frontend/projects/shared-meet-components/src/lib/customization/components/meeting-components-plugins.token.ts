import { InjectionToken, Type } from '@angular/core';

/**
 * Interface for registering custom components to be used in the meeting view.
 * Each property represents a slot where a custom component can be injected.
 */
export interface MeetingComponentsPlugins {
	/**
	 * Toolbar-related plugin components
	 */
	toolbar?: MeetingComponentsToolbarPlugins;

	/**
	 * Participant panel-related plugin components
	 */
	participantPanel?: MeetingComponentsParticipantPanelPlugins;

	/**
	 * Complete custom layout component that replaces the entire default layout.
	 * This component will receive all necessary inputs including additionalElements plugin.
	 */
	layout?: Type<any>;

	/**
	 * Additional elements to inject within the layout component.
	 * The layout component should provide an injection point for these elements.
	 *
	 * @example
	 * layoutAdditionalElements: ShareLinkOverlayComponent
	 */
	layoutAdditionalElements?: Type<any>;

	/**
	 * Lobby-related plugin components
	 */
	lobby?: Type<any>;
}

export interface MeetingComponentsToolbarPlugins {
	/**
	 * Additional buttons to show in the toolbar (e.g., copy link, settings)
	 */
	additionalButtons?: Type<any>;
	/**
	 * Custom leave button component (only shown for moderators)
	 */
	leaveButton?: Type<any>;
}

export interface MeetingComponentsParticipantPanelPlugins {
	/**
	 * Custom component to render each participant item in the panel
	 */
	item?: Type<any>;
	/**
	 * Component to show after the local participant in the panel
	 */
	afterLocalParticipant?: Type<any>;
}

/**
 * Injection token for registering meeting plugins.
 * Apps (CE/PRO) should provide their custom components using this token.
 */
export const MEETING_COMPONENTS_TOKEN = new InjectionToken<MeetingComponentsPlugins>('MEETING_COMPONENTS_TOKEN');
