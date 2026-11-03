import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createLiveAnnouncerElement, MEET_APP_ID, moveMeetBodyNodes } from '../../src/app/shadow-dom/body-nodes';

// A host page using the CDK appends the same two kinds of nodes to `document.body` as Meet does; only
// Meet's may move into its shadow root.
describe('moveMeetBodyNodes', () => {
	let shadowRoot: ShadowRoot;
	let liveAnnouncerElement: HTMLElement;
	let stop: () => void;

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
		liveAnnouncerElement = createLiveAnnouncerElement(document);
		document.body.append(hostLiveRegion(), descriptionContainer('ng'));

		stop = moveMeetBodyNodes(document, shadowRoot, liveAnnouncerElement);
	});

	afterEach(() => stop());

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
