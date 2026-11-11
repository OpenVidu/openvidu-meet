import {
	EmbeddedAttribute,
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	LeftEventReason,
	MeetBroadcastStatus,
	MeetEventOrigin,
	MeetLobbyParticipant,
	MeetLobbyStatus,
	MeetParticipantJoinedPayload,
	MeetParticipantLeftPayload,
	MeetParticipantModerationAction,
	MeetRecordingStatus,
	MeetRoomConfigOptions,
	MeetRoomMemberRole,
	MeetWebhookEventType
} from '@openvidu-meet/typings';
import { Browser, BrowserContext, expect, Locator, Page, test, WebSocketRoute } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../config';
import { createRtmpSink, deleteRtmpSinks } from '../helpers/broadcast-sink.helper';
import { INTEGRATIONS, meetLocator, waitForPageRedirect } from '../helpers/webcomponent.helper';
import {
	createRoom,
	decideOnLobby,
	deleteRooms,
	getLobby,
	getRecordingUrl,
	getRoom,
	listRecordingsByRoomId,
	updateParticipantRole,
	waitForMeetingParticipant
} from '../helpers/meet-api.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { openWebcomponentWithAttributes } from '../helpers/webcomponent-attributes.helper';
import {
	askToJoin,
	broadcastStartCommand,
	broadcastStopCommand,
	endMeetingCommand,
	eventLocator,
	eventPayloadField,
	eventPayloads,
	eventSequence,
	expectEvent,
	participantHandChangedLocator,
	participantHandRaiseCommand,
	joinedParticipantIdentity,
	leaveMeeting,
	leaveRoomCommand,
	mediaToggleAudioCommand,
	mediaToggleScreenShareCommand,
	mediaToggleVideoCommand,
	openMeeting,
	openMeetingAtMediaSetup,
	participantMuteCommand,
	participantUpdateRoleCommand,
	recordHostEvents,
	recordingStatusLocator,
	removeEmbeddedMeeting
} from '../helpers/testapp.helper';
import { getWebhookFromStorage, webhooksFromStorage } from '../helpers/ui-utils.helper';

const LEAVE_REDIRECT_URL = `${MEET_TESTAPP_URL.replace(/\/$/, '')}/?left`;

/** The realtime connection of a waiting screen to Meet. */
const REALTIME_CHANNEL = /\/internal-api\/v1\/ws\?/;
/** Meet forgets a knock whose waiting screen never connects 15 s after it; its sweep runs every 5 s. */
const UNCONNECTED_KNOCK_TIMEOUT = 40_000;
/** Meet forgets a waiter whose connection has been gone for a minute; its sweep runs every 5 s. */
const PLACE_LOST_TIMEOUT = 90_000;
/** A waiter's state is sent again at every answered ping, every 20 s, and the waiting list read every 30 s. */
const NEXT_STATE_TIMEOUT = 40_000;

