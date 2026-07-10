import { OverlayContainer } from '@angular/cdk/overlay';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';

import { provideTranslations } from '../../../shared/models';
import { MEETING_TRANSLATIONS } from '../lang/meeting-translations';
import { CdkOverlayContainer } from './config/custom-cdk-overlay';
import { OPENVIDU_COMPONENTS_CONFIG, OpenViduComponentsConfig } from './config/openvidu-components-angular.config';

/**
 * Provides the OpenVidu Components configuration and its root-level overrides.
 *
 * Standalone/zoneless replacement for the legacy `OpenViduComponentsModule.forRoot(config)`.
 *
 * The meeting feature services (OpenViduService, VirtualBackgroundService, E2eeService, …) are
 * all `providedIn: 'root'`, so they are intentionally NOT listed here. Enumerating them would
 * create a static reference from whatever eager injector calls this function, pinning them — and
 * their heavy transitive deps (MediaPipe / LiveKit / E2EE) — into that chunk. By relying on
 * `providedIn: 'root'` instead, the bundler places each service in the chunk of whatever injects
 * it, so the meeting-only services land in the lazy meeting chunk rather than the initial bundle.
 *
 * Only the genuinely non-tree-shakeable bits belong here:
 * - the config value token (a plain `useValue`, no heavy deps),
 * - the CDK overlay-container override (remaps the global `OverlayContainer` token),
 * - the meeting translation bundle.
 */
export function provideOpenViduComponents(config: OpenViduComponentsConfig): EnvironmentProviders {
	return makeEnvironmentProviders([
		{ provide: OPENVIDU_COMPONENTS_CONFIG, useValue: config },
		{ provide: OverlayContainer, useExisting: CdkOverlayContainer },
		provideTranslations(MEETING_TRANSLATIONS)
	]);
}
