import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { ApplicationConfig } from '@angular/core';
import {
	inject,
	provideAppInitializer,
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { ceRoutes } from '@app/app.routes';
import {
	AUTH_TRANSLATIONS,
	AuthHeaderProviderService,
	AuthInterceptorErrorHandlerService,
	httpInterceptor,
	provideEmbeddedIframeBridge,
	provideMaterialSymbols,
	provideOpenViduComponents,
	provideTranslations,
	RECORDINGS_TRANSLATIONS,
	RoomMemberHeaderProviderService,
	RoomMemberInterceptorErrorHandlerService,
	SHARED_TRANSLATIONS,
	ThemeService
} from '@openvidu-meet/shared-components';

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
		provideEmbeddedIframeBridge(),
		provideOpenViduComponents(),
		provideMaterialSymbols(),
		provideTranslations(RECORDINGS_TRANSLATIONS),
		provideTranslations(AUTH_TRANSLATIONS),
		provideTranslations(SHARED_TRANSLATIONS),
		provideRouter(ceRoutes),
		provideHttpClient(withXhr(), withInterceptors([httpInterceptor]))
	]
};
