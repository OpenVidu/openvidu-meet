import {
	ApplicationConfig,
	importProvidersFrom,
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
	CustomParticipantModel,
	httpInterceptor,
	LayoutService,
	MeetingLayoutService,
	OpenViduComponentsModule,
	type OpenViduComponentsConfig,
	type ParticipantProperties
} from '@openvidu-meet/shared-components';

const ovComponentsConfig: OpenViduComponentsConfig = {
	production: false,
	participantFactory: (props: ParticipantProperties) => new CustomParticipantModel(props)
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideRouter([]),
		provideHttpClient(withInterceptors([httpInterceptor])),
		provideAnimationsAsync(),
		//TODO: Refactor .forRoot() module in openvidu-components to avoid the need to import the entire module here just to set the config.
		importProvidersFrom(OpenViduComponentsModule.forRoot(ovComponentsConfig)),
		{ provide: LayoutService, useClass: MeetingLayoutService }
	]
};
