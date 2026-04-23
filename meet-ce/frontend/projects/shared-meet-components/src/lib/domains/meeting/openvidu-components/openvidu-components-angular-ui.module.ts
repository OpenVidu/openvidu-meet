import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AudioWaveComponent } from './components/audio-wave/audio-wave.component';
import { LayoutComponent } from './components/layout/layout.component';
import { MediaElementComponent } from './components/media-element/media-element.component';
import { ChatPanelComponent } from './components/panel/chat-panel/chat-panel.component';
import { SessionComponent } from './components/session/session.component';
import { StreamComponent } from './components/stream/stream.component';
import { ToolbarMediaButtonsComponent } from './components/toolbar/toolbar-media-buttons/toolbar-media-buttons.component';
import { ToolbarPanelButtonsComponent } from './components/toolbar/toolbar-panel-buttons/toolbar-panel-buttons.component';
import { ToolbarComponent } from './components/toolbar/toolbar.component';

import { LinkifyPipe } from './pipes/linkify.pipe';
import { RemoteParticipantTracksPipe, TrackPublishedTypesPipe } from './pipes/participant.pipe';
import { DurationFromSecondsPipe, SearchByStringPropertyPipe, ThumbnailFromUrlPipe } from './pipes/recording.pipe';
import { TranslatePipe } from './pipes/translate.pipe';

import { DragDropModule } from '@angular/cdk/drag-drop';
import { PanelComponent } from './components/panel/panel.component';
import { ParticipantPanelItemComponent } from './components/panel/participants-panel/participant-panel-item/participant-panel-item.component';
import { ParticipantsPanelComponent } from './components/panel/participants-panel/participants-panel/participants-panel.component';
import { PreJoinComponent } from './components/pre-join/pre-join.component';
import { VideoconferenceComponent } from './components/videoconference/videoconference.component';

// import { CaptionsComponent } from './components/captions/captions.component';
import { ActivitiesPanelComponent } from './components/panel/activities-panel/activities-panel.component';
import { RecordingActivityComponent } from './components/panel/activities-panel/recording-activity/recording-activity.component';
import { BackgroundEffectsPanelComponent } from './components/panel/background-effects-panel/background-effects-panel.component';
import { SettingsPanelComponent } from './components/panel/settings-panel/settings-panel.component';
import { AudioDevicesComponent } from './components/settings/audio-devices/audio-devices.component';
// import { CaptionsSettingComponent } from './components/settings/captions/captions.component';
import { LandscapeWarningComponent } from './components/landscape-warning/landscape-warning.component';
import { LangSelectorComponent } from './components/settings/lang-selector/lang-selector.component';
import { ParticipantNameInputComponent } from './components/settings/participant-name-input/participant-name-input.component';
import { ThemeSelectorComponent } from './components/settings/theme-selector/theme-selector.component';
import { VideoDevicesComponent } from './components/settings/video-devices/video-devices.component';
import { VideoPosterComponent } from './components/video-poster/video-poster.component';
import { ApiDirectiveModule } from './directives/api/api.directive.module';
import { OpenViduComponentsDirectiveModule } from './directives/template/openvidu-components-angular.directive.module';
import { AppMaterialModule } from './openvidu-components-angular.material.module';

const publicComponents = [
	VideoconferenceComponent,
	ToolbarComponent,
	PanelComponent,
	ActivitiesPanelComponent,
	RecordingActivityComponent,
	ParticipantsPanelComponent,
	ParticipantPanelItemComponent,
	ChatPanelComponent,
	StreamComponent,
	LayoutComponent
];
const privateComponents = [
	PreJoinComponent,
	SessionComponent,
	BackgroundEffectsPanelComponent,
	SettingsPanelComponent,
	MediaElementComponent,
	ToolbarMediaButtonsComponent,
	ToolbarPanelButtonsComponent
];

@NgModule({
	declarations: [
		...publicComponents,
		...privateComponents,
		LinkifyPipe,
		RemoteParticipantTracksPipe,
		DurationFromSecondsPipe,
		SearchByStringPropertyPipe,
		ThumbnailFromUrlPipe,
		TrackPublishedTypesPipe
	],
	imports: [
		CommonModule,
		FormsModule,
		ReactiveFormsModule,
		AppMaterialModule,
		AudioWaveComponent,
		LandscapeWarningComponent,
		AudioDevicesComponent,
		LangSelectorComponent,
		ParticipantNameInputComponent,
		ThemeSelectorComponent,
		VideoDevicesComponent,
		VideoPosterComponent,
		TranslatePipe,
		OpenViduComponentsDirectiveModule,
		ApiDirectiveModule,
		DragDropModule
	],
	exports: [
		...publicComponents,
		RemoteParticipantTracksPipe,
		DurationFromSecondsPipe,
		TrackPublishedTypesPipe,
		TranslatePipe,
		OpenViduComponentsDirectiveModule,
		ApiDirectiveModule
	]
})
export class OpenViduComponentsUiModule {}
