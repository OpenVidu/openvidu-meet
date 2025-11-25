import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { Participant } from 'livekit-client';
import {
	ParticipantModel,
	LoggerService,
	ParticipantService,
	OpenViduService
} from 'openvidu-components-angular';
import { MeetingCustomLayoutComponent } from './meeting-custom-layout.component';
import { MeetLayoutService } from '../../../services/layout.service';
import { MeetLayoutMode } from '../../../models/layout.model';

describe('MeetingLayoutComponent', () => {
	let component: MeetingCustomLayoutComponent;
	let fixture: ComponentFixture<MeetingCustomLayoutComponent>;
	let mockLayoutService: jasmine.SpyObj<MeetLayoutService>;
	let mockParticipantService: jasmine.SpyObj<ParticipantService>;
	let mockOpenViduService: jasmine.SpyObj<OpenViduService>;
	let mockLoggerService: jasmine.SpyObj<LoggerService>;
	let mockRoom: any;

	// Subjects for testing reactive behavior
	let remoteParticipantsSubject: Subject<ParticipantModel[]>;
	let layoutModeSubject: Subject<MeetLayoutMode>;

	beforeEach(async () => {
		// Create subjects for observables
		remoteParticipantsSubject = new Subject<ParticipantModel[]>();
		layoutModeSubject = new Subject<MeetLayoutMode>();

		// Mock room with event emitter
		mockRoom = {
			on: jasmine.createSpy('on'),
			off: jasmine.createSpy('off'),
			emit: jasmine.createSpy('emit')
		};

		// Create service mocks
		mockLayoutService = jasmine.createSpyObj('MeetLayoutService', ['isLastSpeakersLayoutEnabled'], {
			layoutMode$: layoutModeSubject.asObservable()
		});

		mockParticipantService = jasmine.createSpyObj('ParticipantService', [], {
			remoteParticipants$: remoteParticipantsSubject.asObservable()
		});

		mockOpenViduService = jasmine.createSpyObj('OpenViduService', ['getRoom']);
		mockOpenViduService.getRoom.and.returnValue(mockRoom);

		mockLoggerService = jasmine.createSpyObj('LoggerService', ['get']);
		mockLoggerService.get.and.returnValue({
			d: jasmine.createSpy('d'),
			w: jasmine.createSpy('w'),
			e: jasmine.createSpy('e')
		});

		await TestBed.configureTestingModule({
			imports: [MeetingCustomLayoutComponent],
			providers: [
				{ provide: MeetLayoutService, useValue: mockLayoutService },
				{ provide: ParticipantService, useValue: mockParticipantService },
				{ provide: OpenViduService, useValue: mockOpenViduService },
				{ provide: LoggerService, useValue: mockLoggerService }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MeetingCustomLayoutComponent);
		component = fixture.componentInstance;
	});

	describe('Initialization', () => {
		it('should create', () => {
			expect(component).toBeTruthy();
		});

		it('should set up active speakers listener on creation', () => {
			fixture.detectChanges();
			expect(mockRoom.on).toHaveBeenCalledWith('activeSpeakersChanged', jasmine.any(Function));
		});

		it('should have default maxRemoteSpeakers of 4', () => {
			expect(component.maxRemoteSpeakers()).toBe(4);
		});

		it('should accept custom maxRemoteSpeakers input', () => {
			fixture.componentRef.setInput('maxRemoteSpeakers', 8);
			expect(component.maxRemoteSpeakers()).toBe(8);
		});
	});

	describe('Default Layout Mode', () => {
		beforeEach(() => {
			fixture.detectChanges();
			layoutModeSubject.next(MeetLayoutMode.MOSAIC);
		});

		it('should show all remote participants in DEFAULT mode', () => {
			const mockParticipants = createMockParticipants(6);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			expect(component.filteredRemoteParticipants()).toEqual(mockParticipants);
		});

		it('should update when remote participants change', () => {
			const participants1 = createMockParticipants(3);
			remoteParticipantsSubject.next(participants1);
			fixture.detectChanges();

			expect(component.filteredRemoteParticipants().length).toBe(3);

			const participants2 = createMockParticipants(5);
			remoteParticipantsSubject.next(participants2);
			fixture.detectChanges();

			expect(component.filteredRemoteParticipants().length).toBe(5);
		});
	});

	describe('Last Speakers Layout Mode', () => {
		beforeEach(() => {
			fixture.detectChanges();
			layoutModeSubject.next(MeetLayoutMode.SMART_MOSAIC);
			fixture.detectChanges();
		});

		it('should initialize with first N participants when no active speakers', () => {
			fixture.componentRef.setInput('maxRemoteSpeakers', 4);
			const mockParticipants = createMockParticipants(10);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const filtered = component.filteredRemoteParticipants();
			expect(filtered.length).toBe(4);
			expect(filtered).toEqual(mockParticipants.slice(0, 4));
		});

		it('should update active speakers when activeSpeakersChanged event fires', () => {
			const mockParticipants = createMockParticipants(10);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			// Get the registered callback
			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Simulate active speakers event
			const activeSpeakers = [
				createMockLiveKitParticipant('participant-5', false),
				createMockLiveKitParticipant('participant-7', false),
				createMockLiveKitParticipant('participant-3', false)
			];
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();

			const filtered = component.filteredRemoteParticipants();
			expect(filtered.map(p => p.identity)).toContain('participant-5');
			expect(filtered.map(p => p.identity)).toContain('participant-7');
			expect(filtered.map(p => p.identity)).toContain('participant-3');
		});

		it('should respect maxRemoteSpeakers limit', () => {
			fixture.componentRef.setInput('maxRemoteSpeakers', 3);
			const mockParticipants = createMockParticipants(10);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Simulate more speakers than max
			const activeSpeakers = createMockLiveKitParticipants(6, false);
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();

			expect(component.filteredRemoteParticipants().length).toBeLessThanOrEqual(3);
		});

		it('should filter out local participant from active speakers', () => {
			const mockParticipants = createMockParticipants(5);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Include local participant in active speakers
			const activeSpeakers = [
				createMockLiveKitParticipant('local-participant', true),
				createMockLiveKitParticipant('participant-1', false),
				createMockLiveKitParticipant('participant-2', false)
			];
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();

			const filtered = component.filteredRemoteParticipants();
			expect(filtered.map(p => p.identity)).not.toContain('local-participant');
		});

		it('should not update if speaker list is identical', () => {
			const mockParticipants = createMockParticipants(5);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];
			const activeSpeakers = createMockLiveKitParticipants(3, false);

			// First update
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();
			const firstResult = component.filteredRemoteParticipants();

			// Same speakers again
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();
			const secondResult = component.filteredRemoteParticipants();

			// Should be the same instance (no update)
			expect(firstResult).toEqual(secondResult);
		});

		it('should fill with additional participants if active speakers < max', () => {
			fixture.componentRef.setInput('maxRemoteSpeakers', 5);
			const mockParticipants = createMockParticipants(10);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Only 2 active speakers
			const activeSpeakers = createMockLiveKitParticipants(2, false);
			activeSpeakersCallback(activeSpeakers);
			fixture.detectChanges();

			// Should fill up to max with additional participants
			expect(component.filteredRemoteParticipants().length).toBe(5);
		});
	});

	describe('Participant Cleanup', () => {
		it('should remove disconnected participants from active speakers', () => {
			fixture.detectChanges();
			layoutModeSubject.next(MeetLayoutMode.SMART_MOSAIC);
			fixture.detectChanges();

			const mockParticipants = createMockParticipants(5);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];
			activeSpeakersCallback(createMockLiveKitParticipants(3, false));
			fixture.detectChanges();

			// Remove some participants
			const remainingParticipants = mockParticipants.slice(2);
			remoteParticipantsSubject.next(remainingParticipants);
			fixture.detectChanges();

			// Filtered list should only contain remaining participants
			const filtered = component.filteredRemoteParticipants();
			expect(filtered.every(p => remainingParticipants.includes(p))).toBe(true);
		});
	});

	describe('Component Cleanup', () => {
		it('should remove event listener on destroy', () => {
			fixture.detectChanges();
			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			fixture.destroy();

			expect(mockRoom.off).toHaveBeenCalledWith('activeSpeakersChanged', activeSpeakersCallback);
		});
	});

	describe('Performance Optimizations', () => {
		it('should not process events in DEFAULT mode', () => {
			fixture.detectChanges();
			layoutModeSubject.next(MeetLayoutMode.MOSAIC);
			fixture.detectChanges();

			const mockParticipants = createMockParticipants(5);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const initialFiltered = component.filteredRemoteParticipants();
			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Fire event (should be ignored in DEFAULT mode)
			activeSpeakersCallback(createMockLiveKitParticipants(3, false));
			fixture.detectChanges();

			// Should remain unchanged
			expect(component.filteredRemoteParticipants()).toEqual(initialFiltered);
		});

		it('should not process empty speaker arrays', () => {
			fixture.detectChanges();
			layoutModeSubject.next(MeetLayoutMode.SMART_MOSAIC);
			fixture.detectChanges();

			const mockParticipants = createMockParticipants(5);
			remoteParticipantsSubject.next(mockParticipants);
			fixture.detectChanges();

			const initialFiltered = component.filteredRemoteParticipants();
			const activeSpeakersCallback = mockRoom.on.calls.argsFor(0)[1];

			// Fire event with empty array
			activeSpeakersCallback([]);
			fixture.detectChanges();

			// Should remain unchanged
			expect(component.filteredRemoteParticipants()).toEqual(initialFiltered);
		});
	});

	// Helper functions

	function createMockParticipants(count: number): ParticipantModel[] {
		return Array.from({ length: count }, (_, i) => {
			return {
				identity: `participant-${i}`,
				name: `Participant ${i}`,
				isLocal: false,
				isSpeaking: false
			} as unknown as ParticipantModel;
		});
	}

	function createMockLiveKitParticipant(identity: string, isLocal: boolean): Participant {
		return {
			identity,
			isLocal,
			metadata: ''
		} as Participant;
	}

	function createMockLiveKitParticipants(count: number, isLocal: boolean): Participant[] {
		return Array.from({ length: count }, (_, i) =>
			createMockLiveKitParticipant(`participant-${i}`, isLocal)
		);
	}
});
