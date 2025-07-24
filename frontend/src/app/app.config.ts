import { STEPPER_GLOBAL_OPTIONS } from '@angular/cdk/stepper';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { routes } from '@app/app.routes';
import { environment } from '@environment/environment';
import { httpInterceptor } from '@lib/interceptors/index';
import { ThemeService } from '@lib/services/theme.service';
import { OpenViduComponentsConfig, OpenViduComponentsModule } from 'openvidu-components-angular';

const ovComponentsconfig: OpenViduComponentsConfig = {
	production: environment.production
};

export const appConfig: ApplicationConfig = {
	providers: [
		{
			provide: APP_INITIALIZER,
			// Ensure the theme is initialized before the app starts
			useFactory: (themeService: ThemeService) => () => themeService.initializeTheme(),
			deps: [ThemeService],
			multi: true
		},
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
