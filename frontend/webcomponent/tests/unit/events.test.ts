import { describe, it, expect, jest } from '@jest/globals';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import { EventsManager } from '../../src/components/EventsManager';
import '../../src/index';

describe('Web Component Events', () => {
	let component: OpenViduMeet;
	let eventsManager: EventsManager;
	const allowedOrigin = 'http://example.com';

	beforeEach(() => {
		component = document.createElement('openvidu-meet') as OpenViduMeet;
		eventsManager = new EventsManager(component);
		document.body.appendChild(component);
	});

	afterEach(() => {
		document.body.removeChild(component);
		document.body.innerHTML = '';
	});

	it('should register message event listener on connection', () => {
		const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

		// Call connectedCallback again (even though it was called when created)
		(component as any).connectedCallback();

		expect(addEventListenerSpy).toHaveBeenCalledWith('message', expect.any(Function));
	});

	it('should ignore invalid messages', () => {
		const dispatchEventSpy = jest.spyOn(component, 'dispatchEvent');
		const event = new MessageEvent('message', {
			origin: allowedOrigin,
			data: { invalid: 'data' }
		});

		(eventsManager as any).handleMessage(event);

		expect(dispatchEventSpy).not.toHaveBeenCalled();
	});

	// TODO: Add test for leave room event
});
