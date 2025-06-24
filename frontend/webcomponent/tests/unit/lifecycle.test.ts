import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';
import { WebComponentCommand } from '../../src/typings/ce/command.model';
import { WEBCOMPONENT_ROOM_URL } from '../config';
import { CommandsManager } from '../../src/components/CommandsManager';

describe('OpenViduMeet Event Handling', () => {
	let component: OpenViduMeet;
	let commandsManager: CommandsManager;

	beforeEach(() => {
		component = document.createElement('openvidu-meet') as OpenViduMeet;
		commandsManager = component['commandsManager'] as CommandsManager;
		document.body.appendChild(component);
	});

	afterEach(() => {
		document.body.removeChild(component);
		jest.restoreAllMocks();
		document.body.innerHTML = '';
	});

	it('should be created correctly', () => {
		expect(component).toBeDefined();
		expect(component.shadowRoot).not.toBeNull();
	});

	it('should remove message event listener on disconnection', () => {
		const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

		// Call disconnectedCallback
		(component as any).disconnectedCallback();

		expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
	});

	it('should call sendMessage when READY event is received', () => {
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);

		// Mock a message event
		const readyEvent = new MessageEvent('message', {
			data: { event: 'READY' }
		});
		window.dispatchEvent(readyEvent);

		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({
			command: WebComponentCommand.INITIALIZE,
			payload: { domain: window.location.origin }
		});

		// Check if sendMessage was not called again
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
	});

	it('should dispatch custom events when receiving messages', () => {
		// Create a spy for dispatchEvent
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');

		// Mock a message event
		const messageEvent = new MessageEvent('message', {
			data: {
				event: 'test-event',
				payload: { foo: 'bar' }
			}
		});

		// Manually call the handler
		(component as any).eventsManager.handleMessage(messageEvent);

		// Check if custom event was dispatched
		expect(dispatchEventSpy).toHaveBeenCalled();
		expect(dispatchEventSpy.mock.calls[0][0].type).toBe('test-event');
		expect(dispatchEventSpy.mock.calls[0][0].bubbles).toBe(true);
		expect(dispatchEventSpy.mock.calls[0][0].composed).toBe(true);
		expect((dispatchEventSpy.mock.calls[0][0] as any).detail).toBeInstanceOf(Object);
		expect((dispatchEventSpy.mock.calls[0][0] as any).detail).toHaveProperty('foo');
		expect((dispatchEventSpy.mock.calls[0][0] as any).detail.foo).toBe('bar');
	});

	it('should clean up resources when removed from DOM', () => {
		// Set up spies
		const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');
		const eventsCleanupSpy = jest.spyOn(component['eventsManager'], 'cleanup');

		// Set a load timeout
		(component as any).loadTimeout = setTimeout(() => {}, 1000);

		// Remove from DOM

		(component as any).disconnectedCallback();

		// Check if cleanup was called
		expect(clearTimeoutSpy).toHaveBeenCalled();
		expect(eventsCleanupSpy).toHaveBeenCalled();
	});

	it('should re-render when showing error state', () => {
		document.body.appendChild(component);

		// Get initial render state
		const initialIframe = component.shadowRoot?.querySelector('iframe');
		expect(initialIframe).not.toBeNull();

		// Simulate showing an error
		(component as any).showErrorState('Test error');

		// Check if DOM was re-rendered with error
		const iframe = component.shadowRoot?.querySelector('iframe');
		expect(iframe).toBeNull();

		const errorContainer = component.shadowRoot?.querySelector('.error-container');
		expect(errorContainer).not.toBeNull();
		expect(errorContainer?.querySelector('.error-message')?.textContent).toBe('Test error');
	});

	it('should properly update iframe src with query parameters', () => {
		document.body.appendChild(component);

		// Set attributes
		component.setAttribute('room-url', WEBCOMPONENT_ROOM_URL);
		component.setAttribute('user', 'testUser');
		component.setAttribute('role', 'publisher');
		component.setAttribute('token', 'test-token');

		// Trigger update
		(component as any).updateIframeSrc();

		// Check iframe src
		const iframe = component.shadowRoot?.querySelector('iframe');
		const src = iframe?.src;

		expect(src).toContain(WEBCOMPONENT_ROOM_URL);
		expect(src).toContain('user=testUser');
		expect(src).toContain('role=publisher');
		expect(src).toContain('token=test-token');
	});
});
