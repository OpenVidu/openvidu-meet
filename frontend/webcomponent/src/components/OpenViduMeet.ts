import { WebComponentCommand } from '../models/command.model';
import { InboundCommandMessage } from '../models/message.type';
import { CommandsManager } from './CommandsManager';
import { EventsManager } from './EventsManager';
import styles from '../assets/css/styles.css';
import { WebComponentEvent } from '../models/event.model';

/**
 * The `OpenViduMeet` web component provides an interface for embedding an OpenVidu Meet room within a web page.
 * It allows for dynamic configuration through attributes and provides methods to interact with the OpenVidu Meet.
 *
 * @example
 * ```html
 * <openvidu-meet roomUrl="https://your-openvidu-server.com/room"></openvidu-meet>
 * ```
 *
 * @attribute roomUrl - The base URL of the OpenVidu Meet room. This attribute is required.
 *
 * @public
 */
export class OpenViduMeet extends HTMLElement {
	/**
	 * A reference to the HTML iframe element used within the OpenViduMeet component.
	 * This iframe is likely used to embed external content or another web page.
	 *
	 * @private
	 * @type {HTMLIFrameElement}
	 */
	private iframe: HTMLIFrameElement;
	private commandsManager: CommandsManager;
	private eventsManager: EventsManager;
	//!FIXME: Insecure by default
	private allowedOrigin: string = '*';
	private loadTimeout: any;
	private iframeLoaded = false;
	private errorMessage: string | null = null;
	/**
	 * A map to store event handlers for different events.
	 * This allows for dynamic event handling and can be used to add or remove event listeners.
	 *
	 * @private
	 * @type {Map<string, Set<Function>>}
	 */
	private eventHandlers: Map<string, Set<Function>> = new Map();

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.iframe = document.createElement('iframe');
		this.iframe.setAttribute(
			'allow',
			'camera; microphone; display-capture; fullscreen; autoplay; compute-pressure;'
		);

		this.commandsManager = new CommandsManager(this.iframe, this.allowedOrigin);
		this.eventsManager = new EventsManager(this);

