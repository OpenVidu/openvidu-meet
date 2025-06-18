import { WebComponentCommand } from '../typings/ce/command.model';
import { WebComponentEvent } from '../typings/ce/event.model';
import { WebComponentInboundCommandMessage } from '../typings/ce/message.type';

/**
 * Manages communication between a parent application and an embedded iframe
 * for the OpenVidu Meet web component. The `CommandsManager` facilitates sending commands to the iframe,
 * subscribing to and unsubscribing from custom events, and managing allowed origins for secure messaging.
 *
 * @public
 */
export class CommandsManager {
	private iframe: HTMLIFrameElement;
	/**
	 * The origin of the iframe content that messages will be sent to.
	 * Used as the 'targetOrigin' parameter in postMessage calls.
	 * Initially set to '*' (insecure) until the actual iframe URL is loaded.
	 *
	 * SECURITY NOTE: The value '*' should be replaced with the actual origin
	 * as soon as possible using setTargetOrigin().
	 */
	private targetIframeOrigin: string;
	/**
	 * A map to store event handlers for different events.
	 * This allows for dynamic event handling and can be used to add or remove event listeners.
	 *
	 * @private
	 * @type {Map<string, Set<Function>>}
	 */
	private eventHandlers: Map<string, Set<Function>> = new Map();

	/**
	 * Creates a new CommandsManager instance
	 *
	 * @param iframe - The iframe element used for communication
	 * @param initialTargetOrigin - The initial target origin for postMessage
	 */
	constructor(iframe: HTMLIFrameElement, initialTargetOrigin: string) {
		this.iframe = iframe;
		this.targetIframeOrigin = initialTargetOrigin;
	}

	/**
	 * Initializes the command manager by sending an `INITIALIZE` command message.
	 * The message payload includes the current domain (`window.location.origin`).
	 * This method is typically called to set up the initial state or configuration
	 * required for the web component to function properly.
	 *
	 * @private
	 */
	public initialize() {
		const message: WebComponentInboundCommandMessage = {
			command: WebComponentCommand.INITIALIZE,
			payload: { domain: window.location.origin }
		};
		this.sendMessage(message);
	}

	/**
	 * Subscribe to an event
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public on(element: HTMLElement, eventName: WebComponentEvent, callback: (detail: any) => void): this {
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

		element.addEventListener(eventName, listener);

		return this;
	}

	/**
	 * Subscribe to an event that will be triggered only once
	 * @param eventName Name of the event to listen for
	 * @param callback Function to be called when the event is triggered
	 * @returns The component instance for chaining
	 */
	public once(element: HTMLElement, eventName: WebComponentEvent, callback: (detail: any) => void): this {
		if (!(Object.values(WebComponentEvent) as string[]).includes(eventName)) {
			console.warn(`Event "${eventName}" is not supported.`);
			return this;
		}

		// Create a wrapper that will call the callback and then unsubscribe
		const wrapperCallback = (detail: any) => {
			// Unsubscribe first to prevent any possibility of duplicate calls
			this.off(element, eventName, wrapperCallback);
			// Call the original callback
			callback(detail);
		};

		this.on(element, eventName, wrapperCallback);

		return this;
	}

	/**
	 * Unsubscribe from an event
	 * @param eventName Name of the event to stop listening for
	 * @param callback Optional callback to remove (if not provided, removes all handlers for this event)
	 * @returns The component instance for chaining
	 */
	public off(element: HTMLElement, eventName: WebComponentEvent, callback?: (detail: any) => void): this {
		if (!callback) {
			// Remove all handlers for this event
			const handlers = this.eventHandlers.get(eventName);
			if (handlers) {
				handlers.forEach((handler) => {
					// @ts-ignore - To match the stored listener
					element.removeEventListener(eventName, handler._listener);
				});
				handlers.clear();
			}
		} else {
			// Remove specific handler
			const handlers = this.eventHandlers.get(eventName);
			if (handlers && handlers.has(callback)) {
				// @ts-ignore - To match the stored listener
				element.removeEventListener(eventName, callback._listener);
				handlers.delete(callback);
			}
		}

		return this;
	}

	public endMeeting() {
		const message: WebComponentInboundCommandMessage = { command: WebComponentCommand.END_MEETING };
		this.sendMessage(message);
	}

	public leaveRoom() {
		const message: WebComponentInboundCommandMessage = { command: WebComponentCommand.LEAVE_ROOM };
		this.sendMessage(message);
	}

	// public toggleChat() {
	// 	const message: ParentMessage = { action: WebComponentActionType.TOGGLE_CHAT };
	// 	this.commandsManager.sendMessage(message);
	// }

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

	/**
	 * Sends a message to the iframe using window.postMessage
	 *
	 * @param message - The message to send to the iframe
	 * @param explicitTargetOrigin - Optional override for the target origin
	 */
	private sendMessage(message: WebComponentInboundCommandMessage, explicitTargetOrigin?: string): void {
		explicitTargetOrigin = explicitTargetOrigin || this.targetIframeOrigin;
		this.iframe.contentWindow?.postMessage(message, explicitTargetOrigin);
	}
}
