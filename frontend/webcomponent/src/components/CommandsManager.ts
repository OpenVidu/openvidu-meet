import { WebComponentCommand } from '../models/command.model';
import { WebComponentEvent } from '../models/event.model';
import { InboundCommandMessage } from '../models/message.type';

/**
 * Manages communication between a parent application and an embedded iframe
 * for the OpenVidu Meet web component. The `CommandsManager` facilitates sending commands to the iframe,
 * subscribing to and unsubscribing from custom events, and managing allowed origins for secure messaging.
 *
 * @public
 */
export class CommandsManager {
	private iframe: HTMLIFrameElement;
	private allowedOrigin: string;
	/**
	 * A map to store event handlers for different events.
	 * This allows for dynamic event handling and can be used to add or remove event listeners.
	 *
	 * @private
	 * @type {Map<string, Set<Function>>}
	 */
	private eventHandlers: Map<string, Set<Function>> = new Map();

	constructor(iframe: HTMLIFrameElement, allowedOrigin: string) {
		this.iframe = iframe;
		this.allowedOrigin = allowedOrigin;
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
		const message: InboundCommandMessage = {
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
	public on(element: HTMLElement, eventName: string, callback: (detail: any) => void): this {
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
	public once(element: HTMLElement, eventName: string, callback: (detail: any) => void): this {
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
	public off(element: HTMLElement, eventName: string, callback?: (detail: any) => void): this {
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
		const message: InboundCommandMessage = { command: WebComponentCommand.END_MEETING };
		this.sendMessage(message);
	}

	public leaveRoom() {
		const message: InboundCommandMessage = { command: WebComponentCommand.LEAVE_ROOM };
		this.sendMessage(message);
	}

	// public toggleChat() {
	// 	const message: ParentMessage = { action: WebComponentActionType.TOGGLE_CHAT };
	// 	this.commandsManager.sendMessage(message);
	// }

	/**
	 * Sets the allowed origin for the current instance.
	 *
	 * @param newOrigin - The new origin to be set as allowed.
	 */
	public setAllowedOrigin(newOrigin: string): void {
		this.allowedOrigin = newOrigin;
	}

	private sendMessage(message: InboundCommandMessage, targetOrigin?: string): void {
		targetOrigin = targetOrigin || this.allowedOrigin;
		this.iframe.contentWindow?.postMessage(message, targetOrigin);
	}
}
