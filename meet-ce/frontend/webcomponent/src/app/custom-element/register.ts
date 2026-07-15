import { Injector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { App } from '../app';
import { createOpenViduMeetElementClass } from './wrapper';

/** Default tag name registered for the OpenVidu Meet custom element. */
const DEFAULT_TAG_NAME = 'openvidu-meet';

/**
 * Registers the OpenVidu Meet custom element once an application Injector is available.
 *
 * Called from three entry points: `main.ts` (dev SPA harness) and `main.wc.ts`
 * (published bundle) register the public `openvidu-meet` tag; the lazy-loading
 * loader (`main.loader.ts`) reuses the same bundle to register the internal
 * `openvidu-meet-impl` tag, which it then wraps. Re-entry is safe: a given tag
 * is only defined the first time.
 */
export const registerOpenViduMeetElement = (injector: Injector, tagName: string = DEFAULT_TAG_NAME): void => {
	if (customElements.get(tagName)) return;

	const NgElementConstructor = createCustomElement(App, { injector });
	const ElementClass = createOpenViduMeetElementClass(NgElementConstructor as CustomElementConstructor);
	customElements.define(tagName, ElementClass);
};
