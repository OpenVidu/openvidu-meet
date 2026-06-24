import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
	ApplicationConfig,
	importProvidersFrom,
	inject,
	provideAppInitializer,
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
	AUTH_TRANSLATIONS,
	AuthHeaderProviderService,
	AuthInterceptorErrorHandlerService,
	CustomParticipantModel,
	httpInterceptor,
	MeetingLayoutService,
	OpenViduComponentsModule,
	provideTranslations,
	RECORDINGS_TRANSLATIONS,
	RoomMemberHeaderProviderService,
	RoomMemberInterceptorErrorHandlerService,
	SHARED_TRANSLATIONS,
	SmartLayoutService,
	ThemeService,
	type OpenViduComponentsConfig,
	type ParticipantProperties
} from '@openvidu-meet/shared-components';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';

const ovComponentsConfig: OpenViduComponentsConfig = {
	production: false,
	participantFactory: (props: ParticipantProperties) => new CustomParticipantModel(props)
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideAnimationsAsync(),
		provideRouter([]),
		provideAppInitializer(() => inject(ThemeService).init()),
		provideAppInitializer(() => inject(RoomMemberHeaderProviderService).init()),
		// Important to register the room member error handler before the auth error handler,
		// since the room member error handler has more specific logic to determine if it can handle the error
		provideAppInitializer(() => inject(RoomMemberInterceptorErrorHandlerService).init()),
		provideAppInitializer(() => inject(AuthHeaderProviderService).init()),
		provideAppInitializer(() => inject(AuthInterceptorErrorHandlerService).init()),
		provideHttpClient(withInterceptors([httpInterceptor])),
		//TODO: Refactor .forRoot() module in openvidu-components to avoid the need to import the entire module here just to set the config.
		importProvidersFrom(OpenViduComponentsModule.forRoot(ovComponentsConfig)),
		provideTranslations(RECORDINGS_TRANSLATIONS),
		provideTranslations(AUTH_TRANSLATIONS),
		provideTranslations(SHARED_TRANSLATIONS),
		{ provide: SmartLayoutService, useExisting: MeetingLayoutService },
		ShadowOverlayContainer,
		{ provide: OverlayContainer, useExisting: ShadowOverlayContainer }
	]
};
