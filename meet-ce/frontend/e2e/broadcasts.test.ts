import { MeetBroadcastDestinationStatus } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { createRtmpSink, deleteRtmpSinks } from './helpers/broadcast-sink.helper';
import {
	addDestinationFromActivitiesPanel,
	expectBroadcastBadgeVisible,
	expectBroadcastNotice,
	expectBroadcastPhase,
	expectDestinationStatus,
	expectNoBroadcastBadge,
	expectNoBroadcastControls,
	goLiveFromActivitiesPanel,
	stopBroadcastFromActivitiesPanel
} from './helpers/broadcasts.helper';
import {
	createRoomAndGetAnonymousAccessUrl,
	deleteRooms,
	getRoomConfig,
	startBroadcast
} from './helpers/meet-api.helper';
import { openMeeting } from './helpers/meeting-navigation.helper';

/**
 * The live broadcast as the room sees it: the activity a moderator goes live from, the LIVE chip
 * everyone gets, and what a participant without the permission is left with. The room streams to
 * an RTMP ingress of the LiveKit deployment under test, the one sink the egress can reach here.
 */
test.describe('Live broadcast E2E Tests', () => {
	let roomId: string;
	let sinkUrl: string;
	let destinationId: string;
	let moderatorUrl: string;
	let speakerUrl: string;

	test.beforeEach(async () => {
		sinkUrl = await createRtmpSink('spa');
		const { room, accessUrl } = await createRoomAndGetAnonymousAccessUrl({
			config: { broadcast: { enabled: true, destinations: [{ name: 'Sink', url: sinkUrl }] } }
		});
		roomId = room.roomId;
		moderatorUrl = accessUrl;
		speakerUrl = room.access.anonymous.speaker.url;
		destinationId = (await getRoomConfig(roomId)).broadcast.destinations[0].id!;
	});

	test.afterEach(async () => {
		await deleteRooms([roomId]);
		await deleteRtmpSinks();
	});

	test('should go live from the activities panel, reach the destination and stop', async ({ page }) => {
		await openMeeting(page, moderatorUrl);

		await goLiveFromActivitiesPanel(page);
		await expectBroadcastPhase(page, 'live', 40_000);
		await expectDestinationStatus(page, destinationId, MeetBroadcastDestinationStatus.ACTIVE);
		await expectBroadcastBadgeVisible(page);
		await expectBroadcastNotice(page, 'started');

		await stopBroadcastFromActivitiesPanel(page);
		await expectBroadcastNotice(page, 'stopped');
		await expectBroadcastPhase(page, 'idle', 30_000);
		await expectNoBroadcastBadge(page);
	});

	test('should keep a destination the server refuses in its editor, with the broadcast still live', async ({
		page
	}) => {
		await openMeeting(page, moderatorUrl);
		await goLiveFromActivitiesPanel(page);
		await expectBroadcastPhase(page, 'live', 40_000);

		await addDestinationFromActivitiesPanel(page, 'Sink again', sinkUrl);

		await expect(page.locator('#broadcast-destination-url-rejected')).toContainText('Duplicate destination');
		await expect(page.locator('#broadcast-destination-editor')).toBeVisible();
		await expectBroadcastPhase(page, 'live');
	});

	test('should show a participant without broadcastControl the live broadcast, but no controls', async ({ page }) => {
		await openMeeting(page, speakerUrl);
		await startBroadcast(roomId);

		await expectBroadcastBadgeVisible(page);
		await expectNoBroadcastControls(page);
	});
});
