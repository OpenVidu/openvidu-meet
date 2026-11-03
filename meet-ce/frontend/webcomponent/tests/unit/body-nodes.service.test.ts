import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import '@angular/compiler';
import { LIVE_ANNOUNCER_ELEMENT_TOKEN } from '@angular/cdk/a11y';
import { DestroyRef, DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import {
	createLiveAnnouncerElement,
	MEET_APP_ID,
	ShadowBodyNodesService
} from '../../src/app/shadow-dom/body-nodes.service';

// A host page using the CDK appends the same two kinds of nodes to `document.body` as Meet does; only
// Meet's may move into its shadow root.
describe('ShadowBodyNodesService', () => {
	let shadowRoot: ShadowRoot;
	let liveAnnouncerElement: HTMLElement;
	let destroy: () => void;

	const descriptionContainer = (appId: string): HTMLElement => {
		const container = document.createElement('div');
		container.className = 'cdk-describedby-message-container cdk-visually-hidden';
		const message = document.createElement('div');
		message.id = `cdk-describedby-message-${appId}-0-0`;
		container.appendChild(message);
		return container;
	};

	const hostLiveRegion = (): HTMLElement => {
		const region = document.createElement('div');
		region.className = 'cdk-live-announcer-element cdk-visually-hidden';
		return region;
	};

	const flushMutations = () => new Promise((resolve) => setTimeout(resolve));

	beforeEach(() => {
		document.body.innerHTML = '';
		shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
		const destroyCallbacks: (() => void)[] = [];
		destroy = () => destroyCallbacks.forEach((callback) => callback());
		const injector = Injector.create({
			providers: [
				{ provide: DOCUMENT, useValue: document },
				{ provide: LIVE_ANNOUNCER_ELEMENT_TOKEN, useFactory: createLiveAnnouncerElement, deps: [] }
			]
		});
		liveAnnouncerElement = injector.get(LIVE_ANNOUNCER_ELEMENT_TOKEN)!;
		const service = runInInjectionContext(injector, () => new ShadowBodyNodesService());
		const hostNodes = [hostLiveRegion(), descriptionContainer('ng')];
		document.body.append(...hostNodes);

		service.rehost(shadowRoot, {
			onDestroy: (callback: () => void) => destroyCallbacks.push(callback)
		} as unknown as DestroyRef);
	});

	afterEach(() => destroy());

	it("puts Meet's live announcer in the shadow root and leaves the host's in the page", () => {
		expect(liveAnnouncerElement.parentNode).toBe(shadowRoot);
		expect(document.body.querySelectorAll('.cdk-live-announcer-element')).toHaveLength(1);
	});

	it("moves Meet's description container and leaves the host's, before and after the mount", async () => {
		const meetContainer = descriptionContainer(MEET_APP_ID);
		const laterHostContainer = descriptionContainer('host-app');
		document.body.append(meetContainer, laterHostContainer);
		await flushMutations();

		expect(meetContainer.parentNode).toBe(shadowRoot);
		expect(laterHostContainer.parentNode).toBe(document.body);
		expect(document.body.querySelectorAll('.cdk-describedby-message-container')).toHaveLength(2);
	});
});
