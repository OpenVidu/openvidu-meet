import { LIVE_ANNOUNCER_ELEMENT_TOKEN } from '@angular/cdk/a11y';
import { OverlayContainer } from '@angular/cdk/overlay';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import {
	APP_ID,
	ApplicationConfig,
	DOCUMENT,
	inject,
	provideAppInitializer,
	provideBrowserGlobalErrorListeners,
	provideZonelessChangeDetection,
	ɵSHARED_STYLES_HOST as SHARED_STYLES_HOST
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import {
	AUTH_TRANSLATIONS,
	AuthHeaderProviderService,
	AuthInterceptorErrorHandlerService,
	httpInterceptor,
	provideOpenViduComponents,
	provideTranslations,
	RECORDINGS_TRANSLATIONS,
	RoomMemberHeaderProviderService,
	RoomMemberInterceptorErrorHandlerService,
	SHARED_TRANSLATIONS,
	THEME_ROOT_ELEMENT,
	ThemeService
} from '@openvidu-meet/shared-components';
import { createLiveAnnouncerElement, MEET_APP_ID } from './shadow-dom/body-nodes';
import { ShadowOverlayContainer } from './shadow-dom/overlay-container.service';
import { ShadowOnlySharedStylesHost } from './shadow-dom/shared-styles-host';

export const appConfig: ApplicationConfig = {
	providers: [
		provideBrowserGlobalErrorListeners(),
		provideZonelessChangeDetection(),
		provideAnimationsAsync(),
		provideRouter([]),
		{ provide: THEME_ROOT_ELEMENT, useValue: null },
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
		{ provide: APP_ID, useValue: MEET_APP_ID },
		{ provide: LIVE_ANNOUNCER_ELEMENT_TOKEN, useFactory: () => createLiveAnnouncerElement(inject(DOCUMENT)) },
		ShadowOverlayContainer,
		{ provide: OverlayContainer, useExisting: ShadowOverlayContainer },
		{ provide: SHARED_STYLES_HOST, useClass: ShadowOnlySharedStylesHost }
	]
};
