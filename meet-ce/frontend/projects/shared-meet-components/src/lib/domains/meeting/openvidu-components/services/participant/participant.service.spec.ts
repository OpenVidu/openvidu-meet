import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { MeetStorageService } from '../../../../../shared/services/storage.service';
import { E2eeService } from '../e2ee/e2ee.service';
import type { RemoteParticipant, TrackPublication } from '../livekit';
import { StreamLayoutStateService } from '../layout/stream-layout-state.service';
import { LocalMediaService } from '../local-media/local-media.service';
import { MeetingLiveKitService } from '../meeting-livekit/meeting-livekit.service';
import { ParticipantService } from './participant.service';

const remoteParticipant = (identity: string) => {
	const publications: TrackPublication[] = [];
	const participant = {
		identity,
		sid: `PA_${identity}`,
		name: identity,
		metadata: undefined,
		isLocal: false,
		getTrackPublications: () => [...publications]
	} as unknown as RemoteParticipant;

	return { participant, publications };
};

describe('ParticipantService', () => {
	let service: ParticipantService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				ParticipantService,
				StreamLayoutStateService,
				{ provide: MeetingLiveKitService, useValue: { hasRemoteParticipant: () => true } },
				{ provide: LocalMediaService, useValue: {} },
				{ provide: MeetStorageService, useValue: {} },
				{ provide: E2eeService, useValue: { decryptOrMask: async (name: string) => name } },
				{ provide: LoggerService, useValue: { get: () => ({ d: () => {}, w: () => {}, e: () => {} }) } }
			]
		});
		service = TestBed.inject(ParticipantService);
	});

	it('reports a published track as soon as a participant already in the meeting publishes one', () => {
		const { participant, publications } = remoteParticipant('bob');
		service.addRemoteParticipant(participant);

		expect(service.hasRoomTracksPublished()).toBeFalse();

		publications.push({ trackSid: 'TR_mic' } as TrackPublication);
		service.addRemoteParticipant(participant);

		expect(service.hasRoomTracksPublished()).toBeTrue();
	});
});
