import {
	EmbeddedEventName,
	LeftEventReason,
	MeetEventOrigin,
	MeetWaitingParticipantStatus,
	MeetParticipantModerationAction,
	MeetReaction,
	MeetRecordingInfo,
	MeetRecordingStatus,
	MeetRoomMemberRole,
	MeetRoomOptions,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { INTEGRATIONS, meetLocator, wcLocator } from '../helpers/webcomponent.helper';
import { createRtmpSink, deleteRtmpSinks } from '../helpers/broadcast-sink.helper';
import {
	createRoom,
	decideOnWaitingParticipants,
	deleteRooms,
	getWaitingParticipants,
	getRecording,
	listMeetingParticipants
} from '../helpers/meet-api.helper';
import {
	expectPrejoinCameraEnabled,
	expectPrejoinMicEnabled,
	expectToolbarCameraEnabled,
	expectToolbarMicEnabled
} from '../helpers/media-controls.helper';
import {
	askToJoin,
	broadcastStartCommand,
	broadcastStartToCommand,
	broadcastStopAllCommand,
	broadcastStopCommand,
	endMeetingCommand,
	endMeetingLegacyCommand,
	eventLocator,
	eventPayloadField,
	eventPayloads,
	expectEvent,
	expectWebhook,
	participantHandChangedLocator,
	participantLowerAllHandsCommand,
	participantLowerHandCommand,
	participantRaiseHandCommand,
	joinedParticipantIdentity,
	kickParticipantCommand,
	kickParticipantLegacyCommand,
	leaveMeeting,
	leaveRoomCommand,
	leaveRoomLegacyCommand,
	waitingParticipantAdmitAllCommand,
	waitingParticipantAdmitCommand,
	waitingParticipantRejectAllCommand,
	waitingParticipantRejectCommand,
	mediaToggleAudioCommand,
	mediaToggleScreenShareCommand,
	mediaToggleVideoCommand,
	openMeeting,
	openMeetingAtMediaSetup,
	participantMuteAllCommand,
	participantMuteCommand,
	participantSendReactionCommand,
	participantReactionSentLocator,
	participantUpdateRoleCommand,
	recordingStartCommand,
	recordingEventLocator,
	recordingStopCommand,
	removeEmbeddedMeeting
} from '../helpers/testapp.helper';
import { getWebhookFromStorage } from '../helpers/ui-utils.helper';

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
			await deleteRtmpSinks();
		});

		test.describe('LEAVE_ROOM Command', () => {
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
			test('should end the meeting and emit left event with meeting_ended_by_self reason', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				expect(await eventPayloadField(left, 'reason')).toBe(LeftEventReason.MEETING_ENDED_BY_SELF);
			});

			test('should disconnect all participants when moderator ends the meeting', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker' });
				await expectEvent(speakerPage, EmbeddedEventName.JOINED);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });
				await expect(meetLocator(page, integration, '.OV_stream.local')).toBeVisible();
				await expect(wcLocator(speakerPage, '.OV_stream.local')).toBeVisible();
				await expect(wcLocator(speakerPage, '.OV_stream.remote')).toBeVisible();

				await endMeetingCommand(page);

				const moderatorLeft = await expectEvent(page, EmbeddedEventName.LEFT);
				expect(await eventPayloadField(moderatorLeft, 'reason')).toBe(LeftEventReason.MEETING_ENDED_BY_SELF);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);
				expect(await eventPayloadField(speakerLeft, 'reason')).toBe(LeftEventReason.MEETING_ENDED);

				await speakerContext.close();
			});
		});

		test.describe('KICK_PARTICIPANT Command', () => {
			test('should kick a speaker from the room, tell the kicked participant and keep the moderator in', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });

				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await kickParticipantCommand(page, speakerIdentity);

				const speakerLeft = await expectEvent(speakerPage, EmbeddedEventName.LEFT);

				await test.step('should kick a speaker from the room', async () => {
					await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);

					const left = await expectEvent(page, EmbeddedEventName.PARTICIPANT_LEFT);
					await expect(left).toContainText(`"participantIdentity":"${speakerIdentity}"`);
					await expect(left).toContainText(`"leaveReason":"${LeftEventReason.PARTICIPANT_KICKED}"`);
				});

				await test.step('should not disconnect the moderator who kicks a participant', async () => {
					await expect(meetLocator(page, integration, '#layout-container')).toBeVisible();
					await expect(eventLocator(page, EmbeddedEventName.LEFT)).toHaveCount(0);
				});

				await test.step('should emit left event with participant_kicked reason on the kicked participant', async () => {
					await expect(speakerLeft).toContainText('"reason"');
					await expect(speakerLeft).toContainText(LeftEventReason.PARTICIPANT_KICKED);
					await expect(speakerLeft).toContainText('"roomId"');
					await expect(speakerLeft).toContainText(roomId);
				});

				await leaveMeeting(page, { integration, role: 'moderator' });
				await speakerContext.close();
			});
		});

		// The mute commands are the only ones whose effect lands on ANOTHER participant's browser, so
		// every assertion here reads the target page's real device state — the toolbar buttons bind
		// straight off the track state, which a client-side-only "please mute" could not move.
		test.describe('PARTICIPANT_MUTE Command', () => {
			test('should turn off a speaker microphone, camera and screen share, and let them turn the microphone back on', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });
				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

				await expect(meetLocator(page, integration, '.OV_stream.remote')).toBeVisible({ timeout: 10_000 });

				await test.step('should turn off a speaker microphone and camera in one command', async () => {
					await participantMuteCommand(page, speakerIdentity, ['audio', 'video']);
					await expectToolbarMicEnabled(speakerPage, 'webcomponent', false, { timeout: 15_000 });
					await expectToolbarCameraEnabled(speakerPage, 'webcomponent', false, { timeout: 15_000 });
				});

				// A mute, not a lock: the speaker keeps their publish permission, so the toolbar must let
				// them back on, and a second mute must land on a device that was re-enabled.
				await test.step('should let the muted speaker turn the microphone back on', async () => {
					await wcLocator(speakerPage, '#mic-btn').click();
					await expectToolbarMicEnabled(speakerPage, 'webcomponent', true, { timeout: 10_000 });

					await participantMuteCommand(page, speakerIdentity, 'audio');
					await expectToolbarMicEnabled(speakerPage, 'webcomponent', false, { timeout: 15_000 });
				});

				// A LiveKit mute leaves the publication in place and the UI reads sharing off publication
				// presence, so this is the one device whose mute is only honest if the client unpublishes.
				await test.step('should stop a speaker screen share', async () => {
					await mediaToggleScreenShareCommand(speakerPage, true);
					const speakerScreenShare = wcLocator(speakerPage, '.OV_stream.screen-source.local');
					await expect(speakerScreenShare).toBeVisible({ timeout: 15_000 });

					await participantMuteCommand(page, speakerIdentity, 'screenShare');

					await expect(speakerScreenShare).toHaveCount(0, { timeout: 15_000 });
					const screenShareStatus = await expectEvent(
						speakerPage,
						EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED,
						{ count: 2 }
					);
					await expect(screenShareStatus.nth(1)).toContainText('"active":false');
					await expect(screenShareStatus.nth(1)).toContainText(MeetEventOrigin.MODERATOR);
				});

				await speakerContext.close();
			});

			// The permission is editable per role, so a speaker can be handed a command without being
			// handed the permission. A later moderator mute is the barrier: it reaches the target after
			// anything the speaker's earlier attempts could have caused.
			test('should not mute a speaker, nor change their role, when the caller lacks the participantMute and participantPromote permissions', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Actor' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const targetContext = await browser.newContext();
				const targetPage = await targetContext.newPage();
				await openMeeting(targetPage, roomId, { role: 'speaker', name: 'Target' });
				const targetIdentity = await joinedParticipantIdentity(targetPage);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await participantMuteCommand(page, targetIdentity, 'audio');
				await participantUpdateRoleCommand(page, targetIdentity, MeetParticipantModerationAction.UPGRADE);

				await participantMuteCommand(moderatorPage, targetIdentity, 'video');
				await expectToolbarCameraEnabled(targetPage, 'webcomponent', false, { timeout: 15_000 });

				await test.step('should not mute a speaker who lacks the participantMute permission', async () => {
					await expectToolbarMicEnabled(targetPage, 'webcomponent', true);
					await expect(eventLocator(targetPage, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED)).toHaveCount(0);
				});

				await test.step('should not change the role when the caller lacks the participantPromote permission', async () => {
					await expect(eventLocator(targetPage, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED)).toHaveCount(0);
				});

				await moderatorContext.close();
				await targetContext.close();
			});
		});

		test.describe('PARTICIPANT_UPDATE_ROLE Command', () => {
			test('should promote a speaker to moderator and demote them back', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });
				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

				await participantUpdateRoleCommand(page, speakerIdentity, MeetParticipantModerationAction.UPGRADE);
				const roleChanged = eventLocator(speakerPage, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED);
				await expect(roleChanged).toHaveCount(1, { timeout: 10_000 });
				await expect(roleChanged.first()).toContainText(`"role":"${MeetRoomMemberRole.MODERATOR}"`);

				await participantUpdateRoleCommand(page, speakerIdentity, MeetParticipantModerationAction.DOWNGRADE);
				await expect(roleChanged).toHaveCount(2, { timeout: 10_000 });
				await expect(roleChanged.nth(1)).toContainText(`"role":"${MeetRoomMemberRole.SPEAKER}"`);

				await speakerContext.close();
			});

			// The event promises the new role is in effect: a command only a moderator may send is
			// accepted as soon as the promoted participant is told.
			test('should let the promoted participant end the meeting right after being told', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });
				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

				await participantUpdateRoleCommand(page, speakerIdentity, MeetParticipantModerationAction.UPGRADE);
				await expectEvent(speakerPage, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED);

				await endMeetingCommand(speakerPage);

				const moderatorLeft = await expectEvent(page, EmbeddedEventName.LEFT);
				expect(await eventPayloadField(moderatorLeft, 'reason')).toBe(LeftEventReason.MEETING_ENDED);

				await speakerContext.close();
			});
		});

		// Muting everyone is one signal addressed to the participants it names, so the interesting
		// assertions are the exclusions: the other moderators and the caller must be left alone.
		test.describe('PARTICIPANT_MUTE_ALL Command', () => {
			test('should mute the speakers and leave the moderators and the caller untouched', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });
				await expectEvent(speakerPage, EmbeddedEventName.JOINED);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await participantMuteAllCommand(page, 'audio');

				// The speaker's mute is the round trip: the same signal would already have reached the
				// moderators, so their microphones being on is an exclusion and not a race.
				await expectToolbarMicEnabled(speakerPage, 'webcomponent', false, { timeout: 15_000 });
				await expectToolbarMicEnabled(moderatorPage, 'webcomponent', true);
				await expectToolbarMicEnabled(page, integration, true);

				await moderatorContext.close();
				await speakerContext.close();
			});
		});

		test.describe('RECORDING_START / RECORDING_STOP Commands', () => {
			test('should start and stop a recording, reporting its start and its end to the host and in its webhooks', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				let recordingId = '';

				await test.step('should start a recording, reporting its start to the host', async () => {
					await recordingStartCommand(page);

					const started = await expectEvent(page, EmbeddedEventName.RECORDING_STARTED, { timeout: 20_000 });
					recordingId = await eventPayloadField(started, 'recordingId');
					expect((await getRecording(recordingId)).roomId).toBe(roomId);
					await expect(
						recordingEventLocator(page, EmbeddedEventName.RECORDING_UPDATED, MeetRecordingStatus.ACTIVE)
					).toHaveCount(1, { timeout: 20_000 });
				});

				await test.step('should receive recordingStarted and recordingUpdated webhooks', async () => {
					await expectWebhook(page, MeetWebhookEventType.RECORDING_STARTED);

					const recordingStartedWebhook = await getWebhookFromStorage(
						page,
						roomId,
						MeetWebhookEventType.RECORDING_STARTED
					);
					expect(recordingStartedWebhook.event).toBe(MeetWebhookEventType.RECORDING_STARTED);
					expect(recordingStartedWebhook.data).toBeDefined();

					const startedRecording = recordingStartedWebhook.data as MeetRecordingInfo;
					expect(startedRecording.recordingId).toBe(recordingId);

					// startDate is compared apart: a recording still starting has not recorded anything yet,
					// so it carries no startDate while the one read back may already be active
					const { startDate: _startDate, ...actualRecording } = await getRecording(recordingId);
					expect(startedRecording).toMatchObject({
						...actualRecording,
						status: expect.stringMatching(/active|starting/)
					});

					if (startedRecording.status === MeetRecordingStatus.ACTIVE) {
						expect(startedRecording.startDate).toEqual(expect.any(Number));
					} else {
						expect(startedRecording.startDate).toBeUndefined();
					}

					await expectWebhook(page, MeetWebhookEventType.RECORDING_UPDATED);

					const recordingUpdatedWebhook = await getWebhookFromStorage(
						page,
						roomId,
						MeetWebhookEventType.RECORDING_UPDATED
					);
					expect(recordingUpdatedWebhook.event).toBe(MeetWebhookEventType.RECORDING_UPDATED);
					expect(recordingUpdatedWebhook.data).toBeDefined();
					expect((recordingUpdatedWebhook.data as MeetRecordingInfo).recordingId).toBe(recordingId);
					expect(recordingUpdatedWebhook.data).toMatchObject((await getRecording(recordingId)) as any);
				});

				await test.step('should stop a recording, reporting its end to the host', async () => {
					await recordingStopCommand(page);

					const complete = recordingEventLocator(
						page,
						EmbeddedEventName.RECORDING_ENDED,
						MeetRecordingStatus.COMPLETE
					);
					await expect(complete).toHaveCount(1, { timeout: 20_000 });
					await expect(complete).toContainText(recordingId);
				});

				await test.step('should receive recordingEnded webhook', async () => {
					await expectWebhook(page, MeetWebhookEventType.RECORDING_ENDED);

					const recordingEndedWebhook = await getWebhookFromStorage(
						page,
						roomId,
						MeetWebhookEventType.RECORDING_ENDED
					);
					expect(recordingEndedWebhook.event).toBe(MeetWebhookEventType.RECORDING_ENDED);
					expect(recordingEndedWebhook.data).toBeDefined();
					expect((recordingEndedWebhook.data as MeetRecordingInfo).recordingId).toBe(recordingId);
					expect(recordingEndedWebhook.data).toMatchObject((await getRecording(recordingId)) as any);
				});
			});

			// The server reports a new recording some time after accepting it: a stop sent before that
			// must still end the recording the start created, which LiveKit aborts when it has captured
			// nothing yet.
			test('should stop a recording asked to stop right after starting', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await recordingStartCommand(page);
				await recordingStopCommand(page);

				const ended = eventLocator(page, EmbeddedEventName.RECORDING_ENDED).filter({
					hasText: /"status":"(complete|aborted)"/
				});
				await expect(ended).toHaveCount(1, { timeout: 30_000 });
				await expectWebhook(page, MeetWebhookEventType.RECORDING_ENDED);
			});
		});

		// The media commands are the first ones meant to work BEFORE the room is
		// connected too (the prejoin screen has real local tracks), and the first with an
		// optional boolean: omitted = toggle, provided = set. Both halves of that contract
		// are asserted here against the participant's real device state.
		test.describe('PARTICIPANT_RAISE_HAND / PARTICIPANT_LOWER_HAND / PARTICIPANT_LOWER_ALL_HANDS Commands', () => {
			test('should let a moderator lower another participant hand, attributed to the moderator', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: 'Speaker' });
				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

				await participantRaiseHandCommand(speakerPage);
				await expect(participantHandChangedLocator(page, speakerIdentity, true)).toHaveCount(1, {
					timeout: 15_000
				});

				await participantLowerHandCommand(page, speakerIdentity);

				const lowered = participantHandChangedLocator(speakerPage, speakerIdentity, false);
				await expect(lowered).toHaveCount(1, { timeout: 15_000 });
				await expect(lowered).toContainText(MeetEventOrigin.MODERATOR);
				await expect(participantHandChangedLocator(page, speakerIdentity, false)).toContainText(
					MeetEventOrigin.MODERATOR
				);

				await speakerContext.close();
			});

			test('should not lower another participant hand for a speaker who lacks participantLowerHand', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Actor' });
				const actorIdentity = await joinedParticipantIdentity(page);

				const targetContext = await browser.newContext();
				const targetPage = await targetContext.newPage();
				await openMeeting(targetPage, roomId, { role: 'speaker', name: 'Target' });
				const targetIdentity = await joinedParticipantIdentity(targetPage);

				await participantRaiseHandCommand(targetPage);
				await expect(participantHandChangedLocator(page, targetIdentity, true)).toHaveCount(1, {
					timeout: 15_000
				});

				await participantLowerHandCommand(page, targetIdentity);
				// The actor's own hand is the round trip the rejected command never made.
				await participantRaiseHandCommand(page);
				await expect(participantHandChangedLocator(page, actorIdentity, true)).toHaveCount(1, {
					timeout: 15_000
				});

				await expect(participantHandChangedLocator(targetPage, targetIdentity, false)).toHaveCount(0);

				await targetContext.close();
			});

			test('should lower every raised hand at once', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const contexts = [];
				const identities: string[] = [];

				for (const name of ['First', 'Second']) {
					const context = await browser.newContext();
					const speakerPage = await context.newPage();
					await openMeeting(speakerPage, roomId, { role: 'speaker', name });
					identities.push(await joinedParticipantIdentity(speakerPage));
					await participantRaiseHandCommand(speakerPage);
					contexts.push(context);
				}

				for (const identity of identities) {
					await expect(participantHandChangedLocator(page, identity, true)).toHaveCount(1, {
						timeout: 15_000
					});
				}

				await participantLowerAllHandsCommand(page);

				for (const identity of identities) {
					const lowered = participantHandChangedLocator(page, identity, false);
					await expect(lowered).toHaveCount(1, { timeout: 15_000 });
					await expect(lowered).toContainText(MeetEventOrigin.MODERATOR);
				}

				for (const context of contexts) {
					await context.close();
				}
			});
		});

		test.describe('PARTICIPANT_SEND_REACTION Command', () => {
			test('should raise and lower the own hand and send a reaction, telling everyone who did it', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Raiser' });
				const raiserIdentity = await joinedParticipantIdentity(page);

				const observerContext = await browser.newContext();
				const observerPage = await observerContext.newPage();
				await openMeeting(observerPage, roomId, { role: 'speaker', name: 'Observer' });
				await expectEvent(observerPage, EmbeddedEventName.JOINED);

				await test.step('should raise and lower the own hand, telling everyone', async () => {
					await participantRaiseHandCommand(page);

					const raised = participantHandChangedLocator(page, raiserIdentity, true);
					await expect(raised).toHaveCount(1, { timeout: 15_000 });
					await expect(raised).toContainText('"handRaiseDate":');
					await expect(raised).toContainText(MeetEventOrigin.PARTICIPANT);
					await expect(participantHandChangedLocator(observerPage, raiserIdentity, true)).toHaveCount(1, {
						timeout: 15_000
					});
					await expect(meetLocator(page, integration, '#raise-hand-button')).toHaveClass(/active/);

					await participantLowerHandCommand(page);

					const lowered = participantHandChangedLocator(page, raiserIdentity, false);
					await expect(lowered).toHaveCount(1, { timeout: 15_000 });
					await expect(lowered).toContainText(MeetEventOrigin.PARTICIPANT);
					await expect(lowered).not.toContainText('handRaiseDate');
					await expect(meetLocator(page, integration, '#raise-hand-button')).not.toHaveClass(/active/);
				});

				await test.step('should send a reaction, telling everyone who sent it', async () => {
					await participantSendReactionCommand(page, MeetReaction.CLAPPING_HANDS);

					const sent = participantReactionSentLocator(page, raiserIdentity, MeetReaction.CLAPPING_HANDS);
					await expect(sent).toHaveCount(1, { timeout: 15_000 });
					await expect(sent).toContainText('"participantName":"Raiser"');
					await expect(
						participantReactionSentLocator(observerPage, raiserIdentity, MeetReaction.CLAPPING_HANDS)
					).toHaveCount(1, {
						timeout: 15_000
					});
					await expect(meetLocator(page, integration, '#reactions-button')).toHaveClass(/active/);
				});

				await observerContext.close();
			});
		});

		test.describe('MEDIA_TOGGLE Commands', () => {
			test('should mute and unmute the microphone through the command, once per transition, and keep toggling after the participant changed the state from the UI', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });

				const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
				// Joining with the microphone on is the initial state, not a transition.
				await expect(audioStatus).toHaveCount(0);

				await test.step('should mute and unmute the microphone by setting active explicitly', async () => {
					await mediaToggleAudioCommand(page, false);
					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

					await mediaToggleAudioCommand(page, true);
					await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
				});

				await test.step('should emit mediaAudioStatusChanged once per microphone transition', async () => {
					await expect(audioStatus).toHaveCount(2, { timeout: 10_000 });
					await expect(audioStatus.first()).toContainText('"active":false');
					await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
					await expect(audioStatus.nth(1)).toContainText('"active":true');
				});

				await test.step('should invert the microphone state when active is omitted', async () => {
					await mediaToggleAudioCommand(page);
					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

					// The second toggle must read the CURRENT state, not a stale snapshot.
					await mediaToggleAudioCommand(page);
					await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
				});

				// The host and the in-meeting UI must share one source of truth: a UI mute
				// followed by a host toggle has to unmute, not re-mute.
				await test.step('should keep toggling after the participant changed the state from the UI', async () => {
					await meetLocator(page, integration, '#mic-btn').click();
					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });

					await mediaToggleAudioCommand(page);
					await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });
				});

				// Not command-specific: any real transition of the local device is notified.
				await test.step('should emit the audio event for a mute done from the in-meeting UI', async () => {
					await expect(audioStatus).toHaveCount(6, { timeout: 10_000 });
					await expect(audioStatus.nth(4)).toContainText('"active":false');
				});
			});

			test('should disable and enable the camera through the command, once per transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

				const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
				await expect(videoStatus).toHaveCount(0);

				await test.step('should disable and enable the camera by setting active explicitly', async () => {
					await mediaToggleVideoCommand(page, false);
					await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });

					await mediaToggleVideoCommand(page, true);
					await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });
				});

				await test.step('should emit mediaVideoStatusChanged once per camera transition', async () => {
					await expect(videoStatus).toHaveCount(2, { timeout: 10_000 });
					await expect(videoStatus.first()).toContainText('"active":false');
					await expect(videoStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
					await expect(videoStatus.nth(1)).toContainText('"active":true');
				});

				await test.step('should invert the camera state when active is omitted', async () => {
					await mediaToggleVideoCommand(page);
					await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });

					await mediaToggleVideoCommand(page);
					await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });
				});
			});

			test('should start and stop screen sharing through the command, once per transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const screenShareStatus = eventLocator(page, EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED);
				await expect(screenShareStatus).toHaveCount(0);

				await test.step('should start and stop screen sharing by setting active explicitly', async () => {
					await mediaToggleScreenShareCommand(page, true);
					await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toBeVisible({
						timeout: 15_000
					});

					await mediaToggleScreenShareCommand(page, false);
					await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toHaveCount(0, {
						timeout: 15_000
					});
				});

				await test.step('should emit mediaScreenShareStatusChanged on start and stop', async () => {
					await expect(screenShareStatus).toHaveCount(2, { timeout: 15_000 });
					await expect(screenShareStatus.first()).toContainText('"active":true');
					await expect(screenShareStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
					await expect(screenShareStatus.nth(1)).toContainText('"active":false');
				});

				await test.step('should toggle screen sharing on and off when active is omitted', async () => {
					await mediaToggleScreenShareCommand(page);
					await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toBeVisible({
						timeout: 15_000
					});

					await mediaToggleScreenShareCommand(page);
					await expect(meetLocator(page, integration, '.OV_stream.screen-source.local')).toHaveCount(0, {
						timeout: 15_000
					});
				});
			});

			test('should invert the camera state correctly after a device was toggled across a leave and rejoin cycle', async ({
				page
			}) => {
				// Camera off in prejoin, join, leave.
				const first = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
				await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });
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
				 * Joins the rest of the way and reads the toolbar: the ground truth for what the command
				 * actually did to the real device. A command that depends on an earlier one (or on the
				 * participant's own click) is sent only once the prejoin indicator shows that one's effect,
				 * because the device state is applied asynchronously and a toggle reads the state as it is.
				 */
				const joinAndReadToolbar = async (
					meet: (selector: string) => import('@playwright/test').Locator
				): Promise<void> => {
					await meet('#join-button').click();
					await meet('#layout-container').waitFor({ state: 'visible', timeout: 15_000 });
				};

				test('should mute the microphone sent before joining the room, repaint its prejoin button and report it once', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
					await expectPrejoinMicEnabled(page, integration, true, { timeout: 10_000 });

					const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
					await expect(audioStatus).toHaveCount(0);

					await mediaToggleAudioCommand(page, false);

					await test.step('should repaint the prejoin mic button when muted from outside', async () => {
						await expectPrejoinMicEnabled(page, integration, false, { timeout: 10_000 });
					});

					await test.step('should emit mediaAudioStatusChanged for a mute done before joining', async () => {
						await expect(audioStatus).toHaveCount(1, { timeout: 10_000 });
						await expect(audioStatus.first()).toContainText('"active":false');
						await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
					});

					await joinAndReadToolbar(meet);

					await test.step('should mute the microphone sent before joining the room', async () => {
						await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
					});

					await test.step('should not repeat the prejoin state when the participant joins', async () => {
						await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
						await expect(audioStatus).toHaveCount(1);
					});
				});

				test('should disable the camera sent before joining the room, repaint its prejoin button and report it', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });
					await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });

					const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
					await expect(videoStatus).toHaveCount(0);

					await mediaToggleVideoCommand(page, false);

					await test.step('should repaint the prejoin camera button when disabled from outside', async () => {
						await expectPrejoinCameraEnabled(page, integration, false, { timeout: 10_000 });
					});

					await test.step('should emit mediaVideoStatusChanged for a camera disabled before joining', async () => {
						await expect(videoStatus).toHaveCount(1, { timeout: 10_000 });
						await expect(videoStatus.first()).toContainText('"active":false');
					});

					await joinAndReadToolbar(meet);

					await test.step('should disable the camera sent before joining the room', async () => {
						await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
					});
				});

				test('should invert the microphone state when active is omitted before joining', async ({ page }) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

					// An ODD number of toggles, all still in prejoin: a real toggle ends up flipped
					// from the start (active); a dropped/no-op command would leave it unchanged, so
					// this — unlike a round trip — can tell the two apart with a single join at the end.
					await mediaToggleAudioCommand(page);
					await expectPrejoinMicEnabled(page, integration, false, { timeout: 10_000 });
					await mediaToggleAudioCommand(page);
					await expectPrejoinMicEnabled(page, integration, true, { timeout: 10_000 });
					await mediaToggleAudioCommand(page);
					await joinAndReadToolbar(meet);

					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
				});

				// The attribute only lowers the initial state (permissions still win, the control
				// stays live) — so the participant must be able to unmute from the prejoin screen and
				// have a later host toggle correctly mute them back, not just repeat "enable".
				test('should mute back a participant who unmuted from initial-audio-active=false, on a later omitted toggle', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, {
						integration,
						role: 'moderator',
						initialAudioActive: false
					});

					await meet('#microphone-button').click(); // participant unmutes themselves
					// The device opens asynchronously: a toggle sent before it did would read the mic as OFF.
					await expectPrejoinMicEnabled(page, integration, true, { timeout: 10_000 });
					await mediaToggleAudioCommand(page); // host toggle: must read the mic as ON and mute it
					await joinAndReadToolbar(meet);

					await expectToolbarMicEnabled(page, integration, false, { timeout: 10_000 });
				});

				test('should turn the camera back off for a participant who unmuted from initial-video-active=false, on a later omitted toggle', async ({
					page
				}) => {
					const { meet } = await openMeetingAtMediaSetup(page, roomId, {
						integration,
						role: 'moderator',
						initialVideoActive: false
					});

					await meet('#camera-button').click();
					await expectPrejoinCameraEnabled(page, integration, true, { timeout: 10_000 });
					await mediaToggleVideoCommand(page);
					await joinAndReadToolbar(meet);

					await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
				});
			});
		});

		// The btn-legacy-* testapp buttons exist since F4 but nothing exercised them
		// end-to-end until now: this closes that gap by pressing each deprecated
		// command name and asserting the same real behavior as its canonical twin.
		// The room streams to an RTMP ingress of the LiveKit deployment under test, the one sink the
		// egress can reach here; the stream key never comes back from the API.
		test.describe('BROADCAST Commands', () => {
			let broadcastRoomId: string;
			let sinkUrl: string;

			test.beforeEach(async () => {
				sinkUrl = await createRtmpSink(`commands-${integration}`);
				({ roomId: broadcastRoomId } = await createRoom({
					config: { broadcast: { enabled: true, destinations: [{ name: 'Sink', url: sinkUrl }] } }
				}));
				createdRoomIds.push(broadcastRoomId);
			});

			test('should start only the destinations named, and stop only the broadcast named', async ({ page }) => {
				const destinations = [
					{ name: 'Sink A', url: await createRtmpSink(`commands-a-${integration}`) },
					{ name: 'Sink B', url: await createRtmpSink(`commands-b-${integration}`) }
				];
				const { roomId } = await createRoom({ config: { broadcast: { enabled: true, destinations } } });
				createdRoomIds.push(roomId);
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await broadcastStartToCommand(page, ['Sink B']);
				await expect(await expectEvent(page, EmbeddedEventName.BROADCAST_STARTED)).toContainText('Sink B');

				await broadcastStartCommand(page);
				const started = await expectEvent(page, EmbeddedEventName.BROADCAST_STARTED, { count: 2 });
				await expect(started.nth(1)).toContainText('Sink A');

				await broadcastStopCommand(page, 'Sink B');
				const ended = await expectEvent(page, EmbeddedEventName.BROADCAST_ENDED, { timeout: 30_000 });
				await expect(ended).toContainText('Sink B');

				await broadcastStopAllCommand(page);
				await expectEvent(page, EmbeddedEventName.BROADCAST_ENDED, { count: 2, timeout: 30_000 });
				await expect(ended.nth(1)).toContainText('Sink A');
			});

			test('should not start a broadcast for a speaker who lacks broadcastControl', async ({ page }) => {
				await openMeeting(page, broadcastRoomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await broadcastStartCommand(page);

				await page.waitForTimeout(3_000);
				await expect(eventLocator(page, EmbeddedEventName.BROADCAST_STARTED)).toHaveCount(0);
				await expect(meetLocator(page, integration, '#broadcast-tag')).toHaveCount(0);
			});
		});

		test.describe('Waiting participant commands', () => {
			const contexts: BrowserContext[] = [];
			let lockedRoomId: string;

			const createLockedRoom = async (options: MeetRoomOptions = {}): Promise<void> => {
				({ roomId: lockedRoomId } = await createRoom({
					...options,
					access: { lock: { enabled: true }, ...options.access }
				}));
				createdRoomIds.push(lockedRoomId);
			};

			/** Asks to join as `name` from a web component of its own browser context, closed after the test. */
			const waiter = async (browser: Browser, name: string): Promise<Page> => {
				const context = await browser.newContext();
				contexts.push(context);
				const waiterPage = await context.newPage();
				await askToJoin(waiterPage, lockedRoomId, { name });
				return waiterPage;
			};

			/** Who waits, by name, sorted: the list promises no order. */
			const waitingNames = async (): Promise<string[]> =>
				(await getWaitingParticipants(lockedRoomId)).participants
					.map(({ participantName }) => participantName)
					.sort();

			const identityOf = async (name: string): Promise<string> => {
				const { participants } = await getWaitingParticipants(lockedRoomId);
				return participants.find(({ participantName }) => participantName === name)!.participantIdentity;
			};

			const meetingNames = async (): Promise<string[]> =>
				(await listMeetingParticipants(lockedRoomId)).map(({ participantName }) => participantName).sort();
			const waitingStates = async (target: Page): Promise<MeetWaitingParticipantStatus[]> =>
				(
					await eventPayloads<{ status: MeetWaitingParticipantStatus }>(
						target,
						EmbeddedEventName.WAITING_PARTICIPANT_STATUS_CHANGED
					)
				).map(({ status }) => status);
			const expectRejected = (waiterPage: Page) =>
				expect(wcLocator(waiterPage, '#waiting-outcome-rejected')).toBeVisible({ timeout: 10_000 });

			test.afterEach(async () => {
				await Promise.all(contexts.splice(0).map((context) => context.close().catch(() => {})));
			});

			test('should admit with waitingParticipantAdmit the participant named', async ({ page, browser }) => {
				await createLockedRoom();
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator', name: 'Host' });
				await waiter(browser, 'Zoe');
				await waiter(browser, 'Ana');

				await waitingParticipantAdmitCommand(page, await identityOf('Ana'));

				await expect.poll(waitingNames).toEqual(['Zoe']);
				await expect.poll(meetingNames, { timeout: 20_000 }).toEqual(['Ana', 'Host']);
			});

			test('should admit everyone waiting with waitingParticipantAdmitAll', async ({ page, browser }) => {
				await createLockedRoom({ config: { maxParticipants: 3 } });
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator', name: 'Host' });
				await waiter(browser, 'Zoe');
				await waiter(browser, 'Ana');

				await waitingParticipantAdmitAllCommand(page);

				await expect.poll(waitingNames).toEqual([]);
				await expect.poll(meetingNames, { timeout: 20_000 }).toEqual(['Ana', 'Host', 'Zoe']);
			});

			test('should admit nobody with waitingParticipantAdmitAll when not everyone fits', async ({
				page,
				browser
			}) => {
				await createLockedRoom({ config: { maxParticipants: 2 } });
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator', name: 'Host' });
				await waiter(browser, 'Zoe');
				await waiter(browser, 'Ana');

				await waitingParticipantAdmitAllCommand(page);

				await expect(
					meetLocator(
						page,
						integration,
						'.ov-notification[data-kind="waiting-participants-not-enough-places"]'
					)
				).toBeVisible({ timeout: 10_000 });
				expect(await waitingNames()).toEqual(['Ana', 'Zoe']);
				expect(await meetingNames()).toEqual(['Host']);
			});

			test('should reject with waitingParticipantReject the participant named', async ({ page, browser }) => {
				await createLockedRoom();
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator' });
				await waiter(browser, 'Zoe');
				const ana = await waiter(browser, 'Ana');

				await waitingParticipantRejectCommand(page, await identityOf('Ana'));

				await expectRejected(ana);
				expect(await waitingNames()).toEqual(['Zoe']);
			});

			test('should reject everyone waiting with waitingParticipantRejectAll', async ({ page, browser }) => {
				await createLockedRoom();
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator' });
				const zoe = await waiter(browser, 'Zoe');
				const ana = await waiter(browser, 'Ana');
				await expect
					.poll(
						async () =>
							(
								await eventPayloads<{ participants: unknown[] }>(
									page,
									EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED
								)
							).at(-1)?.participants.length,
						{ timeout: 10_000 }
					)
					.toBe(2);

				await waitingParticipantRejectAllCommand(page);

				await expectRejected(zoe);
				await expectRejected(ana);
				expect(await waitingNames()).toEqual([]);
			});

			test('should not decide on anyone when the caller lacks the waitingParticipantAdmin permission', async ({
				page,
				browser
			}) => {
				await createLockedRoom({ roles: { moderator: { permissions: { waitingParticipantAdmin: false } } } });
				await openMeeting(page, lockedRoomId, {
					integration,
					role: 'moderator',
					initialVideoActive: true
				});
				const zoe = await waiter(browser, 'Zoe');
				const zoeIdentity = await identityOf('Zoe');

				await waitingParticipantRejectCommand(page, zoeIdentity);
				await waitingParticipantAdmitAllCommand(page);
				// Commands run in order: once this one shows, the two before it were turned down.
				await mediaToggleVideoCommand(page, false);
				await expect(
					eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED).filter({
						hasText: '"active":false'
					})
				).toHaveCount(1, { timeout: 10_000 });

				expect(await waitingNames()).toEqual(['Zoe']);
				await expect(wcLocator(zoe, '#waiting-screen')).toBeVisible();
				expect(await waitingStates(zoe)).toEqual([MeetWaitingParticipantStatus.WAITING]);
			});

			test('should stop waiting with meetingLeave, without meetingLeft', async ({ page }) => {
				await createLockedRoom();
				const { meet } = await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
				const ben = await identityOf('Ben');
				await expect.poll(() => waitingStates(page)).toEqual([MeetWaitingParticipantStatus.WAITING]);

				await leaveRoomCommand(page);

				await expect(meet('#waiting-outcome-left')).toBeVisible({ timeout: 10_000 });
				await expect
					.poll(() => waitingStates(page))
					.toEqual([MeetWaitingParticipantStatus.WAITING, MeetWaitingParticipantStatus.LEFT]);
				await expect.poll(waitingNames, { timeout: 5_000 }).toEqual([]);
				const left = await getWebhookFromStorage(
					page,
					lockedRoomId,
					MeetWebhookEventType.WAITING_PARTICIPANT_STATUS_CHANGED
				);
				expect(left.data).toMatchObject({
					status: MeetWaitingParticipantStatus.LEFT,
					origin: MeetEventOrigin.PARTICIPANT,
					participant: { participantIdentity: ben }
				});
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
			});

			if (integration === 'webcomponent') {
				test('should stop waiting with meetingLeave even when the host removes the element right after', async ({
					page
				}) => {
					await createLockedRoom();
					await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
					await expect.poll(() => waitingStates(page)).toEqual([MeetWaitingParticipantStatus.WAITING]);

					await leaveRoomCommand(page);
					await removeEmbeddedMeeting(page, integration);

					await expect.poll(waitingNames, { timeout: 5_000 }).toEqual([]);
					const left = await getWebhookFromStorage(
						page,
						lockedRoomId,
						MeetWebhookEventType.WAITING_PARTICIPANT_STATUS_CHANGED
					);
					expect(left.data).toMatchObject({
						status: MeetWaitingParticipantStatus.LEFT,
						origin: MeetEventOrigin.PARTICIPANT
					});
				});
			}

			test('should turn the camera off with mediaToggleVideo while waiting and join with it off', async ({
				page
			}) => {
				await createLockedRoom();
				await askToJoin(page, lockedRoomId, { integration, name: 'Ben', initialVideoActive: true });
				await expectPrejoinCameraEnabled(page, integration, true);

				await mediaToggleVideoCommand(page, false);
				await expectPrejoinCameraEnabled(page, integration, false);

				await decideOnWaitingParticipants(lockedRoomId, 'admit');
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED, { timeout: 20_000 });
				await expectToolbarCameraEnabled(page, integration, false);
			});
		});

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
				expect(await eventPayloadField(left, 'reason')).toBe(LeftEventReason.MEETING_ENDED_BY_SELF);
			});

			test('should kick a participant via the deprecated kickParticipant() alias', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const speakerContext = await browser.newContext();
				const speakerPage = await speakerContext.newPage();
				const speakerName = 'Speaker';
				await openMeeting(speakerPage, roomId, { role: 'speaker', name: speakerName });

				const speakerIdentity = await joinedParticipantIdentity(speakerPage);

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

	test('should disable the camera by setting active explicitly after a remount', async ({ page }) => {
		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await leaveMeeting(page, { integration });

		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

		await mediaToggleVideoCommand(page, false);
		await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
	});

	test('should invert the camera state when active is omitted after a remount', async ({ page }) => {
		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await leaveMeeting(page, { integration });

		await openMeeting(page, roomId, { integration, role: 'moderator' });
		await expectToolbarCameraEnabled(page, integration, true, { timeout: 10_000 });

		await mediaToggleVideoCommand(page);
		await expectToolbarCameraEnabled(page, integration, false, { timeout: 10_000 });
	});
});
