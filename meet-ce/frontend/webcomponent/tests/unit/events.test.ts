import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventsManager } from '../../src/components/EventsManager';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';

describe('OpenViduMeet WebComponent Events', () => {
	const testOrigin = 'http://example.com';

	let component: OpenViduMeet;
	let eventsManager: EventsManager;

	beforeEach(() => {
		component = document.createElement('openvidu-meet') as OpenViduMeet;
		eventsManager = component['eventsManager'] as EventsManager;
		document.body.appendChild(component);
	});

	afterEach(() => {
		document.body.removeChild(component);
		document.body.innerHTML = '';
	});

	it('should update allowedOrigin when setAllowedOrigin is called', () => {
		eventsManager.setTargetOrigin(testOrigin);

		// Check if it was updated
		expect((eventsManager as any).targetIframeOrigin).toBe(testOrigin);
		expect((component as any).eventsManager.targetIframeOrigin).toBe(testOrigin);
	});

	it('should register message event listener on connection', () => {
		const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

		// Call connectedCallback again (even though it was called when created)
		(component as any).connectedCallback();
		expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
	});

	it('should ignore invalid messages', () => {
		eventsManager.setTargetOrigin(testOrigin);
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');
		const event = new MessageEvent('message', {
			origin: testOrigin,
			data: { invalid: 'data' }
		});

		(eventsManager as any).handleMessage(event);
		expect(dispatchEventSpy).not.toHaveBeenCalled();
	});

	it('should ignore messages from unknown origins', () => {
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');
		const event = new MessageEvent('message', {
			origin: 'https://not-allowed.com',
			data: { event: 'ready', payload: {} }
		});

		(eventsManager as any).handleMessage(event);
		expect(dispatchEventSpy).not.toHaveBeenCalled();
	});

	it('should dispatch event for valid messages from allowed origin', () => {
		eventsManager.setTargetOrigin(testOrigin);
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');
		const event = new MessageEvent('message', {
			origin: testOrigin,
			data: { event: 'ready', payload: { foo: 'bar' } }
		});

		(eventsManager as any).handleMessage(event);
		expect(dispatchEventSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'ready',
				detail: { foo: 'bar' }
			})
		);
	});

	it('should ignore messages without an event property', () => {
		eventsManager.setTargetOrigin(testOrigin);
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');
		const event = new MessageEvent('message', {
			origin: testOrigin,
			data: { payload: {} }
		});

		(eventsManager as any).handleMessage(event);
		expect(dispatchEventSpy).not.toHaveBeenCalled();
	});

	it('should remove message event listener on cleanup', () => {
		const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
		eventsManager.cleanup();
		expect(removeEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
	});
});
