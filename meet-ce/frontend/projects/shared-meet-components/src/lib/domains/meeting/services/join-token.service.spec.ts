import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetRoomMemberTokenOptions } from '@openvidu-meet/typings';
import { NavigationErrorReason } from '../../../shared/models/navigation.model';
import { LoggerService } from '../../../shared/services/logger.service';
import { NavigationService } from '../../../shared/services/navigation.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { E2eeService } from '../openvidu-components/services/e2ee/e2ee.service';
import { JoinRequest, JoinTokenService } from './join-token.service';
import { MeetingContextService } from './meeting-context.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

describe('JoinTokenService', () => {
	const ROOM_ID = 'room1';
	const alice: JoinRequest = { participantName: 'Alice', e2eeKey: '', nameTypedByParticipant: true };

	let service: JoinTokenService;
	let roomMemberContext: jasmine.SpyObj<RoomMemberContextService>;
	let e2eeService: jasmine.SpyObj<E2eeService>;
	let setIsActiveMeeting: jasmine.Spy;
	let redirectToErrorPage: jasmine.Spy;

	beforeEach(() => {
		roomMemberContext = jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
			'generateToken',
			'saveParticipantNameToStorage',
			'participantExternalId',
			'participantMetadata'
		]);
		roomMemberContext.generateToken.and.resolveTo('minted-token');
		roomMemberContext.participantExternalId.and.returnValue('ext-1');
		roomMemberContext.participantMetadata.and.returnValue(undefined);

		e2eeService = jasmine.createSpyObj<E2eeService>('E2eeService', ['setE2EEKey', 'encrypt']);
		e2eeService.setE2EEKey.and.resolveTo(undefined);
		// `encrypt` is overloaded (text and bytes); only the display name is encrypted here.
		e2eeService.encrypt.and.callFake((async (value: string) => `encrypted(${value})`) as E2eeService['encrypt']);

		setIsActiveMeeting = jasmine.createSpy('setIsActiveMeeting');
		redirectToErrorPage = jasmine.createSpy('redirectToErrorPage').and.resolveTo(undefined);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: RoomMemberContextService, useValue: roomMemberContext },
				{ provide: E2eeService, useValue: e2eeService },
				{
					provide: MeetingContextService,
					useValue: { roomId: () => ROOM_ID, roomSecret: () => 'secret', setIsActiveMeeting }
				},
				{ provide: NavigationService, useValue: { redirectToErrorPage } }
			]
		});

		service = TestBed.inject(JoinTokenService);
	});

	function tokenOptions(): MeetRoomMemberTokenOptions {
		return roomMemberContext.generateToken.calls.mostRecent().args[1];
	}

	it('requests a joining token for the name and the correlation fields', async () => {
		await expectAsync(service.request(alice)).toBeResolvedTo('minted-token');

		expect(roomMemberContext.generateToken).toHaveBeenCalledOnceWith(ROOM_ID, jasmine.anything());
		expect(tokenOptions()).toEqual({
			secret: 'secret',
			joinMeeting: true,
			participantName: 'Alice',
			participantExternalId: 'ext-1',
			participantMetadata: undefined
		});
		expect(setIsActiveMeeting).toHaveBeenCalledWith(true);
	});

	it('encrypts the display name of an E2EE meeting before it reaches the token', async () => {
		await service.request({ ...alice, e2eeKey: 'passphrase' });

		expect(e2eeService.setE2EEKey).toHaveBeenCalledWith('passphrase');
		expect(tokenOptions().participantName).toBe('encrypted(Alice)');
		expect(roomMemberContext.saveParticipantNameToStorage).toHaveBeenCalledWith('Alice');
	});

	it('remembers a name the participant typed', async () => {
		await service.request(alice);

		expect(roomMemberContext.saveParticipantNameToStorage).toHaveBeenCalledWith('Alice');
	});

	it('does not remember a name the participant did not type', async () => {
		await service.request({ ...alice, nameTypedByParticipant: false });

		expect(roomMemberContext.saveParticipantNameToStorage).not.toHaveBeenCalled();
	});

	it('shows the error screen of a refusal and rejects, leaving the meeting inactive', async () => {
		roomMemberContext.generateToken.and.rejectWith({ status: 409, error: { message: 'Room is closed' } });

		await expectAsync(service.request(alice)).toBeRejected();

		expect(redirectToErrorPage).toHaveBeenCalledWith(NavigationErrorReason.CLOSED_ROOM, true);
		expect(setIsActiveMeeting).not.toHaveBeenCalled();
		expect(roomMemberContext.saveParticipantNameToStorage).not.toHaveBeenCalled();
	});

	it('shows the invalid participant data screen and logs the refused fields', async () => {
		const logError = spyOn(service['log'], 'e');
		roomMemberContext.generateToken.and.rejectWith(
			new HttpErrorResponse({
				status: 422,
				error: {
					message: 'Invalid request',
					details: [{ field: 'participantExternalId', message: 'Invalid participant external id' }]
				}
			})
		);

		await expectAsync(service.request(alice)).toBeRejected();

		expect(redirectToErrorPage).toHaveBeenCalledWith(NavigationErrorReason.INVALID_PARTICIPANT_DATA, true);
		expect(logError).toHaveBeenCalledWith(
			'Invalid participant data:',
			'participantExternalId: Invalid participant external id'
		);
	});
});
