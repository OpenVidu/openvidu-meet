import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetBroadcastDestination } from '@openvidu-meet/typings';
import { MeetingContextService } from '../../../../../services/meeting-context.service';
import { BroadcastRequestedEvent } from '../../../../models/broadcast.model';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { BroadcastActivityComponent } from './broadcast-activity.component';

const ROOM_DESTINATIONS: MeetBroadcastDestination[] = [
	{ id: 'dest-a', name: 'Channel A', url: 'rtmp://a.rtmp.youtube.com/live2/********' },
	{ id: 'dest-b', name: 'Channel B', url: 'rtmp://live.twitch.tv/app/********' }
];

/** The panel creates the activity again every time it opens, so what was chosen in it must outlive it. */
describe('BroadcastActivityComponent', () => {
	const createActivity = () => TestBed.runInInjectionContext(() => new BroadcastActivityComponent());

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: MeetingUiConfigService,
					useValue: {
						broadcastActivityControlsSignal: signal(true),
						broadcastActivityAddDestinationsSignal: signal(true)
					}
				},
				{
					provide: MeetingContextService,
					useValue: { broadcastConfig: signal({ destinations: ROOM_DESTINATIONS }) }
				},
				{
					provide: ParticipantService,
					useValue: { localParticipant: signal(undefined), remoteParticipants: signal([]) }
				},
				{
					provide: MeetingLiveKitService,
					useValue: { hasRoomTracksPublished: () => true, getRoomName: () => 'room1' }
				}
			]
		});
	});

	it('keeps the destinations chosen when the activity is created again, and goes live to those alone', () => {
		const closed = createActivity();
		closed.toggleSelected('dest-a', false);
		closed.openAdd();
		closed.editor.form.setValue({ name: 'Channel C', url: 'rtmp://c.example.com/live/key-c' });
		closed.submitEditor();

		const activity = createActivity();
		const requests: BroadcastRequestedEvent[] = [];
		activity.onBroadcastRequested.subscribe((request) => requests.push(request));

		expect(activity.rows().map(({ name, selected }) => `${name}:${selected}`)).toEqual([
			'Channel A:false',
			'Channel B:true',
			'Channel C:true'
		]);

		activity.goLive();

		expect(requests).toEqual([
			{
				action: 'start',
				roomId: 'room1',
				destinationIds: ['dest-b'],
				destinations: [{ name: 'Channel C', url: 'rtmp://c.example.com/live/key-c' }]
			}
		]);
	});
});
