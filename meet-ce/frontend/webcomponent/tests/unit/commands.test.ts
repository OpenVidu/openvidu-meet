import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { WebComponentCommand, WebComponentEvent } from '@openvidu-meet/typings';
import { CommandsManager } from '../../src/components/CommandsManager';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';

describe('OpenViduMeet WebComponent Commands', () => {
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

	// setTargetOrigin should update the internal target origin used when sending messages
	it('should update allowedOrigin when setAllowedOrigin is called', () => {
		const testOrigin = 'https://example.com';
		commandsManager.setTargetOrigin(testOrigin);

		// Check if it was updated
		expect(commandsManager['targetIframeOrigin']).toBe(testOrigin);
		expect((component as any).commandsManager.targetIframeOrigin).toBe(testOrigin);
	});

	// initialize() should send an INITIALIZE command with the current window origin
	it('should send initialize command with initialize()', () => {
		const spy = jest.spyOn(commandsManager as any, 'sendMessage');

		const testOrigin = 'https://example.com';
		Object.defineProperty(window, 'location', {
			value: { origin: testOrigin },
			writable: true
		});

		commandsManager.initialize();
		expect(spy).toHaveBeenCalledWith({
			command: WebComponentCommand.INITIALIZE,
			payload: { domain: testOrigin }
		});
	});

	// on() should register a listener on the component and invoke the callback when event is dispatched
	it('should subscribe and trigger event with on()', () => {
		const callback = jest.fn();
		commandsManager.on(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, { detail: { foo: 'bar' } });
		component.dispatchEvent(event);

		expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
	});

	// on() should ignore unsupported event types and not trigger callbacks
	it('should not subscribe unsupported events with on()', () => {
		const callback = jest.fn();
		commandsManager.on(component, 'not-supported' as any, callback);

		const event = new CustomEvent('not-supported', { detail: { foo: 'bar' } });
		component.dispatchEvent(event);

		expect(callback).not.toHaveBeenCalled();
	});

	// once() should register a handler that runs only the first time the event occurs
	it('should subscribe and trigger event only once with once()', () => {
		const callback = jest.fn();
		commandsManager.once(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, { detail: 123 });
		component.dispatchEvent(event);
		component.dispatchEvent(event);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(123);
	});

	// off() with a specific handler should remove just that handler for the event
	it('should unsubscribe a specific handler with off()', () => {
		const callback = jest.fn();
		commandsManager.on(component, WebComponentEvent.READY, callback);

		commandsManager.off(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, {});
		component.dispatchEvent(event);

		expect(callback).not.toHaveBeenCalled();
	});

	// off() without a handler should remove all handlers for the provided event
	it('should unsubscribe all handlers for an event with off()', () => {
		const cb1 = jest.fn();
		const cb2 = jest.fn();
		commandsManager.on(component, WebComponentEvent.READY, cb1);
		commandsManager.on(component, WebComponentEvent.READY, cb2);

		commandsManager.off(component, WebComponentEvent.READY);

		const event = new CustomEvent(WebComponentEvent.READY, {});
		component.dispatchEvent(event);

		expect(cb1).not.toHaveBeenCalled();
		expect(cb2).not.toHaveBeenCalled();
	});

	// Component.leaveRoom() should delegate to commandsManager.leaveRoom and send a LEAVE_ROOM command
	it('should call commandsManager.leaveRoom when leaveRoom is called', () => {
		const leaveRoomSpy = jest.spyOn(component['commandsManager'], 'leaveRoom');
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.leaveRoom();

		expect(leaveRoomSpy).toHaveBeenCalled();
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({ command: WebComponentCommand.LEAVE_ROOM });
	});

	// Component.endMeeting() should delegate to commandsManager.endMeeting and send END_MEETING
	it('should call commandsManager.endMeeting when endMeeting is called', () => {
		const endMeetingSpy = jest.spyOn(component['commandsManager'], 'endMeeting');
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.endMeeting();

		expect(endMeetingSpy).toHaveBeenCalled();
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({ command: WebComponentCommand.END_MEETING });
	});

	// Component.kickParticipant(identity) should call manager and send KICK_PARTICIPANT with payload
	it('should call commandsManager.kickParticipant when kickParticipant is called', () => {
		const participantIdentity = 'test-participant';
		const kickParticipantSpy = jest.spyOn(component['commandsManager'], 'kickParticipant');
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.kickParticipant(participantIdentity);

		expect(kickParticipantSpy).toHaveBeenCalledWith(participantIdentity);
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({
			command: WebComponentCommand.KICK_PARTICIPANT,
			payload: { participantIdentity }
		});
	});

	// sendMessage should postMessage to iframe.contentWindow using the configured target origin
	it('should send message to iframe with correct origin', () => {
		// Mock iframe contentWindow and postMessage
		const mockPostMessage = jest.fn();
		const iframe = component.shadowRoot?.querySelector('iframe');

		// Mock the contentWindow
		Object.defineProperty(iframe, 'contentWindow', {
			value: { postMessage: mockPostMessage },
			writable: true
		});

		// Set allowed origin
		const testOrigin = 'https://example.com';
		(component as any).commandsManager.setTargetOrigin(testOrigin);

		// Send a message
		(component as any).commandsManager.sendMessage({ command: 'TEST' });

		// Check if postMessage was called correctly
		expect(mockPostMessage).toHaveBeenCalledWith({ command: 'TEST' }, testOrigin);
	});
});
