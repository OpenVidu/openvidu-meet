import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
	ApplicationConfig,
	importProvidersFrom,
	inject,
	provideAppInitializer,
	provideZoneChangeDetection
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { ceRoutes } from '@app/app.routes';
import { environment } from '@environment/environment';
import {
	AuthInterceptorErrorHandlerService,
	CustomParticipantModel,
	httpInterceptor,
	MEETING_CONTEXT_ADAPTER_PROVIDER,
	MeetingLayoutService,
	ROOM_MEMBER_ADAPTER_PROVIDER,
	RoomMemberInterceptorErrorHandlerService,
	ThemeService
} from '@openvidu-meet/shared-components';
import {
	LayoutService,
	OpenViduComponentsConfig,
	OpenViduComponentsModule,
	ParticipantProperties
} from 'openvidu-components-angular';

const ovComponentsconfig: OpenViduComponentsConfig = {
	production: environment.production,
	participantFactory: (props: ParticipantProperties) => new CustomParticipantModel(props)
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideAppInitializer(() => inject(ThemeService).init()),
		provideAppInitializer(() => inject(AuthInterceptorErrorHandlerService).init()),
		provideAppInitializer(() => inject(RoomMemberInterceptorErrorHandlerService).init()),
		importProvidersFrom(OpenViduComponentsModule.forRoot(ovComponentsconfig)),
		{ provide: LayoutService, useClass: MeetingLayoutService },
		MEETING_CONTEXT_ADAPTER_PROVIDER,
		ROOM_MEMBER_ADAPTER_PROVIDER,
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(ceRoutes),
		provideAnimationsAsync(),
		provideHttpClient(withInterceptors([httpInterceptor])),
		{
			provide: STEPPER_GLOBAL_OPTIONS,
			useValue: { showError: true } // Show error messages in stepper
		}
	]
};
