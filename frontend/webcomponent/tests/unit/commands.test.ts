import { describe, expect, it, jest } from '@jest/globals';
import { CommandsManager } from '../../src/components/CommandsManager';
import { OpenViduMeet } from '../../src/components/OpenViduMeet';
import '../../src/index';
import { WebComponentCommand } from '../../src/typings/ce/command.model';
import { WebComponentEvent } from '../../src/typings/ce/event.model';

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

	it('should update allowedOrigin when setAllowedOrigin is called', () => {
		const testOrigin = 'https://example.com';
		commandsManager.setTargetOrigin(testOrigin);

		// Check if it was updated
		expect(commandsManager['targetIframeOrigin']).toBe(testOrigin);
		expect((component as any).commandsManager.targetIframeOrigin).toBe(testOrigin);
	});

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

	it('should subscribe and trigger event with on()', () => {
		const callback = jest.fn();
		commandsManager.on(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, { detail: { foo: 'bar' } });
		component.dispatchEvent(event);

		expect(callback).toHaveBeenCalledWith({ foo: 'bar' });
	});

	it('should not subscribe unsupported events with on()', () => {
		const callback = jest.fn();
		commandsManager.on(component, 'not-supported' as any, callback);

		const event = new CustomEvent('not-supported', { detail: { foo: 'bar' } });
		component.dispatchEvent(event);

		expect(callback).not.toHaveBeenCalled();
	});

	it('should subscribe and trigger event only once with once()', () => {
		const callback = jest.fn();
		commandsManager.once(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, { detail: 123 });
		component.dispatchEvent(event);
		component.dispatchEvent(event);

		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback).toHaveBeenCalledWith(123);
	});

	it('should unsubscribe a specific handler with off()', () => {
		const callback = jest.fn();
		commandsManager.on(component, WebComponentEvent.READY, callback);

		commandsManager.off(component, WebComponentEvent.READY, callback);

		const event = new CustomEvent(WebComponentEvent.READY, {});
		component.dispatchEvent(event);

		expect(callback).not.toHaveBeenCalled();
	});

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

	it('should call commandsManager.leaveRoom when leaveRoom is called', () => {
		const leaveRoomSpy = jest.spyOn(component['commandsManager'], 'leaveRoom');
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.leaveRoom();

		expect(leaveRoomSpy).toHaveBeenCalled();
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({ command: WebComponentCommand.LEAVE_ROOM });
	});

	it('should call commandsManager.endMeeting when endMeeting is called', () => {
		const endMeetingSpy = jest.spyOn(component['commandsManager'], 'endMeeting');
		const sendMessageSpy = jest.spyOn(commandsManager, 'sendMessage' as keyof CommandsManager);
		component.endMeeting();

		expect(endMeetingSpy).toHaveBeenCalled();
		expect(sendMessageSpy).toHaveBeenCalledTimes(1);
		expect(sendMessageSpy).toHaveBeenCalledWith({ command: WebComponentCommand.END_MEETING });
	});

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
