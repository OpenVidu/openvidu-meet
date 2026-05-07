import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { setAppInjector } from './app/app.module';

createApplication(appConfig)
  .then((app) => {
    setAppInjector(app.injector);
  })
  .catch((err) => console.error(err));
