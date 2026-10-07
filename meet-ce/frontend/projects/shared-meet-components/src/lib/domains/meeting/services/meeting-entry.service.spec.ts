import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from '../../../shared/services/i18n/language.service';
import { LeaveRedirectService } from '../../../shared/services/leave-redirect.service';
import { RoomMemberContextService } from '../../room-members/services/room-member-context.service';
import { RoomAccessService } from '../../rooms/services/room-access.service';
import { RoomFeatureService } from '../../rooms/services/room-feature.service';
import { MeetingContextService } from './meeting-context.service';
import { MeetingEntryService } from './meeting-entry.service';

describe('MeetingEntryService.prepare (resets the previous room feature state)', () => {
	let service: MeetingEntryService;
	let roomFeatureService: jasmine.SpyObj<RoomFeatureService>;
	let languageService: jasmine.SpyObj<LanguageService>;

	beforeEach(() => {
		roomFeatureService = jasmine.createSpyObj<RoomFeatureService>('RoomFeatureService', [
			'reset',
			'setInitialMediaRequest'
		]);
		const meetingContextService = jasmine.createSpyObj<MeetingContextService>('MeetingContextService', [
			'setRoomId',
			'setRoomSecret',
			'loadRoomSecretFromStorage',
			'setE2eeKey',
			'loadE2eeKeyFromStorage'
		]);
		const roomMemberContextService = jasmine.createSpyObj<RoomMemberContextService>('RoomMemberContextService', [
			'setParticipantExternalId',
			'setParticipantMetadata',
			'setParticipantName',
			'loadParticipantNameFromStorage'
		]);
		const roomAccessService = jasmine.createSpyObj<RoomAccessService>('RoomAccessService', ['validateAccess']);
		languageService = jasmine.createSpyObj<LanguageService>('LanguageService', [
			'setEmbeddedLanguage',
			'setSelectorHidden'
		]);
		const leaveRedirectService = jasmine.createSpyObj<LeaveRedirectService>('LeaveRedirectService', [
			'handleLeaveRedirectUrl'
		]);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingEntryService,
				{ provide: MeetingContextService, useValue: meetingContextService },
				{ provide: RoomMemberContextService, useValue: roomMemberContextService },
				{ provide: RoomAccessService, useValue: roomAccessService },
				{ provide: RoomFeatureService, useValue: roomFeatureService },
				{ provide: LeaveRedirectService, useValue: leaveRedirectService },
				{ provide: LanguageService, useValue: languageService }
			]
		});
		service = TestBed.inject(MeetingEntryService);
	});

	it('clears the room feature state on every entry, before seeding the new one', () => {
		roomFeatureService.reset.and.callFake(() => {
			expect(roomFeatureService.setInitialMediaRequest).not.toHaveBeenCalled();
		});

		service.prepare({ roomId: 'room-b' });

		expect(roomFeatureService.reset).toHaveBeenCalled();
		expect(roomFeatureService.setInitialMediaRequest).toHaveBeenCalled();
	});

	// An entry without the language gives the choice back, so a language imposed by a previous
	// mount does not outlive it.
	it('imposes the requested language on every entry, and releases it when none is requested', () => {
		service.prepare({ roomId: 'room-a', language: 'es' });
		service.prepare({ roomId: 'room-b' });

		expect(languageService.setEmbeddedLanguage.calls.allArgs()).toEqual([['es'], [undefined]]);
	});

	it('hides the language selectors on every entry that asks, and shows them on one that does not', () => {
		service.prepare({ roomId: 'room-a', hideLanguageSelector: true });
		service.prepare({ roomId: 'room-b' });

		expect(languageService.setSelectorHidden.calls.allArgs()).toEqual([[true], [false]]);
	});
});
