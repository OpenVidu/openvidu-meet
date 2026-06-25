import { Injector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { App } from '../app';
import { createOpenViduMeetElementClass } from './wrapper';

/** Tag name registered for the OpenVidu Meet custom element. */
const TAG_NAME = 'openvidu-meet';

/**
 * Registers `<openvidu-meet>` once an application Injector is available.
 *
 * Called from both bootstrap entry points (`main.ts` for the dev SPA harness,
 * `main.wc.ts` for the published WebComponent bundle). Re-entry is safe: the
 * tag is only defined the first time.
 */
export function registerOpenViduMeetElement(injector: Injector): void {
	if (customElements.get(TAG_NAME)) return;

	const NgElementConstructor = createCustomElement(App, { injector });
	const ElementClass = createOpenViduMeetElementClass(NgElementConstructor as CustomElementConstructor);
	customElements.define(TAG_NAME, ElementClass);
}
