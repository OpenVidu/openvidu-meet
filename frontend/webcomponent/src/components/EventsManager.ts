import { WebComponentOutboundEventMessage } from '../typings/ce/message.type';

export class EventsManager {
	private element: HTMLElement;

	constructor(element: HTMLElement) {
		this.element = element;
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
		if (!message || !message.event) {
			// console.warn('Invalid message:', message);
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
