import { WebComponentOutboundEventMessage } from '../typings/ce/message.type';

export class EventsManager {
	private element: HTMLElement;
	private targetIframeOrigin: string;

	constructor(element: HTMLElement, initialTargetOrigin: string) {
		this.element = element;
		this.targetIframeOrigin = initialTargetOrigin;
	}

	/**
	 * Updates the target origin used when sending messages to the iframe.
	 * This should be called once the iframe URL is known to improve security.
	 *
	 * @param newOrigin - The origin of the content loaded in the iframe
	 *                    (e.g. 'https://meet.example.com')
	 */
	public setTargetOrigin(newOrigin: string): void {
		this.targetIframeOrigin = newOrigin;
	}

	public listen() {
		window.addEventListener('message', this.handleMessage.bind(this));
	}

	public cleanup() {
		window.removeEventListener('message', this.handleMessage);
	}

	private handleMessage(event: MessageEvent) {
		const message: WebComponentOutboundEventMessage = event.data;
		// Validate message origin (security measure)
		if (event.origin !== this.targetIframeOrigin) {
			console.warn('Message from unknown origin:', event.origin);
			return;
		}

		if (!message || !message.event) {
			return;
		}

		this.dispatchEvent(message);
	}

	private dispatchEvent(message: WebComponentOutboundEventMessage) {
		const event = new CustomEvent(message.event, {
			detail: message.payload,
			bubbles: true,
			composed: true
		});
		this.element.dispatchEvent(event);
	}
}
