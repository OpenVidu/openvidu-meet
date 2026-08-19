import { LeftEventReason, MeetWebhookEventType, EmbeddedEventName } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { INTEGRATIONS, meetLocator, wcLocator } from '../helpers/webcomponent.helper';
import { createRoom, deleteRooms } from '../helpers/meet-api.helper';
import {
	expectPrejoinCameraEnabled,
	expectPrejoinMicEnabled,
	expectToolbarCameraEnabled,
	expectToolbarMicEnabled
} from '../helpers/media-controls.helper';
import {
	endMeetingCommand,
	endMeetingLegacyCommand,
	eventLocator,
	expectEvent,
	expectWebhook,
	kickParticipantCommand,
	kickParticipantLegacyCommand,
	leaveMeeting,
	leaveRoomCommand,
	leaveRoomLegacyCommand,
	mediaToggleAudioCommand,
	mediaToggleScreenShareCommand,
	mediaToggleVideoCommand,
	openMeeting,
	openMeetingAtMediaSetup
} from '../helpers/testapp.helper';

// The command/event API is identical across embedding transports — only the
// delivery differs (element methods/DOM events vs. postMessage). Each spec runs
// against both, selecting the integration through the testapp's UI. The primary
// page uses the parametrized integration; secondary (speaker) pages always use
// the webcomponent, since they only need to be a second participant.
for (const integration of INTEGRATIONS) {
	test.describe(`WebComponent Commands E2E Tests [${integration}]`, () => {
		const createdRoomIds: string[] = [];
		let roomId: string;

		test.beforeEach(async () => {
			({ roomId } = await createRoom());
			createdRoomIds.push(roomId);
		});

		test.afterAll(async () => {
			await deleteRooms(createdRoomIds);
		});

		test.describe('LEAVE_ROOM Command', () => {
			test('should disconnect moderator from the room', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should disconnect speaker from the room', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should not end the meeting when moderator leaves via leaveRoom', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker' });
				await expectEvent(speakerPage, EmbeddedEventName.JOINED);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				// Speaker should still be in the meeting. Assert the live stage: `ov-meeting-view` is the
				// host component and stays mounted through the disconnected phase too.
				await expect(wcLocator(speakerPage, '#layout-container')).toBeVisible();
				await expect(eventLocator(speakerPage, EmbeddedEventName.LEFT)).toHaveCount(0);

				await leaveMeeting(speakerPage);
				await speakerContext.close();
			});
		});

		test.describe('END_MEETING Command', () => {
			test('should end the meeting and emit left event with meeting_ended reason', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText(LeftEventReason.MEETING_ENDED);
			});

			test('should disconnect all participants when moderator ends the meeting', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker' });
				await expectEvent(speakerPage, EmbeddedEventName.JOINED);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await endMeetingCommand(page);

				const moderatorLeft = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(moderatorLeft).toContainText(LeftEventReason.MEETING_ENDED);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);
				await expect(speakerLeft).toContainText(LeftEventReason.MEETING_ENDED);

				await speakerContext.close();
			});

			test('should trigger meetingEnded webhook', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectWebhook(page, MeetWebhookEventType.MEETING_STARTED);

				await endMeetingCommand(page);

				await expectWebhook(page, MeetWebhookEventType.MEETING_ENDED);
			});
		});

		test.describe('KICK_PARTICIPANT Command', () => {
			test('should kick a speaker from the room', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				const speakerName = 'Speaker';
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

				const speakerJoined = await expectEvent(speakerPage, EmbeddedEventName.JOINED);
				const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
				const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
				const speakerIdentity = match?.[1] ?? speakerName;

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await kickParticipantCommand(page, speakerIdentity);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);
				await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);

				await speakerContext.close();
			});

			test('should not disconnect the moderator who kicks a participant', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				const speakerName = 'Speaker';
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

				const speakerJoined = await expectEvent(speakerPage, EmbeddedEventName.JOINED);
				const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
				const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
				const speakerIdentity = match?.[1] ?? speakerName;

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await kickParticipantCommand(page, speakerIdentity);

				await expectEvent(speakerPage, EmbeddedEventName.LEFT);

				// Moderator should still be in the meeting (live stage, see above).
				await expect(meetLocator(page, integration, '#layout-container')).toBeVisible();
				await expect(eventLocator(page, EmbeddedEventName.LEFT)).toHaveCount(0);

				await leaveMeeting(page, { integration, role: 'moderator' });
				await speakerContext.close();
			});

			test('should emit left event with participant_kicked reason on the kicked participant', async ({
				page,
				browser
			}) => {
				const speakerName = 'Speaker';

				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

				const speakerJoined = await expectEvent(speakerPage, EmbeddedEventName.JOINED);
				const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
				const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
				const speakerIdentity = match?.[1] ?? speakerName;

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await kickParticipantCommand(page, speakerIdentity);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);
				await expect(speakerLeft).toContainText('"reason"');
				await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);
				await expect(speakerLeft).toContainText('"roomId"');
				await expect(speakerLeft).toContainText(roomId);

				await leaveMeeting(page, { integration, role: 'moderator' });
				await speakerContext.close();
			});
		});

		// The media commands are the first ones meant to work BEFORE the room is
		// connected too (the prejoin screen has real local tracks), and the first with an
		// optional boolean: omitted = toggle, provided = set. Both halves of that contract
		// are asserted here against the participant's real device state.
		test.describe('MEDIA_TOGGLE Commands', () => {
			test('should mute and unmute the microphone by setting enabled explicitly', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleAudioCommand(page, false);
				await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

				await mediaToggleAudioCommand(page, true);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
			});

			test('should disable and enable the camera by setting enabled explicitly', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleVideoCommand(page, false);
				await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });

				await mediaToggleVideoCommand(page, true);
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });
			});

			test('should invert the microphone state when enabled is omitted', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleAudioCommand(page);
				await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

				// The second toggle must read the CURRENT state, not a stale snapshot.
				await mediaToggleAudioCommand(page);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
			});

			test('should invert the camera state when enabled is omitted', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleVideoCommand(page);
				await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });

				await mediaToggleVideoCommand(page);
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });
			});

			test('should keep toggling after the participant changed the state from the UI', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				// The host and the in-meeting UI must share one source of truth: a UI mute
				// followed by a host toggle has to unmute, not re-mute.
				await meetLocator(page, integration, '#mic-btn').click();
				await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

				await mediaToggleAudioCommand(page);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
			});

			test('should start and stop screen sharing by setting enabled explicitly', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await mediaToggleScreenShareCommand(page, true);
				await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toBeVisible({ timeout: 15_000 });

				await mediaToggleScreenShareCommand(page, false);
				await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toHaveCount(0, {
					timeout: 15_000
				});
			});

			test('should toggle screen sharing on and off when enabled is omitted', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await mediaToggleScreenShareCommand(page);
				await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toBeVisible({ timeout: 15_000 });

				await mediaToggleScreenShareCommand(page);
				await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toHaveCount(0, {
					timeout: 15_000
				});
			});

			test('should be idempotent when setting the state it is already in', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleAudioCommand(page, true);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 5_000 });
				// A no-op set must not surface as a transition to the host either.
				await expect(eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED)).toHaveCount(0);
			});

			test('should invert the camera state correctly after a device was toggled across a leave and rejoin cycle', async ({
				page
			}) => {
				// Camera off in prejoin, join, leave.
				const first = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
				await first.meet('#camera-button').click();
				await expectPrejoinCameraEnabled(page, integration, false, { timeout: 10_000 });
				await first.meet('#join-button').click();
				await first.meet('#layout-container').waitFor({ state: 'visible', timeout: 15_000 });
				await leaveMeeting(page, { integration });

				// Re-entering starts from the room's default again. Toggle the camera off and back on so a
				// latched flag would be stale, then join.
				const second = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
				await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });
				await second.meet('#camera-button').click();
				await expectPrejoinCameraEnabled(page, integration, false, { timeout: 10_000 });
				await second.meet('#camera-button').click();
				await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });
				await second.meet('#join-button').click();
				await second.meet('#layout-container').waitFor({ state: 'visible', timeout: 15_000 });
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

				// The omitted toggle must read the CURRENT (real) state and turn the camera off.
				await mediaToggleVideoCommand(page);
				await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
			});

			// The commands are documented as controlling the local devices, and the prejoin
			// screen owns real local tracks — a host that mutes before the participant joins
			// must be obeyed on both transports, not silently dropped by one of them.
			test.describe('before joining the meeting (prejoin)', () => {
				/**
				 * Joins the rest of the way and reads the toolbar — the ground truth for what the
				 * command actually did to the real device. Distinct from the prejoin screen's OWN
				 * mic/camera button, which keeps its own display state and does not repaint on an
				 * external change (see the "prejoin screen indicator" tests below): asserting against
				 * it here would fail even when the command worked, and pass even when it didn't.
				 */
				const joinAndReadToolbar = async (
					meet: (selector: string) => import('@playwright/test').Locator
				): Promise<void> => {
					await meet('#join-button').click();
					await meet('#layout-container').waitFor({ state: 'visible', timeout: 15_000 });
				};

				test('should mute the microphone sent before joining the room', async ({ page }) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

					await mediaToggleAudioCommand(page, false);
					await joinAndReadToolbar(meet);

					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
				});

				test('should disable the camera sent before joining the room', async ({ page }) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

					await mediaToggleVideoCommand(page, false);
					await joinAndReadToolbar(meet);

					await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
				});

				test('should invert the microphone state when enabled is omitted before joining', async ({ page }) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

					// An ODD number of toggles, all still in prejoin: a real toggle ends up flipped
					// from the start (enabled); a dropped/no-op command would leave it unchanged, so
					// this — unlike a round trip — can tell the two apart with a single join at the end.
					await mediaToggleAudioCommand(page);
					await mediaToggleAudioCommand(page);
					await mediaToggleAudioCommand(page);
					await joinAndReadToolbar(meet);

					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
				});

				// The attribute only lowers the initial state (permissions still win, the control
				// stays live) — so the participant must be able to unmute from the prejoin screen and
				// have a later host toggle correctly mute them back, not just repeat "enable".
				test('should mute back a participant who unmuted from initial-audio-enabled=false, on a later omitted toggle', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, {
						integration,
						role: 'moderator',
						initialAudioEnabled: false
					});

					await meet('#microphone-button').click(); // participant unmutes themselves
					await mediaToggleAudioCommand(page); // host toggle: must read the mic as ON and mute it
					await joinAndReadToolbar(meet);

					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
				});

				test('should turn the camera back off for a participant who unmuted from initial-video-enabled=false, on a later omitted toggle', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, {
						integration,
						role: 'moderator',
						initialVideoEnabled: false
					});

					await meet('#camera-button').click();
					await mediaToggleVideoCommand(page);
					await joinAndReadToolbar(meet);

					await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
				});

				// The prejoin screen's OWN mic/camera button is a live indicator the participant looks
				// at while deciding whether to join — it must repaint on a host-driven change too, not
				// only on the participant's own click.
				test.describe('prejoin screen indicator', () => {
					test('should repaint the prejoin mic button when muted from outside', async ({ page }) => {
						await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
						await expectPrejoinMicEnabled(page, integration, true, { timeout: 10_000 });

						await mediaToggleAudioCommand(page, false);

						await expectPrejoinMicEnabled(page, integration, false, { timeout: 10_000 });
					});

					test('should repaint the prejoin camera button when disabled from outside', async ({ page }) => {
						await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
						await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });

						await mediaToggleVideoCommand(page, false);

						await expectPrejoinCameraEnabled(page, integration, false, { timeout: 10_000 });
					});
				});
			});
		});

		// The btn-legacy-* testapp buttons exist since F4 but nothing exercised them
		// end-to-end until now: this closes that gap by pressing each deprecated
		// command name and asserting the same real behavior as its canonical twin.
		test.describe('Deprecated Command Aliases', () => {
			test('should disconnect via the deprecated leaveRoom() alias', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomLegacyCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should end the meeting via the deprecated endMeeting() alias', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingLegacyCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				await expect(left).toContainText(LeftEventReason.MEETING_ENDED);
			});

			test('should kick a participant via the deprecated kickParticipant() alias', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				const speakerName = 'Speaker';
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

				const speakerJoined = await expectEvent(speakerPage, EmbeddedEventName.JOINED);
				const speakerJoinedText = (await speakerJoined.textContent()) ?? '';
				const match = speakerJoinedText.match(/"participantIdentity"\s*:\s*"([^"]+)"/);
				const speakerIdentity = match?.[1] ?? speakerName;

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await kickParticipantLegacyCommand(page, speakerIdentity);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);
				await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);

				await speakerContext.close();
			});
		});
	});
}

// Not parametrized over INTEGRATIONS like the rest of this file: this is a lifecycle question
// specific to the webcomponent transport. Unmounting and remounting <openvidu-meet> on a host
// page keeps the same custom-element loader and the same root Angular injector alive across the
// two meetings — the iframe transport has no equivalent, since re-entering with it tears down and
// reloads the whole frame document.
test.describe('MEDIA_TOGGLE Commands After Remounting the WebComponent', () => {
	const integration = 'webcomponent';
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test('should disable the camera by setting enabled explicitly after a remount', async ({ page }) => {
		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await leaveMeeting(page, { integration });

		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

		await mediaToggleVideoCommand(page, false);
		await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
	});

	test('should invert the camera state when enabled is omitted after a remount', async ({ page }) => {
		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await leaveMeeting(page, { integration });

		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

		await mediaToggleVideoCommand(page);
		await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
	});
});
