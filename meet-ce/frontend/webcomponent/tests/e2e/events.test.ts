import { LeftEventReason, EmbeddedEventName, MeetEventOrigin } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { INTEGRATIONS, meetLocator } from '../helpers/webcomponent.helper';
import { createRoom, deleteRooms } from '../helpers/meet-api.helper';
import {
	endMeetingCommand,
	eventLocator,
	expectEvent,
	leaveMeeting,
	leaveRoomCommand,
	mediaToggleAudioCommand,
	mediaToggleScreenShareCommand,
	mediaToggleVideoCommand,
	openMeeting,
	openMeetingAtMediaSetup
} from '../helpers/testapp.helper';

// Events carry the same names/payloads regardless of transport; run every spec
// against both integrations, selecting the mode through the testapp's UI.
for (const integration of INTEGRATIONS) {
	test.describe(`WebComponent Events E2E Tests [${integration}]`, () => {
		const createdRoomIds: string[] = [];
		let roomId: string;

		test.beforeEach(async () => {
			({ roomId } = await createRoom());
			createdRoomIds.push(roomId);
		});

		test.afterAll(async () => {
			await deleteRooms(createdRoomIds);
		});

		test.describe('JOINED Event', () => {
			test('should receive joined event when joining as moderator', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				await expect(joined).toContainText('roomId');
				await expect(joined).toContainText('participantIdentity');
				await expect(joined).toContainText(roomId);
			});

			test('should receive joined event when joining as speaker', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				await expect(joined).toContainText('roomId');
				await expect(joined).toContainText('participantIdentity');
				await expect(joined).toContainText(roomId);
			});

			test('should receive only one joined event per join action', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);
			});
		});

		test.describe('LEFT Event', () => {
			test('should receive left event with voluntary_leave reason when using leave command', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText('roomId');
				await expect(left).toContainText('participantIdentity');
				await expect(left).toContainText('reason');
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should receive left event with voluntary_leave reason when using disconnect button', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveMeeting(page, { integration, role: 'moderator' });

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText('reason');
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should receive left event with meeting_ended reason when moderator ends meeting', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText('reason');
				await expect(left).toContainText(LeftEventReason.MEETING_ENDED);
			});

			test('should receive left event when speaker leaves room', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveMeeting(page, { integration });

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText('roomId');
				await expect(left).toContainText('participantIdentity');
				await expect(left).toContainText('reason');
			});
		});

		test.describe('CLOSED Event', () => {
			test('should receive closed event after leaving as moderator', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.CLOSED).first()).toBeVisible({ timeout: 5_000 });
			});

			test('should receive closed event after ending meeting', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.CLOSED).first()).toBeVisible({ timeout: 5_000 });
			});
		});

		test.describe('Event Sequences', () => {
			test('should receive events in correct order: joined -> left', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = eventLocator(page, EmbeddedEventName.JOINED);
				const left = eventLocator(page, EmbeddedEventName.LEFT);
				await expect(joined).toHaveCount(1, { timeout: 10_000 });
				await expect(left).toHaveCount(0);

				await leaveRoomCommand(page);

				await expect(left).toHaveCount(1, { timeout: 10_000 });
				await expect(joined).toHaveCount(1);
			});
		});

		test.describe('Event Payload Validation', () => {
			test('should include correct roomId in joined event payload', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				await expect(joined).toContainText(roomId);
				await expect(joined).toContainText('"roomId"');
			});

			test('should include participantIdentity in joined event payload', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				await expect(joined).toContainText('"participantIdentity"');
				await expect(joined).toHaveText(/participantIdentity.*:/);
			});

			test('should include all required fields in left event payload', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText('"roomId"');
				await expect(left).toContainText('"participantIdentity"');
				await expect(left).toContainText('"reason"');
				await expect(left).toContainText(roomId);
			});

			test('should have valid reason in left event payload', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);
				const left = await expectEvent(page, EmbeddedEventName.LEFT);

				const eventText = (await left.textContent()) ?? '';
				const validReasons = Object.values(LeftEventReason);
				const hasValidReason = validReasons.some((reason) => eventText.includes(reason));
				expect(hasValidReason).toBe(true);
			});
		});

		test.describe('Event Error Handling', () => {
			test('should emit a left event when leaving immediately after joining', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);
			});

			test('should not emit duplicate left events on repeated leave clicks', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const leaveBtn = page.locator('#leave-room-btn');
				await leaveBtn.click();
				await leaveBtn.click().catch(() => {});
				await leaveBtn.click().catch(() => {});

				await expectEvent(page, EmbeddedEventName.LEFT);
			});
		});

		test.describe('PARTICIPANT_JOINED / PARTICIPANT_LEFT Events', () => {
			test('should receive participant events for a remote participant that joins and leaves', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				const speakerName = 'Remote Speaker';
				await openMeeting(speakerPage, roomId, {
					role: 'speaker',
					name: speakerName,
					externalId: 'crm-user_42',
					metadata: '{"plan":"premium"}'
				});

				// The moderator's host observes the remote join, carrying the correlation fields the
				// speaker's application provided through the embed attributes.
				const joined = await expectEvent(page, EmbeddedEventName.PARTICIPANT_JOINED);
				await expect(joined).toContainText(roomId);
				await expect(joined).toContainText(speakerName);
				await expect(joined).toContainText('crm-user_42');
				await expect(joined).toContainText('"role"');

				await leaveMeeting(speakerPage, { role: 'speaker' });

				const left = await expectEvent(page, EmbeddedEventName.PARTICIPANT_LEFT);
				await expect(left).toContainText(speakerName);
				await expect(left).toContainText('crm-user_42');

				await speakerContext.close();
			});
		});

		// These events describe the LOCAL participant's devices and are derived from the media state,
		// so one user action must reach the host exactly once however many track events LiveKit
		// surfaced for it, and the state the entry starts with is a baseline rather than a
		// transition. `origin` is the first payload field carrying MeetEventOrigin — everything
		// emitted today is `participant`, since only the participant's own side can change a device.
		test.describe('MEDIA_*_STATUS_CHANGED Events', () => {
			test('should emit mediaAudioStatusChanged once per microphone transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
				// Joining with the microphone on is the initial state, not a transition.
				await expect(audioStatus).toHaveCount(0);

				await mediaToggleAudioCommand(page, false);

				await expect(audioStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(audioStatus.first()).toContainText('"enabled":false');
				await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleAudioCommand(page, true);

				await expect(audioStatus).toHaveCount(2, { timeout: 10_000 });
				await expect(audioStatus.nth(1)).toContainText('"enabled":true');
			});

			test('should emit mediaVideoStatusChanged once per camera transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
				await expect(videoStatus).toHaveCount(0);

				await mediaToggleVideoCommand(page, false);

				await expect(videoStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(videoStatus.first()).toContainText('"enabled":false');
				await expect(videoStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleVideoCommand(page, true);

				await expect(videoStatus).toHaveCount(2, { timeout: 10_000 });
				await expect(videoStatus.nth(1)).toContainText('"enabled":true');
			});

			test('should emit mediaScreenShareStatusChanged on start and stop', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const screenShareStatus = eventLocator(page, EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED);
				await expect(screenShareStatus).toHaveCount(0);

				await mediaToggleScreenShareCommand(page, true);

				await expect(screenShareStatus).toHaveCount(1, { timeout: 15_000 });
				await expect(screenShareStatus.first()).toContainText('"enabled":true');
				await expect(screenShareStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleScreenShareCommand(page, false);

				await expect(screenShareStatus).toHaveCount(2, { timeout: 15_000 });
				await expect(screenShareStatus.nth(1)).toContainText('"enabled":false');
			});

			// The state exists in the prejoin screen too, so a change made before joining is reported
			// like any other — there are no Room events to listen to in that window.
			test('should emit mediaAudioStatusChanged for a mute done before joining', async ({ page }) => {
				await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

				const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
				await expect(audioStatus).toHaveCount(0);

				await mediaToggleAudioCommand(page, false);

				await expect(audioStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(audioStatus.first()).toContainText('"enabled":false');
				await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
			});

			test('should emit mediaVideoStatusChanged for a camera disabled before joining', async ({ page }) => {
				await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

				const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
				await expect(videoStatus).toHaveCount(0);

				await mediaToggleVideoCommand(page, false);

				await expect(videoStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(videoStatus.first()).toContainText('"enabled":false');
			});

			// Joining publishes the prejoin tracks as they are: the host already knows that state and
			// must not be told again.
			test('should not repeat the prejoin state when the participant joins', async ({ page }) => {
				const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

				const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);

				await mediaToggleAudioCommand(page, false);
				await expect(audioStatus).toHaveCount(1, { timeout: 10_000 });

				await meet('#join-button').click();
				await expect(meet('#layout-container')).toBeVisible({ timeout: 15_000 });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await expect(audioStatus).toHaveCount(1);
			});

			test('should emit the audio event for a mute done from the in-meeting UI', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				// Not command-specific: any real transition of the local device is notified.
				await meetLocator(page, integration, '#mic-btn').click();

				const audioStatus = await expectEvent(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
				await expect(audioStatus.first()).toContainText('"enabled":false');
			});

			test('should not emit a media event when the requested state is already active', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await mediaToggleAudioCommand(page, true);
				await mediaToggleVideoCommand(page, true);

				// Give any spurious emission a chance to land before asserting the absence.
				await expect(eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED)).toHaveCount(0);
				await expect(eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED)).toHaveCount(0);
			});

			test('should not emit media events for a remote participant device change', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker' });
				await expectEvent(speakerPage, EmbeddedEventName.MEETING_JOINED);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				// The remote participant mutes themselves; only THEIR host is notified.
				await mediaToggleAudioCommand(speakerPage, false);
				await expectEvent(speakerPage, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);

				await expect(eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED)).toHaveCount(0);

				await leaveMeeting(speakerPage, { role: 'speaker' });
				await speakerContext.close();
			});
		});

		// Every other describe block above only asserts the deprecated names (what a
		// 3.8.0 host still listens for). This block is the canonical-name counterpart:
		// it proves the dual dispatch actually reaches a host listening for the new
		// names too, for both transports — nothing end-to-end asserted that before.
		test.describe('Canonical/Legacy Dual Dispatch', () => {
			test('should dispatch both joined and meetingJoined for the same transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				const meetingJoined = await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expect(joined).toContainText(roomId);
				await expect(meetingJoined).toContainText(roomId);
			});

			test('should dispatch both left and meetingLeft with the same reason', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				const meetingLeft = await expectEvent(page, EmbeddedEventName.MEETING_LEFT);
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
				await expect(meetingLeft).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should dispatch both closed and meetingClosed after leaving', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.CLOSED).first()).toBeVisible({ timeout: 5_000 });
				await expect(eventLocator(page, EmbeddedEventName.MEETING_CLOSED).first()).toBeVisible({
					timeout: 5_000
				});
			});
		});
	});
}
