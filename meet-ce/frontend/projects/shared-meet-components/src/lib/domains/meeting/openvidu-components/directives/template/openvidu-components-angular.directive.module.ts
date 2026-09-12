import { NgModule } from '@angular/core';
import {
	ChatPanelDirective,
	LayoutDirective,
	PanelDirective,
	ParticipantPanelItemElementsDirective,
	ParticipantPanelItemDirective,
	ParticipantsPanelDirective,
	StreamDirective,
	ToolbarAdditionalButtonsDirective,
	ToolbarDirective,
	ToolbarAdditionalPanelButtonsDirective,
	AdditionalPanelsDirective,
	ActivitiesPanelDirective
} from './openvidu-components-angular.directive';
import {
	LayoutAdditionalElementsDirective,
	ParticipantPanelAfterLocalParticipantDirective,
	ParticipantPanelBeforeLocalParticipantDirective,
	ParticipantPanelParticipantBadgeDirective,
	ParticipantsPanelHeaderActionsDirective,
	PreJoinDirective,
	LeaveButtonDirective,
	SettingsPanelGeneralAdditionalElementsDirective,
	ToolbarMoreOptionsAdditionalMenuItemsDirective
} from './internals.directive';

const directives = [
	ChatPanelDirective,
	LayoutDirective,
	PanelDirective,
	AdditionalPanelsDirective,
	ParticipantPanelItemDirective,
	ParticipantsPanelDirective,
	ParticipantsPanelHeaderActionsDirective,
	StreamDirective,
	ToolbarDirective,
	ToolbarAdditionalButtonsDirective,
	LeaveButtonDirective,
	ToolbarAdditionalPanelButtonsDirective,
	ParticipantPanelItemElementsDirective,
	ActivitiesPanelDirective,
	PreJoinDirective,
	ParticipantPanelBeforeLocalParticipantDirective,
	ParticipantPanelAfterLocalParticipantDirective,
	LayoutAdditionalElementsDirective,
	ParticipantPanelParticipantBadgeDirective,
	SettingsPanelGeneralAdditionalElementsDirective,
	ToolbarMoreOptionsAdditionalMenuItemsDirective
];

@NgModule({
	imports: [...directives],
	exports: [...directives]
})
export class OpenViduComponentsDirectiveModule {}
