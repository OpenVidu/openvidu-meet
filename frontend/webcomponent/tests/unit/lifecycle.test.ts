import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CommandsManager } from '../../src/components/CommandsManager';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';
import { WebComponentCommand } from '../../src/typings/ce/command.model';

describe('OpenViduMeet Event Handling', () => {
	const testOrigin = window.location.origin;

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

	it('should call sendMessage when READY event is received', () => {
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);

		(component as any).eventsManager.setTargetOrigin(testOrigin);

		// Mock a message event
		const readyEvent = new MessageEvent('message', {
			data: { event: 'READY' },
			origin: testOrigin
		});
		window.dispatchEvent(readyEvent);

		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({
			command: WebComponentCommand.INITIALIZE,
			payload: { domain: testOrigin }
		});

		// Check if sendMessage was not called again
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
	});

	it('should dispatch custom events when receiving messages', () => {
		// Create a spy for dispatchEvent
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');

		(component as any).eventsManager.setTargetOrigin(testOrigin);

		// Mock a message event
		const messageEvent = new MessageEvent('message', {
			data: {
				event: 'test-event',
				payload: { foo: 'bar' }
			},
			origin: testOrigin
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
		const roomUrl = 'https://example.com/room/testRoom-123?secret=123456';
		component.setAttribute('room-url', roomUrl);
		component.setAttribute('participant-name', 'testUser');

		// Trigger update
		(component as any).updateIframeSrc();

		// Check iframe src
		const iframe = component.shadowRoot?.querySelector('iframe');
		const src = iframe?.src;

		expect(src).toContain(roomUrl);
		expect(src).toContain('participant-name=testUser');
	});
});
