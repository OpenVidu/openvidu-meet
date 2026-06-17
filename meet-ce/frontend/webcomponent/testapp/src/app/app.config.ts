import {
    ApplicationConfig,
    inject,
    provideAppInitializer,
    provideBrowserGlobalErrorListeners,
    provideZonelessChangeDetection,
} from '@angular/core';
import { WebhookBridgeService } from './services/webhook-bridge';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Test-harness only: start the e2e webhook bridge at bootstrap, kept out of
    // the App component so the integration example stays focused. See
    // WebhookBridgeService for the contract it satisfies.
    provideAppInitializer(() => inject(WebhookBridgeService).connect()),
  ],
};
