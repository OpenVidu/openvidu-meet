import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection, inject, provideAppInitializer } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { routes } from '@app/app.routes';
import { environment } from '@environment/environment';
import { httpInterceptor } from '@lib/interceptors';
import { CustomParticipantModel } from '@lib/models';
import { ThemeService } from '@lib/services';
import { OpenViduComponentsConfig, OpenViduComponentsModule, ParticipantProperties } from 'openvidu-components-angular';

const ovComponentsconfig: OpenViduComponentsConfig = {
	production: environment.production,
	participantFactory: (props: ParticipantProperties) => new CustomParticipantModel(props)
};

export const appConfig: ApplicationConfig = {
	providers: [
		provideAppInitializer(() => {
        const initializerFn = ((themeService: ThemeService) => () => themeService.initializeTheme())(inject(ThemeService));
        return initializerFn();
      }),
		importProvidersFrom(OpenViduComponentsModule.forRoot(ovComponentsconfig)),
		provideZoneChangeDetection({ eventCoalescing: true }),
		provideRouter(routes),
		provideAnimationsAsync(),
		provideHttpClient(withInterceptors([httpInterceptor])),
		{
			provide: STEPPER_GLOBAL_OPTIONS,
			useValue: { showError: true } // Show error messages in stepper
		}
	]
};
