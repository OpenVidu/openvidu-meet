import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import {
	ApplicationConfig,
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
	httpInterceptor,
	MeetingLayoutService,
	provideOpenViduComponents,
	provideTranslations,
	RECORDINGS_TRANSLATIONS,
	RoomMemberHeaderProviderService,
	RoomMemberInterceptorErrorHandlerService,
	SHARED_TRANSLATIONS,
	SmartLayoutService,
	ThemeService
} from '@openvidu-meet/shared-components';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';

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
		provideHttpClient(withXhr(), withInterceptors([httpInterceptor])),
		provideOpenViduComponents(),
		provideTranslations(RECORDINGS_TRANSLATIONS),
		provideTranslations(AUTH_TRANSLATIONS),
		provideTranslations(SHARED_TRANSLATIONS),
		{ provide: SmartLayoutService, useExisting: MeetingLayoutService },
		ShadowOverlayContainer,
		{ provide: OverlayContainer, useExisting: ShadowOverlayContainer }
	]
};
