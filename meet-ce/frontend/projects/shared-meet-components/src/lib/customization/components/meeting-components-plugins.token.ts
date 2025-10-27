import { InjectionToken, Type } from '@angular/core';

/**
 * Interface for registering custom components to be used in the meeting view.
 * Each property represents a slot where a custom component can be injected.
 */
export interface MeetingComponentsPlugins {
	/**
	 * Toolbar-related plugin components
	 */
	toolbar?: {
		/**
		 * Additional buttons to show in the toolbar (e.g., copy link, settings)
		 */
		additionalButtons?: Type<any>;
		/**
		 * Custom leave button component (only shown for moderators)
		 */
		leaveButton?: Type<any>;
	};

	/**
	 * Participant panel-related plugin components
	 */
	participantPanel?: {
		/**
		 * Custom component to render each participant item in the panel
		 */
		item?: Type<any>;
		/**
		 * Component to show after the local participant in the panel
		 */
		afterLocalParticipant?: Type<any>;
	};

	/**
	 * Layout-related plugin components
	 */
	layout?: {
		/**
		 * Additional elements to show in the main layout (e.g., overlays, banners)
		 */
		additionalElements?: Type<any>;
	};

	/**
	 * Lobby-related plugin components
	 */
	lobby?: Type<any>;
}

/**
 * Injection token for registering meeting plugins.
 * Apps (CE/PRO) should provide their custom components using this token.
 */
export const MEETING_COMPONENTS_TOKEN = new InjectionToken<MeetingComponentsPlugins>('MEETING_COMPONENTS_TOKEN');
