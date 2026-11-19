import { provideZonelessChangeDetection, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	MeetBroadcastDestination,
	MeetBroadcastInfo,
	MeetBroadcastStatus,
	MeetRecordingEncodingPreset,
	MeetRecordingLayout
} from '@openvidu-meet/typings';
import { TranslateService } from '../../../../../../../shared/services/i18n/translate.service';
import { MeetingContextService } from '../../../../../services/meeting-context.service';
import { BroadcastRequestedEvent } from '../../../../models/broadcast.model';
import { BroadcastStateService } from '../../../../services/broadcast/broadcast-state.service';
import { MeetingUiConfigService } from '../../../../services/config/meeting-ui-config.service';
import { MeetingLiveKitService } from '../../../../services/meeting-livekit/meeting-livekit.service';
import { ParticipantService } from '../../../../services/participant/participant.service';
import { BroadcastActivityComponent } from './broadcast-activity.component';

const ROOM_DESTINATIONS: MeetBroadcastDestination[] = [
	{ id: 'dest-a', name: 'Channel A', url: 'rtmp://a.rtmp.youtube.com/live2/********' },
	{ id: 'dest-b', name: 'Channel B', url: 'rtmp://live.twitch.tv/app/********' }
];

const broadcastTo = ({ id, name, url }: MeetBroadcastDestination, status: MeetBroadcastStatus): MeetBroadcastInfo => ({
	broadcastId: `bc-${id}`,
	roomId: 'room1',
	roomName: 'Room 1',
	status,
	destination: { id, name, url },
	layout: MeetRecordingLayout.GRID,
	encoding: MeetRecordingEncodingPreset.H264_720P_30
});

/** The panel creates the activity again every time it opens, so what was chosen in it must outlive it. */
describe('BroadcastActivityComponent', () => {
	const createActivity = () => TestBed.runInInjectionContext(() => new BroadcastActivityComponent());
	let hasRoomTracksPublished: WritableSignal<boolean>;
	let addDestinations: WritableSignal<boolean>;

	beforeEach(() => {
		hasRoomTracksPublished = signal(true);
		addDestinations = signal(true);
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => key, translationsLoaded: signal(0) }
				},
				{
					provide: MeetingUiConfigService,
					useValue: {
						broadcastActivityControlsSignal: signal(true),
						broadcastActivityAddDestinationsSignal: addDestinations
					}
				},
				{
					provide: MeetingContextService,
					useValue: { broadcastConfig: signal({ destinations: ROOM_DESTINATIONS }) }
				},
				{ provide: ParticipantService, useValue: { hasRoomTracksPublished } },
				{ provide: MeetingLiveKitService, useValue: { getRoomName: () => 'room1' } }
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

	it('offers to go live as soon as the room publishes a track', () => {
		hasRoomTracksPublished.set(false);
		const activity = createActivity();

		expect(activity.canGoLive()).toBeFalse();

		hasRoomTracksPublished.set(true);

		expect(activity.canGoLive()).toBeTrue();
	});

	describe('rendered', () => {
		let fixture: ComponentFixture<BroadcastActivityComponent>;
		let requests: BroadcastRequestedEvent[];

		const render = async () => {
			fixture.detectChanges();
			await fixture.whenStable();
		};

		const find = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement | null;
		const [destinationA, destinationB] = ROOM_DESTINATIONS;

		beforeEach(async () => {
			fixture = TestBed.createComponent(BroadcastActivityComponent);
			fixture.componentRef.setInput('expanded', true);
			requests = [];
			fixture.componentInstance.onBroadcastRequested.subscribe((request) => requests.push(request));
			await render();
		});

		it('disables going live and asks to share audio or video while nobody publishes', async () => {
			expect((find('#go-live-btn') as HTMLButtonElement).disabled).toBeFalse();
			expect(find('.activity-actions .activity-hint')).toBeNull();

			hasRoomTracksPublished.set(false);
			await render();

			expect((find('#go-live-btn') as HTMLButtonElement).disabled).toBeTrue();
			expect(find('.activity-actions .activity-hint')!.textContent).toContain('PANEL.BROADCAST.NO_TRACKS');
		});

		it('offers to add a destination only with the permission to edit them', async () => {
			expect(find('#broadcast-add-destination-btn')).not.toBeNull();

			addDestinations.set(false);
			await render();

			expect(find('#broadcast-add-destination-btn')).toBeNull();
		});

		it('retries a failed destination while the other one stays live', async () => {
			const state = TestBed.inject(BroadcastStateService);
			state.setBroadcast(broadcastTo(destinationA, MeetBroadcastStatus.ACTIVE));
			state.setBroadcast(broadcastTo(destinationB, MeetBroadcastStatus.FAILED));
			await render();

			find('#broadcast-destination-dest-b .destination-text-action')!.click();

			expect(requests).toEqual([
				{ action: 'start', roomId: 'room1', destinationIds: ['dest-b'], destinations: [] }
			]);
			expect(find('#broadcast-destination-dest-a')!.dataset['status']).toBe('live');
		});

		describe('when every broadcast failed', () => {
			beforeEach(async () => {
				const state = TestBed.inject(BroadcastStateService);
				state.setBroadcast(broadcastTo(destinationA, MeetBroadcastStatus.FAILED));
				state.setBroadcast(broadcastTo(destinationB, MeetBroadcastStatus.FAILED));
				await render();
			});

			it('shows the failure with a retry and a dismiss', () => {
				expect(find('.activity-failure')).not.toBeNull();
				expect(find('#retry-broadcast-btn')).not.toBeNull();
				expect(find('#reset-broadcast-status-btn')).not.toBeNull();
			});

			it('goes live again to the chosen destinations when retried', () => {
				find('#retry-broadcast-btn')!.click();

				expect(requests).toEqual([
					{ action: 'start', roomId: 'room1', destinationIds: ['dest-a', 'dest-b'], destinations: [] }
				]);
			});

			it('clears the failure without starting anything when dismissed', async () => {
				find('#reset-broadcast-status-btn')!.click();
				await render();

				expect(requests).toEqual([]);
				expect(find('.activity-failure')).toBeNull();
				expect(find('#go-live-btn')).not.toBeNull();
			});
		});
	});
});
