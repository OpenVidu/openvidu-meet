import { Provider } from '@angular/core';
import {
	MEETING_COMPONENTS_TOKEN,
	MeetingLobbyComponent,
	MeetingParticipantPanelComponent,
	MeetingShareLinkOverlayComponent,
	MeetingShareLinkPanelComponent,
	MeetingToolbarButtonsComponent
} from '@openvidu-meet/shared-components';

/**
 * CE Meeting Providers
 *
 * Configures the plugin system using library components directly.
 * No wrappers needed - library components receive @Input properties directly through NgComponentOutlet.
 *
 * The library's MeetingComponent:
 * - Uses NgComponentOutlet to render plugins dynamically
 * - Prepares inputs via helper methods (getToolbarAdditionalButtonsInputs, etc.)
 * - Passes these inputs to plugins via [ngComponentOutletInputs]
 *
 * CE uses library components as plugins without any customization.
 * PRO will later define its own custom components to override CE behavior.
 */
export const MEETING_CE_PROVIDERS: Provider[] = [
	{
		provide: MEETING_COMPONENTS_TOKEN,
		useValue: {
			toolbar: {
				additionalButtons: MeetingToolbarButtonsComponent,
				leaveButton: MeetingToolbarButtonsComponent
			},
			participantPanel: {
				item: MeetingParticipantPanelComponent,
				afterLocalParticipant: MeetingShareLinkPanelComponent
			},
			layout: {
				additionalElements: MeetingShareLinkOverlayComponent
			},
			lobby: MeetingLobbyComponent
		}
	}
	// {
	// 	provide: MEETING_ACTION_HANDLER,
	// 	useValue: {
	// 		copySpeakerLink: () => {
	// 			console.log('Copy speaker link clicked');
	// 		}
	// 	}
	// }
];
