import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import {
	inject,
	provideAppInitializer,
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { ceRoutes } from '@app/app.routes';
import { environment } from '@environment/environment';
import type { OpenViduComponentsConfig, ParticipantProperties } from '@openvidu-meet/shared-components';
import {
	AUTH_TRANSLATIONS,
	AuthHeaderProviderService,
	AuthInterceptorErrorHandlerService,
	CONSOLE_TRANSLATIONS,
	CustomParticipantModel,
	httpInterceptor,
	MeetingLayoutService,
	provideOpenViduComponents,
	provideTranslations,
	RECORDINGS_TRANSLATIONS,
	ROOM_MEMBERS_TRANSLATIONS,
	RoomMemberHeaderProviderService,
	RoomMemberInterceptorErrorHandlerService,
	ROOMS_TRANSLATIONS,
	SHARED_TRANSLATIONS,
	SmartLayoutService,
	ThemeService,
	USERS_TRANSLATIONS
} from '@openvidu-meet/shared-components';

const ovComponentsconfig: OpenViduComponentsConfig = {
	production: environment.production,
	participantFactory: (props: ParticipantProperties) => new CustomParticipantModel(props)
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideZonelessChangeDetection(),
		provideBrowserGlobalErrorListeners(),
		provideAppInitializer(() => inject(ThemeService).init()),
		provideAppInitializer(() => inject(RoomMemberHeaderProviderService).init()),
		// Important to register the room member error handler before the auth error handler,
		// since the room member error handler has more specific logic to determine if it can handle the error
		provideAppInitializer(() => inject(RoomMemberInterceptorErrorHandlerService).init()),
		provideAppInitializer(() => inject(AuthHeaderProviderService).init()),
		provideAppInitializer(() => inject(AuthInterceptorErrorHandlerService).init()),
		provideOpenViduComponents(ovComponentsconfig),
		provideTranslations(CONSOLE_TRANSLATIONS),
		provideTranslations(ROOMS_TRANSLATIONS),
		provideTranslations(USERS_TRANSLATIONS),
		provideTranslations(RECORDINGS_TRANSLATIONS),
		provideTranslations(AUTH_TRANSLATIONS),
		provideTranslations(ROOM_MEMBERS_TRANSLATIONS),
		provideTranslations(SHARED_TRANSLATIONS),
		{ provide: SmartLayoutService, useExisting: MeetingLayoutService },
		provideRouter(ceRoutes),
		provideAnimationsAsync(),
		provideHttpClient(withXhr(), withInterceptors([httpInterceptor])),
		{
			provide: STEPPER_GLOBAL_OPTIONS,
			useValue: { showError: true } // Show error messages in stepper
		}
	]
};
