import { CommandsManager } from './CommandsManager';
import { EventsManager } from './EventsManager';
import { WebComponentEvent, WebComponentProperty } from '@openvidu-meet/typings';
import styles from '../assets/css/styles.css';

/**
 * The `OpenViduMeet` web component provides an interface for embedding an OpenVidu Meet room within a web page.
 * It can also be used to view a recording of a meeting.
 * It allows for dynamic configuration through attributes and provides methods to interact with OpenVidu Meet.
 *
 * @example
 * ```html
 * <openvidu-meet room-url="https://your-openvidu-server.com/room"></openvidu-meet>
 * ```
 *
 * @attribute room-url - The base URL of the OpenVidu Meet room. This attribute is required unless `recording-url` is provided.
 * @attribute recording-url - The URL of a recording to view. If this is provided, the `room-url` is not required.
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
	private targetIframeOrigin: string = '*';
	private loadTimeout: any;
	private iframeLoaded = false;
	private errorMessage: string | null = null;

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.iframe = document.createElement('iframe');
		this.iframe.setAttribute(
			'allow',
			'camera; microphone; display-capture; fullscreen; autoplay; compute-pressure;'
		);

		this.commandsManager = new CommandsManager(this.iframe, this.targetIframeOrigin);
		this.eventsManager = new EventsManager(this, this.targetIframeOrigin);

		// Listen for changes in attributes to update the iframe src
		const observer = new MutationObserver(() => this.updateIframeSrc());
		observer.observe(this, { attributes: true });
	}

	connectedCallback() {
		// Send initialization message to the iframe
		// after READY event from the iframe is received
		this.once(WebComponentEvent.READY, () => this.commandsManager.initialize());
		this.eventsManager.listen();
		this.render();
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
			this.iframeLoaded = true;
			clearTimeout(this.loadTimeout);
			this.loadTimeout = null;
			this.iframe.onload = null;
		};

		// Handle iframe errors
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
		const baseUrl =
			this.getAttribute(WebComponentProperty.ROOM_URL) || this.getAttribute(WebComponentProperty.RECORDING_URL);
		if (!baseUrl) {
			console.error(
				`The "${WebComponentProperty.ROOM_URL}" or "${WebComponentProperty.RECORDING_URL}" attribute is required.`
			);
			return;
		}

		const url = new URL(baseUrl);
		this.targetIframeOrigin = url.origin;
		this.commandsManager.setTargetOrigin(this.targetIframeOrigin);
		this.eventsManager.setTargetOrigin(this.targetIframeOrigin);

		// Update query params
		Array.from(this.attributes).forEach((attr) => {
			if (attr.name !== WebComponentProperty.ROOM_URL && attr.name !== WebComponentProperty.RECORDING_URL) {
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

	// ---- WebComponent Commands ----
	// These methods send commands to the iframe.

	/**
	 * Subscribe to an event
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public on(eventName: WebComponentEvent, callback: (detail: any) => void): this {
		this.commandsManager.on(this, eventName, callback);
		return this;
	}

	/**
	 * Subscribe to an event that will be triggered only once
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public once(eventName: WebComponentEvent, callback: (detail: any) => void): this {
		this.commandsManager.once(this, eventName, callback);
		return this;
	}

	/**
	 * Unsubscribe from an event
	 * @param eventName Name of the event to stop listening for
	 * @param callback Optional callback to remove (if not provided, removes all handlers for this event)
	 * @returns The component instance for chaining
	 */
	public off(eventName: WebComponentEvent, callback?: (detail: any) => void): this {
		this.commandsManager.off(this, eventName, callback);
		return this;
	}

	/**
	 * Ends the current meeting by delegating the action to the commands manager.
	 * This method should be called when the user wants to terminate the ongoing session.
	 */
	public endMeeting() {
		this.commandsManager.endMeeting();
	}

	/**
	 * Leaves the current video conference room.
	 */
	public leaveRoom() {
		this.commandsManager.leaveRoom();
	}

	/**
	 * Kicks a participant from the meeting.
	 * @param participantIdentity The identity of the participant to kick
	 */
	public kickParticipant(participantIdentity: string) {
		this.commandsManager.kickParticipant(participantIdentity);
	}
}