type LobbyStatusChangedPayload = EmbeddedEventPayloadFor<EmbeddedEventName.LOBBY_STATUS_CHANGED>;
type LobbyUpdatedPayload = EmbeddedEventPayloadFor<EmbeddedEventName.LOBBY_UPDATED>;
type ParticipantKnockedPayload = EmbeddedEventPayloadFor<EmbeddedEventName.PARTICIPANT_KNOCKED>;

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
			await deleteRtmpSinks();
		});

		/** The room's moderator link with a secret the room does not have. */
		const invalidLink = async (): Promise<string> => {
			const url = new URL((await getRoom(roomId)).access.anonymous.moderator.url);
			url.searchParams.set('secret', 'not-the-room-secret');
			return url.toString();
		};

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

			test('should receive left event with meeting_ended_by_self reason when the moderator ends the meeting', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);

				const left = await expectEvent(page, EmbeddedEventName.LEFT);
				expect(await eventPayloadField(left, 'reason')).toBe(LeftEventReason.MEETING_ENDED_BY_SELF);
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

		test.describe('EMBEDDED_CLOSE_REQUESTED Event', () => {
			test('should receive embeddedCloseRequested after leaving as moderator', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED).first()).toBeVisible({
					timeout: 5_000
				});
			});

			test('should receive embeddedCloseRequested after ending meeting', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await endMeetingCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED).first()).toBeVisible({
					timeout: 5_000
				});
			});

			test('should receive embeddedCloseRequested from the Back button of an anonymous participant join screen', async ({
				page
			}) => {
				const room = await getRoom(roomId);
				await openWebcomponentWithAttributes(
					page,
					{ [EmbeddedAttribute.ROOM_URL]: room.access.anonymous.speaker.url },
					{ integration }
				);
				const back = meetLocator(page, integration, '.quick-action-button').first();

				await expect(back).toContainText('Back', { timeout: 15_000 });
				await expect(back).not.toContainText('Back to Rooms');
				await back.click();

				await expectEvent(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED);
				await expect(meetLocator(page, integration, '#participant-name-input')).toBeVisible();
			});

			test('should receive embeddedCloseRequested from the button of an access error screen', async ({
				page
			}) => {
				await openWebcomponentWithAttributes(
					page,
					{ [EmbeddedAttribute.ROOM_URL]: await invalidLink() },
					{
						integration
					}
				);
				const errorTitle = meetLocator(page, integration, '.error-title');

				await expect(errorTitle).toHaveText('Invalid link', { timeout: 15_000 });
				await meetLocator(page, integration, '.error-actions button').click();

				await expectEvent(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED);
				await expect(errorTitle).toBeVisible();
			});

			test('should receive embeddedCloseRequested from an access error screen before its leave redirect', async ({
				page
			}) => {
				const received = await recordHostEvents(page);
				await openWebcomponentWithAttributes(
					page,
					{
						[EmbeddedAttribute.ROOM_URL]: await invalidLink(),
						[EmbeddedAttribute.LEAVE_REDIRECT_URL]: LEAVE_REDIRECT_URL
					},
					{ integration }
				);

				await expect(meetLocator(page, integration, '.error-title')).toHaveText('Invalid link', {
					timeout: 15_000
				});
				await meetLocator(page, integration, '.error-actions button').click();

				await waitForPageRedirect(page, LEAVE_REDIRECT_URL);
				expect(received).toContain(EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED);
			});

			test.describe('from a recording screen', () => {
				let recordingUrl: string;

				test.beforeAll(async ({ browser }) => {
					const room = await createRoom();
					createdRoomIds.push(room.roomId);
					const context = await browser.newContext();
					const page = await context.newPage();

					try {
						await openMeeting(page, room.roomId, { role: 'moderator' });
						await startRecording(page);
						await stopRecording(page);
						await endMeetingCommand(page);
					} finally {
						await context.close();
					}

					const [recording] = await listRecordingsByRoomId(room.roomId);
					recordingUrl = await getRecordingUrl(recording.recordingId);
				});

				test('should receive embeddedCloseRequested when the recording opened by its link is closed', async ({
					page
				}) => {
					await openWebcomponentWithAttributes(
						page,
						{ [EmbeddedAttribute.RECORDING_URL]: recordingUrl },
						{
							integration
						}
					);
					const recordingPage = meetLocator(page, integration, '.recording-page-content, .mobile-container');

					await meetLocator(page, integration, '.desktop-back-button, .back-button')
						.first()
						.click({ timeout: 15_000 });

					await expectEvent(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED);
					await expect(recordingPage.first()).toBeVisible();
				});
			});
		});

		test.describe('RECORDING_STATUS_CHANGED Event', () => {
			// The status reaches everyone in the meeting, not only whoever started the recording.
			test('should report the recording status to a participant who did not start it', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await startRecording(moderatorPage);

				const active = recordingStatusLocator(page, MeetRecordingStatus.ACTIVE);
				await expect(active).toHaveCount(1, { timeout: 20_000 });
				const recordingId = await eventPayloadField(active, 'recordingId');
				await expect(recordingStatusLocator(moderatorPage, MeetRecordingStatus.ACTIVE)).toContainText(
					recordingId
				);

				await stopRecording(moderatorPage);

				await expect(recordingStatusLocator(page, MeetRecordingStatus.COMPLETE)).toContainText(recordingId, {
					timeout: 20_000
				});

				await moderatorContext.close();
			});

			test('should report the current status, once and after meetingJoined, to a participant who joins while recording', async ({
				page,
				browser
			}) => {
				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await startRecording(moderatorPage);
				await expect(recordingStatusLocator(moderatorPage, MeetRecordingStatus.ACTIVE)).toHaveCount(1, {
					timeout: 20_000
				});

				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const status = await expectEvent(page, EmbeddedEventName.RECORDING_STATUS_CHANGED);
				await expect(status).toContainText(`"status":"${MeetRecordingStatus.ACTIVE}"`);
				const lifecycle = (await eventSequence(page)).filter(
					(name) =>
						name === EmbeddedEventName.MEETING_JOINED || name === EmbeddedEventName.RECORDING_STATUS_CHANGED
				);
				expect(lifecycle).toEqual([
					EmbeddedEventName.MEETING_JOINED,
					EmbeddedEventName.RECORDING_STATUS_CHANGED
				]);

				await stopRecording(moderatorPage);

				await expect(recordingStatusLocator(page, MeetRecordingStatus.COMPLETE)).toHaveCount(1, {
					timeout: 20_000
				});
				await expect(recordingStatusLocator(page, MeetRecordingStatus.ACTIVE)).toHaveCount(1);

				await moderatorContext.close();
			});
		});

		test.describe('PARTICIPANT_HAND_CHANGED Event', () => {
			test('should replay the raised hands in queue order, after meetingJoined, to a participant who joins later', async ({
				page,
				browser
			}) => {
				const contexts = [];
				const identities: string[] = [];

				for (const name of ['First', 'Second']) {
					const context = await browser.newContext();
					const speakerPage = await context.newPage();
					await openMeeting(speakerPage, roomId, { role: 'speaker', name });
					const identity = await joinedParticipantIdentity(speakerPage);
					await participantHandRaiseCommand(speakerPage);
					await expect(participantHandChangedLocator(speakerPage, identity, true)).toHaveCount(1, {
						timeout: 15_000
					});
					identities.push(identity);
					contexts.push(context);
				}

				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Late' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const hands = await expectEvent(page, EmbeddedEventName.PARTICIPANT_HAND_CHANGED, {
					count: 2,
					timeout: 15_000
				});
				await expect(hands.nth(0)).toContainText(identities[0]);
				await expect(hands.nth(1)).toContainText(identities[1]);
				const [first, second] = (await hands.allTextContents()).map(
					(payload) => JSON.parse(payload).participant.handRaiseDate
				);
				expect(first).toBeLessThan(second);

				const lifecycle = (await eventSequence(page)).filter(
					(name) =>
						name === EmbeddedEventName.MEETING_JOINED || name === EmbeddedEventName.PARTICIPANT_HAND_CHANGED
				);
				expect(lifecycle).toEqual([
					EmbeddedEventName.MEETING_JOINED,
					EmbeddedEventName.PARTICIPANT_HAND_CHANGED,
					EmbeddedEventName.PARTICIPANT_HAND_CHANGED
				]);

				for (const context of contexts) {
					await context.close();
				}
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
				await expect(left).toContainText(`"leaveReason":"${LeftEventReason.VOLUNTARY_LEAVE}"`);

				// Each event carries the participant its webhook carries, minus what only the server knows.
				const [joinedWebhook, leftWebhook] = await Promise.all([
					getWebhookFromStorage(page, roomId, MeetWebhookEventType.PARTICIPANT_JOINED, { matchIndex: 1 }),
					getWebhookFromStorage(page, roomId, MeetWebhookEventType.PARTICIPANT_LEFT)
				]);
				const eventParticipant = async (event: Locator) =>
					JSON.parse((await event.textContent()) ?? '').participant;
				expect(await eventParticipant(joined)).toEqual(
					(joinedWebhook.data as MeetParticipantJoinedPayload).participant
				);
				expect((leftWebhook.data as MeetParticipantLeftPayload).participant).toMatchObject(
					await eventParticipant(left)
				);

				await speakerContext.close();
			});
		});

		test.describe('Invalid correlation fields', () => {
			test('should show the invalid participant data screen for an external id with a space', async ({
				page
			}) => {
				const consoleErrors: string[] = [];
				page.on('console', (message) => {
					if (message.type() === 'error') consoleErrors.push(message.text());
				});
				const { meet } = await openMeetingAtMediaSetup(page, roomId, {
					integration,
					role: 'moderator',
					externalId: 'user 42'
				});

				await meet('#join-button').click();

				await expect(meet('.error-title')).toHaveText('Invalid participant data');
				await expect
					.poll(() => consoleErrors.some((text) => text.includes('participantExternalId')))
					.toBe(true);
			});
		});

		// The role describes the LOCAL participant, like their devices do: neither the moderator who
		// changed it nor anyone else in the meeting hears about it.
		test.describe('PARTICIPANT_ROLE_CHANGED Event', () => {
			test('should tell only the participant whose role changed', async ({ page, browser }) => {
				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Promoted' });
				const promotedIdentity = await joinedParticipantIdentity(page);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await participantUpdateRoleCommand(
					moderatorPage,
					promotedIdentity,
					MeetParticipantModerationAction.UPGRADE
				);

				const roleChanged = await expectEvent(page, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED);
				await expect(roleChanged).toContainText(`"roomId":"${roomId}"`);
				await expect(roleChanged).toContainText(`"participantIdentity":"${promotedIdentity}"`);
				await expect(roleChanged).toContainText(`"role":"${MeetRoomMemberRole.MODERATOR}"`);
				await expect(roleChanged).toContainText('"audioActive":');
				await expect(roleChanged).toContainText('"handRaised":false');

				await expect(eventLocator(moderatorPage, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED)).toHaveCount(0);

				await moderatorContext.close();
			});

			test('should tell a participant promoted while still joining', async ({ page }) => {
				const { meet, participantName } = await openMeetingAtMediaSetup(page, roomId, {
					integration,
					role: 'speaker'
				});
				await meet('#join-button').click();

				const identity = await waitForMeetingParticipant(roomId, participantName);
				await updateParticipantRole(roomId, identity, MeetParticipantModerationAction.UPGRADE);

				const roleChanged = await expectEvent(page, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED, {
					timeout: 15_000
				});
				await expect(roleChanged).toContainText(`"role":"${MeetRoomMemberRole.MODERATOR}"`);
			});

			test('should keep a promoted participant in the meeting while their new token cannot be fetched', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });
				const identity = await joinedParticipantIdentity(page);

				let unreachableRefreshes = 2;
				await page.route('**/members/token/refresh', (route) =>
					unreachableRefreshes-- > 0 ? route.abort('internetdisconnected') : route.continue()
				);
				await updateParticipantRole(roomId, identity, MeetParticipantModerationAction.UPGRADE);

				const roleChanged = await expectEvent(page, EmbeddedEventName.PARTICIPANT_ROLE_CHANGED, {
					timeout: 15_000
				});
				await expect(roleChanged).toContainText(`"role":"${MeetRoomMemberRole.MODERATOR}"`);
				expect(unreachableRefreshes).toBeLessThan(0);
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
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
				await expect(audioStatus.first()).toContainText('"active":false');
				await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleAudioCommand(page, true);

				await expect(audioStatus).toHaveCount(2, { timeout: 10_000 });
				await expect(audioStatus.nth(1)).toContainText('"active":true');
			});

			test('should emit mediaVideoStatusChanged once per camera transition', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
				await expect(videoStatus).toHaveCount(0);

				await mediaToggleVideoCommand(page, false);

				await expect(videoStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(videoStatus.first()).toContainText('"active":false');
				await expect(videoStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleVideoCommand(page, true);

				await expect(videoStatus).toHaveCount(2, { timeout: 10_000 });
				await expect(videoStatus.nth(1)).toContainText('"active":true');
			});

			test('should emit mediaScreenShareStatusChanged on start and stop', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				const screenShareStatus = eventLocator(page, EmbeddedEventName.MEDIA_SCREEN_SHARE_STATUS_CHANGED);
				await expect(screenShareStatus).toHaveCount(0);

				await mediaToggleScreenShareCommand(page, true);

				await expect(screenShareStatus).toHaveCount(1, { timeout: 15_000 });
				await expect(screenShareStatus.first()).toContainText('"active":true');
				await expect(screenShareStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);

				await mediaToggleScreenShareCommand(page, false);

				await expect(screenShareStatus).toHaveCount(2, { timeout: 15_000 });
				await expect(screenShareStatus.nth(1)).toContainText('"active":false');
			});

			// The state exists in the prejoin screen too, so a change made before joining is reported
			// like any other — there are no Room events to listen to in that window.
			test('should emit mediaAudioStatusChanged for a mute done before joining', async ({ page }) => {
				await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

				const audioStatus = eventLocator(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED);
				await expect(audioStatus).toHaveCount(0);

				await mediaToggleAudioCommand(page, false);

				await expect(audioStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(audioStatus.first()).toContainText('"active":false');
				await expect(audioStatus.first()).toContainText(MeetEventOrigin.PARTICIPANT);
			});

			test('should emit mediaVideoStatusChanged for a camera disabled before joining', async ({ page }) => {
				await openMeetingAtMediaSetup(page, roomId, { integration, role: 'moderator' });

				const videoStatus = eventLocator(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED);
				await expect(videoStatus).toHaveCount(0);

				await mediaToggleVideoCommand(page, false);

				await expect(videoStatus).toHaveCount(1, { timeout: 10_000 });
				await expect(videoStatus.first()).toContainText('"active":false');
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
				await expect(audioStatus.first()).toContainText('"active":false');
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

			// A moderator mute is the only change a participant is told about that they did not make,
			// and the only source of an origin other than `participant`. It stays a LOCAL event: it
			// describes the muted participant's own devices, so neither the moderator who acted nor a
			// third participant hears about it.
			test('should attribute a moderator mute to the moderator and tell only the muted participant', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker', name: 'Muted' });
				const mutedIdentity = await joinedParticipantIdentity(page);

				const bystanderContext = await browser.newContext();
				const bystanderPage = await bystanderContext.newPage();
				await openMeeting(bystanderPage, roomId, { role: 'speaker', name: 'Bystander' });
				await expectEvent(bystanderPage, EmbeddedEventName.JOINED);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await participantMuteCommand(moderatorPage, mutedIdentity, 'audio');
				await participantMuteCommand(moderatorPage, mutedIdentity, 'video');

				const audioStatus = await expectEvent(page, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED, {
					timeout: 15_000
				});
				await expect(audioStatus).toContainText('"active":false');
				await expect(audioStatus).toContainText(MeetEventOrigin.MODERATOR);

				const videoStatus = await expectEvent(page, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED, {
					timeout: 15_000
				});
				await expect(videoStatus).toContainText('"active":false');
				await expect(videoStatus).toContainText(MeetEventOrigin.MODERATOR);

				for (const otherPage of [moderatorPage, bystanderPage]) {
					await expect(eventLocator(otherPage, EmbeddedEventName.MEDIA_AUDIO_STATUS_CHANGED)).toHaveCount(0);
					await expect(eventLocator(otherPage, EmbeddedEventName.MEDIA_VIDEO_STATUS_CHANGED)).toHaveCount(0);
				}

				await moderatorContext.close();
				await bystanderContext.close();
			});
		});

		// Every other describe block above only asserts the deprecated names (what a
		// 3.8.0 host still listens for). This block is the canonical-name counterpart:
		// it proves the dual dispatch actually reaches a host listening for the new
		// names too, for both transports — nothing end-to-end asserted that before.
		// The room streams to an RTMP ingress of the LiveKit deployment under test, the one sink the
		// egress can reach here; the stream key never comes back from the API.
		test.describe('BROADCAST_* Events', () => {
			let broadcastRoomId: string;
			let sinkUrl: string;

			test.beforeEach(async () => {
				sinkUrl = await createRtmpSink(`events-${integration}`);
				({ roomId: broadcastRoomId } = await createRoom({
					config: { broadcast: { enabled: true, destinations: [{ name: 'Sink', url: sinkUrl }] } }
				}));
				createdRoomIds.push(broadcastRoomId);
			});

			test('should emit broadcastStarted, broadcastUpdated as it streams and broadcastEnded, with the stream key hidden', async ({
				page
			}) => {
				await openMeeting(page, broadcastRoomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await broadcastStartCommand(page);

				const started = await expectEvent(page, EmbeddedEventName.BROADCAST_STARTED);
				await expect(started).toContainText(`"roomId":"${broadcastRoomId}"`);
				await expect(started).toContainText(`"status":"${MeetBroadcastStatus.STARTING}"`);
				await expect(started).toContainText('/********"');
				await expect(started).not.toContainText(sinkUrl.split('/').pop()!);

				const streaming = eventLocator(page, EmbeddedEventName.BROADCAST_UPDATED).filter({
					hasText: `"status":"${MeetBroadcastStatus.ACTIVE}"`
				});
				await expect(streaming.first()).toBeAttached({ timeout: 40_000 });

				await broadcastStopCommand(page);

				const ended = await expectEvent(page, EmbeddedEventName.BROADCAST_ENDED, { timeout: 30_000 });
				await expect(ended).toContainText(`"status":"${MeetBroadcastStatus.COMPLETE}"`);
			});
		});

		test.describe('Waiting room', () => {
			const contexts: BrowserContext[] = [];
			let lobbyRoomId: string;

			const createLobbyRoom = async (config: MeetRoomConfigOptions = {}): Promise<void> => {
				({ roomId: lobbyRoomId } = await createRoom({ config: { lobby: { enabled: true }, ...config } }));
				createdRoomIds.push(lobbyRoomId);
			};

			/** A page of its own browser context, closed after the test. */
			const otherPage = async (browser: Browser): Promise<Page> => {
				const context = await browser.newContext();
				contexts.push(context);
				return context.newPage();
			};

			const waiter = async (browser: Browser, name: string): Promise<Page> => {
				const waiterPage = await otherPage(browser);
				await askToJoin(waiterPage, lobbyRoomId, { name });
				return waiterPage;
			};

			const waiting = async (): Promise<MeetLobbyParticipant[]> => (await getLobby(lobbyRoomId)).participants;
			const waitingNames = async (): Promise<string[]> =>
				(await waiting()).map(({ participantName }) => participantName);
			const waitingIdentityOf = async (name: string): Promise<string> =>
				(await waiting()).find(({ participantName }) => participantName === name)!.participantIdentity;

			const lobbyStatuses = (target: Page) =>
				eventPayloads<LobbyStatusChangedPayload>(target, EmbeddedEventName.LOBBY_STATUS_CHANGED);
			const lastLobbyUpdate = async (target: Page) =>
				(await eventPayloads<LobbyUpdatedPayload>(target, EmbeddedEventName.LOBBY_UPDATED)).at(-1);
			const knocks = (target: Page) =>
				eventPayloads<ParticipantKnockedPayload>(target, EmbeddedEventName.PARTICIPANT_KNOCKED);

			test.afterEach(async () => {
				await Promise.all(contexts.splice(0).map((context) => context.close().catch(() => {})));
			});

			test('should report the place in line and the admission, then meetingJoined with the same identity', async ({
				page,
				browser
			}) => {
				await createLobbyRoom();
				await waiter(browser, 'Ana');
				await askToJoin(page, lobbyRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				const inLine = (queuePosition: number) => ({
					roomId: lobbyRoomId,
					participantIdentity: ben,
					status: MeetLobbyStatus.WAITING,
					queuePosition
				});

				await expect.poll(() => lobbyStatuses(page)).toEqual([inLine(2)]);

				await decideOnLobby(lobbyRoomId, 'admit', [await waitingIdentityOf('Ana')]);
				await expect
					.poll(() => lobbyStatuses(page), { timeout: NEXT_STATE_TIMEOUT })
					.toEqual([inLine(2), inLine(1)]);

				await decideOnLobby(lobbyRoomId, 'admit', [ben]);
				const joined = await expectEvent(page, EmbeddedEventName.MEETING_JOINED, { timeout: 20_000 });
				expect(await eventPayloadField(joined, 'participantIdentity')).toBe(ben);
				expect(await lobbyStatuses(page)).toEqual([
					inLine(2),
					inLine(1),
					{ roomId: lobbyRoomId, participantIdentity: ben, status: MeetLobbyStatus.ADMITTED }
				]);
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
			});

			test('should report a rejection without meetingLeft', async ({ page }) => {
				await createLobbyRoom();
				const { meet } = await askToJoin(page, lobbyRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(() => lobbyStatuses(page)).toHaveLength(1);

				await decideOnLobby(lobbyRoomId, 'reject', [ben]);

				await expect(meet('#waiting-outcome-rejected')).toBeVisible({ timeout: 10_000 });
				await expect
					.poll(async () => (await lobbyStatuses(page)).at(-1))
					.toEqual({ roomId: lobbyRoomId, participantIdentity: ben, status: MeetLobbyStatus.REJECTED });
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
			});

			test('should report expired when the meeting says the participant lost their place', async ({ page }) => {
				await createLobbyRoom();
				// The waiting screen's connection opens but never reaches Meet, which forgets the wait.
				const held: WebSocketRoute[] = [];
				let holding = true;
				await page.routeWebSocket(REALTIME_CHANNEL, (ws) => {
					if (holding) {
						held.push(ws);
					} else {
						ws.connectToServer();
					}
				});
				const { meet } = await askToJoin(page, lobbyRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(waitingNames, { timeout: UNCONNECTED_KNOCK_TIMEOUT }).toEqual([]);

				holding = false;
				await Promise.all(held.map((ws) => ws.close()));

				await expect(meet('#waiting-outcome-expired')).toBeVisible({ timeout: 15_000 });
				await expect
					.poll(() => lobbyStatuses(page))
					.toEqual([{ roomId: lobbyRoomId, participantIdentity: ben, status: MeetLobbyStatus.EXPIRED }]);
				const expired = await getWebhookFromStorage(
					page,
					lobbyRoomId,
					MeetWebhookEventType.LOBBY_STATUS_CHANGED
				);
				expect(expired.data).toMatchObject({
					roomId: lobbyRoomId,
					status: MeetLobbyStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					participant: { participantIdentity: ben }
				});
			});

			test(`should end the wait as expired, never left, about a minute after the host removes the ${integration === 'iframe' ? 'iframe' : 'element'}`, async ({
				page
			}) => {
				test.setTimeout(PLACE_LOST_TIMEOUT + 60_000);
				await createLobbyRoom();
				await askToJoin(page, lobbyRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(() => lobbyStatuses(page)).toHaveLength(1);

				await removeEmbeddedMeeting(page, integration);

				await expect.poll(waitingNames, { timeout: PLACE_LOST_TIMEOUT, intervals: [2_000] }).toEqual([]);
				const ended = await getWebhookFromStorage(page, lobbyRoomId, MeetWebhookEventType.LOBBY_STATUS_CHANGED);
				expect(ended.data).toMatchObject({
					roomId: lobbyRoomId,
					status: MeetLobbyStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					participant: { participantIdentity: ben }
				});
				expect(
					await webhooksFromStorage(page, lobbyRoomId, MeetWebhookEventType.LOBBY_STATUS_CHANGED)
				).toHaveLength(1);
			});

			test('should list on joining those already waiting, then report each new one with participantKnocked', async ({
				page,
				browser
			}) => {
				await createLobbyRoom({ maxParticipants: 5 });
				await waiter(browser, 'Zoe');
				await waiter(browser, 'Ana');
				const [zoe, ana] = await waiting();

				await openMeeting(page, lobbyRoomId, { integration, role: 'moderator' });
				await expect
					.poll(() => lastLobbyUpdate(page))
					.toEqual({ roomId: lobbyRoomId, participants: [zoe, ana], availablePlaces: 4 });

				await waiter(browser, 'Ben');
				const ben = (await waiting())[2];
				await expect.poll(() => knocks(page)).toEqual([{ roomId: lobbyRoomId, participant: ben }]);
				await expect
					.poll(() => lastLobbyUpdate(page))
					.toEqual({ roomId: lobbyRoomId, participants: [zoe, ana, ben], availablePlaces: 4 });

				await decideOnLobby(lobbyRoomId, 'reject', [zoe.participantIdentity]);
				await expect
					.poll(() => lastLobbyUpdate(page))
					.toEqual({ roomId: lobbyRoomId, participants: [ana, ben], availablePlaces: 4 });

				await decideOnLobby(lobbyRoomId, 'admit', [ana.participantIdentity]);
				await expect
					.poll(() => lastLobbyUpdate(page))
					.toEqual({ roomId: lobbyRoomId, participants: [ben], availablePlaces: 3 });
				expect(await knocks(page)).toHaveLength(1);
			});

			test('should report a participant back in line after a failed admission through lobbyUpdated, not participantKnocked', async ({
				page,
				browser
			}) => {
				await createLobbyRoom({ maxParticipants: 2 });
				await openMeeting(page, lobbyRoomId, { integration, role: 'moderator' });

				// Zoe's request for her join token waits until the last place is taken.
				const zoePage = await otherPage(browser);
				let releaseTokenRequest!: () => void;
				const released = new Promise<void>((resolve) => (releaseTokenRequest = resolve));
				let tokenRequestHeld!: () => void;
				const held = new Promise<void>((resolve) => (tokenRequestHeld = resolve));
				await zoePage.route('**/members/token', async (route) => {
					if (route.request().postDataJSON()?.lobbyTicket) {
						tokenRequestHeld();
						await released;
					}

					await route.continue();
				});
				await askToJoin(zoePage, lobbyRoomId, { name: 'Zoe' });
				const [zoe] = await waiting();
				await expect.poll(() => knocks(page)).toEqual([{ roomId: lobbyRoomId, participant: zoe }]);
				await expect.poll(() => lobbyStatuses(zoePage)).toHaveLength(1);

				await decideOnLobby(lobbyRoomId, 'admit', [zoe.participantIdentity]);
				await held;
				await openMeeting(await otherPage(browser), lobbyRoomId, { role: 'moderator' });
				releaseTokenRequest();

				await expect
					.poll(() => lastLobbyUpdate(page), { timeout: NEXT_STATE_TIMEOUT })
					.toEqual({ roomId: lobbyRoomId, participants: [zoe], availablePlaces: 0 });
				expect(await knocks(page)).toHaveLength(1);
				await expect
					.poll(async () => (await lobbyStatuses(zoePage)).map(({ status }) => status), {
						timeout: NEXT_STATE_TIMEOUT
					})
					.toEqual([MeetLobbyStatus.WAITING, MeetLobbyStatus.ADMITTED, MeetLobbyStatus.WAITING]);
			});
		});

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

			test('should dispatch both closed and embeddedCloseRequested after leaving', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await leaveRoomCommand(page);
				await expectEvent(page, EmbeddedEventName.LEFT);

				await meetLocator(page, integration, '#back-btn').click();
				await expect(eventLocator(page, EmbeddedEventName.CLOSED).first()).toBeVisible({ timeout: 5_000 });
				await expect(eventLocator(page, EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED).first()).toBeVisible({
					timeout: 5_000
				});
			});
		});
	});
}
