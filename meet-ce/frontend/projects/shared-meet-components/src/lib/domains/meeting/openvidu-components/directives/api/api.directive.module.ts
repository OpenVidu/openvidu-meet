import { NgModule } from '@angular/core';
import { ActivitiesPanelRecordingActivityDirective } from './activities-panel.directive';
import {
    E2EEKeyDirective,
    FallbackLogoDirective,
    LayoutRemoteParticipantsDirective,
    RecordingActivityViewRecordingsButtonDirective,
    ShowThemeSelectorDirective,
    StartStopRecordingButtonsDirective,
    ToolbarBrandingLogoDirective,
    ToolbarRoomNameDirective,
    ToolbarViewRecordingsButtonDirective
} from './internals.directive';
import { ParticipantPanelItemMuteButtonDirective } from './participant-panel-item.directive';
import {
    StreamDisplayAudioDetectionDirective,
    StreamDisplayParticipantNameDirective,
    StreamVideoControlsDirective
} from './stream.directive';
import {
    ToolbarActivitiesPanelButtonDirective,
    ToolbarAdditionalButtonsPossitionDirective,
    ToolbarBackgroundEffectsButtonDirective,
    ToolbarChatPanelButtonDirective,
    ToolbarDisplayLogoDirective,
    ToolbarDisplayRoomNameDirective,
    ToolbarFullscreenButtonDirective,
    ToolbarLeaveButtonDirective,
    ToolbarParticipantsPanelButtonDirective,
    ToolbarRecordingButtonDirective,
    ToolbarScreenshareButtonDirective,
    ToolbarSettingsButtonDirective
} from './toolbar.directive';
import {
    ChatWritableDirective,
    InitialMediaStateDirective,
    LangDirective,
    LangOptionsDirective,
    LivekitUrlDirective,
    ParticipantNameDirective,
    PrejoinDirective,
    ShowCameraControlsDirective,
    ShowMicrophoneControlsDirective,
    TokenDirective,
    TokenErrorDirective
} from './videoconference.directive';

const directives = [
	LivekitUrlDirective,
	TokenDirective,
	TokenErrorDirective,
	LangDirective,
	LangOptionsDirective,
	PrejoinDirective,
	InitialMediaStateDirective,
	ShowCameraControlsDirective,
	ShowMicrophoneControlsDirective,
	ToolbarScreenshareButtonDirective,
	ToolbarFullscreenButtonDirective,
	ToolbarBackgroundEffectsButtonDirective,
	ToolbarLeaveButtonDirective,
	ToolbarRecordingButtonDirective,
	ToolbarParticipantsPanelButtonDirective,
	ToolbarChatPanelButtonDirective,
	ChatWritableDirective,
	ToolbarActivitiesPanelButtonDirective,
	ToolbarDisplayRoomNameDirective,
	ToolbarDisplayLogoDirective,
	ToolbarSettingsButtonDirective,
	ToolbarAdditionalButtonsPossitionDirective,
	ToolbarViewRecordingsButtonDirective,
	StreamDisplayParticipantNameDirective,
	StreamDisplayAudioDetectionDirective,
	StreamVideoControlsDirective,
	FallbackLogoDirective,
	ToolbarBrandingLogoDirective,
	ParticipantPanelItemMuteButtonDirective,
	ParticipantNameDirective,
	ActivitiesPanelRecordingActivityDirective,
	LayoutRemoteParticipantsDirective,
	StartStopRecordingButtonsDirective,
	RecordingActivityViewRecordingsButtonDirective,
	ToolbarRoomNameDirective,
	ShowThemeSelectorDirective,
	E2EEKeyDirective
];

@NgModule({
	imports: [...directives],
	exports: [...directives]
})
export class ApiDirectiveModule {}