		// Listen for changes in attributes to update the iframe src
		const observer = new MutationObserver(() => this.updateIframeSrc());
		observer.observe(this, { attributes: true });
	}

	connectedCallback() {
		this.render();
		this.eventsManager.listen();
		this.updateIframeSrc();
	}

	disconnectedCallback() {
		// Clean up resources
		if (this.loadTimeout) {
			clearTimeout(this.loadTimeout);
		}
		this.eventsManager.cleanup();
	}

	/**
	 * Renders the Web Component in the shadow DOM
	 */
	private render() {
		// Add styles
		const styleElement = document.createElement('style');
		styleElement.textContent = styles;
		this.shadowRoot?.appendChild(styleElement);

		if (this.errorMessage) {
			const errorContainer = document.createElement('div');
			errorContainer.className = 'error-container';

			const errorIcon = document.createElement('div');
			errorIcon.className = 'error-icon';
			errorIcon.textContent = '⚠️';

			const errorMessageEl = document.createElement('div');
			errorMessageEl.className = 'error-message';
			errorMessageEl.textContent = this.errorMessage;

			errorContainer.appendChild(errorIcon);
			errorContainer.appendChild(errorMessageEl);
			this.shadowRoot?.appendChild(errorContainer);
		} else {
			// Configure the iframe and Add it to the DOM
			this.setupIframe();
			this.shadowRoot?.appendChild(this.iframe);
		}
	}

	/**
	 * Sets up the iframe with error handlers and loading timeout
	 */
	private setupIframe() {
		// Clear any previous timeout
		if (this.loadTimeout) {
			clearTimeout(this.loadTimeout);
		}

		// Reset states
		this.iframeLoaded = false;

		// Set up load handlers
		this.iframe.onload = (event: Event) => {
			const message: InboundCommandMessage = {
				command: WebComponentCommand.INITIALIZE,
				payload: { domain: window.location.origin }
			};
			this.commandsManager.sendMessage(message);
			this.iframeLoaded = true;
			clearTimeout(this.loadTimeout);
			this.loadTimeout = null;
			this.iframe.onload = null;
		};
		// this.iframe.onload = this.handleIframeLoaded.bind(this);
		this.iframe.onerror = (event: Event | string) => {
			console.error('Iframe error:', event);
			clearTimeout(this.loadTimeout);
			this.showErrorState('Failed to load meeting');
		};

		// Set loading timeout
		this.loadTimeout = setTimeout(() => {
			if (!this.iframeLoaded) this.showErrorState('Loading timed out');
		}, 10_000);
	}

	private updateIframeSrc() {
		const baseUrl = this.getAttribute('room-url') || '';
		if (!baseUrl) {
			console.error('The "room-url" attribute is required.');
			return;
		}

		const url = new URL(baseUrl);
		this.allowedOrigin = url.origin;
		this.commandsManager.setAllowedOrigin(this.allowedOrigin);

		// Update query params
		Array.from(this.attributes).forEach((attr) => {
			if (attr.name !== 'room-url') {
				url.searchParams.set(attr.name, attr.value);
			}
		});

		this.iframe.src = url.toString();
	}

	/**
	 * Shows error state in the component UI
	 */
	private showErrorState(message: string) {
		this.errorMessage = message;
		// Re-render to show error state
		while (this.shadowRoot?.firstChild) {
			this.shadowRoot.removeChild(this.shadowRoot.firstChild);
		}
		this.render();
	}

	/**
	 * Subscribe to an event
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public on(eventName: string, callback: (detail: any) => void): this {
		if (!(Object.values(WebComponentEvent) as string[]).includes(eventName)) {
			console.warn(`Event "${eventName}" is not supported.`);
			return this;
		}

		// Create event listener that will call the callback
		const listener = ((event: CustomEvent) => {
			callback(event.detail);
		}) as EventListener;

		// Store reference to original callback for off() method
		if (!this.eventHandlers.has(eventName)) {
			this.eventHandlers.set(eventName, new Set());
		}

		// Store both the callback and listener to match them later
		const handlers = this.eventHandlers.get(eventName);
		// @ts-ignore - To store both values together
		callback._listener = listener;
		handlers?.add(callback);

		// Register with standard DOM API

		this.addEventListener(eventName, listener);

		return this;
	}

	/**
	 * Subscribe to an event that will be triggered only once
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public once(eventName: string, callback: (detail: any) => void): this {
		if (!(Object.values(WebComponentEvent) as string[]).includes(eventName)) {
			console.warn(`Event "${eventName}" is not supported.`);
			return this;
		}

		// Create a wrapper that will call the callback and then unsubscribe
		const wrapperCallback = (detail: any) => {
			// Unsubscribe first to prevent any possibility of duplicate calls
			this.off(eventName, wrapperCallback);
			// Call the original callback
			callback(detail);
		};

		this.on(eventName, wrapperCallback);

		return this;
	}

	/**
	 * Unsubscribe from an event
	 * @param eventName Name of the event to stop listening for
	 * @param callback Optional callback to remove (if not provided, removes all handlers for this event)
	 * @returns The component instance for chaining
	 */
	public off(eventName: string, callback?: (detail: any) => void): this {
		if (!callback) {
			// Remove all handlers for this event
			const handlers = this.eventHandlers.get(eventName);
			if (handlers) {
				handlers.forEach((handler) => {
					// @ts-ignore - Access stored listener
					this.removeEventListener(eventName, handler._listener);
				});
				handlers.clear();
			}
		} else {
			// Remove specific handler
			const handlers = this.eventHandlers.get(eventName);
			if (handlers && handlers.has(callback)) {
				// @ts-ignore - Access stored listener
				this.removeEventListener(eventName, callback._listener);
				handlers.delete(callback);
			}
		}

		return this;
	}

	// ---- WebComponent Commands ----
	// These methods send commands to the OpenVidu Meet iframe.

	public endMeeting() {
		const message: InboundCommandMessage = { command: WebComponentCommand.END_MEETING };
		this.commandsManager.sendMessage(message);
	}

	public leaveRoom() {
		const message: InboundCommandMessage = { command: WebComponentCommand.LEAVE_ROOM };
		this.commandsManager.sendMessage(message);
	}

	// public toggleChat() {
	// 	const message: ParentMessage = { action: WebComponentActionType.TOGGLE_CHAT };
	// 	this.commandsManager.sendMessage(message);
	// }
}
