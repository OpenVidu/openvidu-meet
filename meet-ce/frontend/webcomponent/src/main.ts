import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { registerOpenViduMeetElement } from './app/custom-element/register';

bootstrapApplication(App, appConfig)
	.then((appRef) => {
		registerOpenViduMeetElement(appRef.injector);
	})
	.catch((err) => console.error(err));
