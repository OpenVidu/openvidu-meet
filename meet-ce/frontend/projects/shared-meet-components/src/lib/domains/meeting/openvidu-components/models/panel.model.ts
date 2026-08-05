/**
 * Interface representing the different types of panels
 */
export enum PanelType {
	CHAT = 'chat',
	PARTICIPANTS = 'participants',
	BACKGROUND_EFFECTS = 'background-effects',
	ACTIVITIES = 'activities',
	SETTINGS = 'settings'
}

/**
 * Interface representing a panel event
 */

export interface PanelStatusInfo {
	/**
	 * Indicates whether the panel is currently opened.
	 */
	isOpened: boolean;

	/**
	 * The type of the panel. For example: 'chat', 'participants', 'settings', 'activities', etc.
	 */
	panelType?: PanelType | string;

	/**
	 * Additional information for the 'activities' and 'settings' panel, specifying the sub-option to be displayed.
	 */
	subOptionType?: string;

	/**
	 * The previous type of the panel before any changes.
	 */
	previousPanelType?: PanelType | string;
}

/**
 * @internal
 */
export enum PanelSettingsOptions {
	GENERAL = 'general',
	AUDIO = 'audio',
	VIDEO = 'video'
}

/**
 * Interface representing a panel status event emmited by the library to the final app.
 *
 * Exported because the aliases below name it: a public output typed with an unexported
 * name cannot be emitted into the library's declaration files (TS4029).
 */
export interface PanelStatusEvent {
	isOpened: boolean;
}

// Distinct names for the same payload, one per panel, so each output documents what it emits.
export type ChatPanelStatusEvent = PanelStatusEvent;
export type ParticipantsPanelStatusEvent = PanelStatusEvent;
export type ActivitiesPanelStatusEvent = PanelStatusEvent;
export type SettingsPanelStatusEvent = PanelStatusEvent;
// export interface BackgroundEffectsPanelStatusEvent extends PanelStatusEvent { }
