import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { setAppInjector } from './app/app.module';

bootstrapApplication(App, appConfig)
  .then((appRef) => {
    setAppInjector(appRef.injector);
  })
  .catch((err) => console.error(err));
