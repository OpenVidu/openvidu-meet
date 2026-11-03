/**
 * Meet's application id. The CDK writes it into the ids of the descriptions it appends to
 * `document.body`, which tells Meet's description container apart from one of a host page that
 * uses the CDK too.
 */
export const MEET_APP_ID = 'openvidu-meet';

/**
 * Meet's live announcer region, created detached so the CDK never makes its own in `document.body`
 * (making one removes every other on the page, the host's included).
 */
export const createLiveAnnouncerElement = (document: Document): HTMLElement => {
	const element = document.createElement('div');
	element.classList.add('cdk-live-announcer-element', 'cdk-visually-hidden');
	element.setAttribute('aria-atomic', 'true');
	element.setAttribute('aria-live', 'polite');
	return element;
};

const isMeetDescriptionContainer = (node: Node): node is Element =>
	node instanceof Element &&
	node.matches('.cdk-describedby-message-container') &&
	!!node.querySelector(`[id^="cdk-describedby-message-${MEET_APP_ID}-"]`);

/**
 * Moves Meet's accessibility nodes into the shadow root, where the styles that hide them reach, and
 * keeps moving the ones the CDK appends to `document.body` later. The host page's own nodes stay
 * where they are. Returns the function that stops watching.
 */
export const moveMeetBodyNodes = (
	document: Document,
	shadowRoot: ShadowRoot,
	liveAnnouncerElement: HTMLElement | null
): (() => void) => {
	if (liveAnnouncerElement) {
		shadowRoot.appendChild(liveAnnouncerElement);
	}

	const rehost = (node: Node): void => {
		if (isMeetDescriptionContainer(node)) {
			shadowRoot.appendChild(node);
		}
	};

	Array.from(document.body.children).forEach(rehost);

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			mutation.addedNodes.forEach(rehost);
		}
	});

	observer.observe(document.body, { childList: true });
	return () => observer.disconnect();
};
