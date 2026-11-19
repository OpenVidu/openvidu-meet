import {
	EmbeddedAttribute,
	EmbeddedEventName,
	EmbeddedEventPayloadFor,
	LeftEventReason,
	MeetBroadcastInfo,
	MeetBroadcastStatus,
	MeetEventOrigin,
	MeetWaitingParticipant,
	MeetWaitingParticipantStatus,
	MeetParticipantJoinedPayload,
	MeetParticipantLeftPayload,
	MeetParticipantModerationAction,
	MeetParticipantType,
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
	decideOnWaitingParticipants,
	deleteRooms,
	getWaitingParticipants,
	getRecordingUrl,
	getRoom,
	listMeetingParticipants,
	listRecordingsByRoomId,
	updateParticipantRole,
	waitForMeetingParticipant
} from '../helpers/meet-api.helper';
import { expectToolbarMicEnabled } from '../helpers/media-controls.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { openWebcomponentWithAttributes } from '../helpers/webcomponent-attributes.helper';
import {
	askToJoin,
	broadcastStartCommand,
	broadcastStopAllCommand,
	endMeetingCommand,
	eventLocator,
	eventPayloadField,
	eventPayloads,
	eventSequence,
	expectEvent,
	participantHandChangedLocator,
	participantRaiseHandCommand,
	joinedParticipantIdentity,
	leaveMeeting,
	leaveRoomCommand,
	mediaToggleAudioCommand,
	mediaToggleVideoCommand,
	openMeeting,
	openMeetingAtMediaSetup,
	participantMuteCommand,
	participantUpdateRoleCommand,
	recordHostEvents,
	recordingEventLocator,
	recordingStartCommand,
	removeEmbeddedMeeting
} from '../helpers/testapp.helper';
import { getWebhookFromStorage, webhooksFromStorage } from '../helpers/ui-utils.helper';

const LEAVE_REDIRECT_URL = `${MEET_TESTAPP_URL.replace(/\/$/, '')}/?left`;

/** The realtime connection of a waiting screen to Meet. */
const REALTIME_CHANNEL = /\/internal-api\/v1\/ws\?/;
/** The test backend forgets a knock whose waiting screen never connects 5 s after it; its sweep runs every second (`.env.test`). */
const UNCONNECTED_KNOCK_TIMEOUT = 20_000;
/** The test backend forgets a waiter whose connection has been gone for 20 s. */
const PLACE_LOST_TIMEOUT = 35_000;
/** A waiter's state is sent again at every answered ping, every 4 s on the test backend, and the waiting list read every 30 s. */
const NEXT_STATE_TIMEOUT = 40_000;

type WaitingParticipantStatusChangedPayload =
	EmbeddedEventPayloadFor<EmbeddedEventName.WAITING_PARTICIPANT_STATUS_CHANGED>;
type WaitingParticipantListUpdatedPayload = EmbeddedEventPayloadFor<EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED>;
type WaitingParticipantKnockedPayload = EmbeddedEventPayloadFor<EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED>;

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
			test('should receive one joined event, and meetingJoined, with the roomId and participantIdentity when joining as moderator', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);

				await test.step('should include the roomId and the participantIdentity in the joined event payload', async () => {
					await expect(joined).toContainText('"roomId"');
					await expect(joined).toContainText(roomId);
					await expect(joined).toHaveText(/"participantIdentity".*:/);
				});

				await test.step('should receive only one joined event per join action', async () => {
					await expect(eventLocator(page, EmbeddedEventName.JOINED)).toHaveCount(1);
				});

				await test.step('should dispatch both joined and meetingJoined for the same transition', async () => {
					const meetingJoined = await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
					await expect(meetingJoined).toContainText(roomId);
				});
			});

			test('should receive joined event when joining as speaker', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });

				const joined = await expectEvent(page, EmbeddedEventName.JOINED);
				await expect(joined).toContainText('roomId');
				await expect(joined).toContainText('participantIdentity');
				await expect(joined).toContainText(roomId);
			});
		});

		test.describe('LEFT Event', () => {
			test('should receive left and meetingLeft events with the voluntary_leave reason when leaving right after joining with the leave command', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				const joined = eventLocator(page, EmbeddedEventName.JOINED);
				const left = eventLocator(page, EmbeddedEventName.LEFT);
				await expect(left).toHaveCount(0);

				await leaveRoomCommand(page);

				await test.step('should receive events in correct order: joined -> left', async () => {
					await expect(left).toHaveCount(1, { timeout: 10_000 });
					await expect(joined).toHaveCount(1);

					const lifecycle = (await eventSequence(page)).filter(
						(name) => name === EmbeddedEventName.JOINED || name === EmbeddedEventName.LEFT
					);
					expect(lifecycle).toEqual([EmbeddedEventName.JOINED, EmbeddedEventName.LEFT]);
				});

				await test.step('should receive left event with voluntary_leave reason when using leave command', async () => {
					await expect(left).toContainText('roomId');
					await expect(left).toContainText('participantIdentity');
					await expect(left).toContainText('reason');
					await expect(left).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
				});

				await test.step('should include all required fields in left event payload', async () => {
					await expect(left).toContainText('"roomId"');
					await expect(left).toContainText('"participantIdentity"');
					await expect(left).toContainText('"reason"');
					await expect(left).toContainText(roomId);
				});

				await test.step('should dispatch both left and meetingLeft with the same reason', async () => {
					const meetingLeft = await expectEvent(page, EmbeddedEventName.MEETING_LEFT);
					await expect(meetingLeft).toContainText(LeftEventReason.VOLUNTARY_LEAVE);
				});
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

			test(`should end the meeting of the participant and receive no event when the host removes the ${integration === 'iframe' ? 'iframe' : 'element'}`, async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				const identity = await joinedParticipantIdentity(page);
				const hostEvents = await recordHostEvents(page);

				await removeEmbeddedMeeting(page, integration);

				await expect
					.poll(async () => (await listMeetingParticipants(roomId)).map((p) => p.participantIdentity))
					.not.toContain(identity);
				expect(await hostEvents()).toEqual([]);
				await expect(eventLocator(page, EmbeddedEventName.LEFT)).toHaveCount(0);
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
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
				const hostEvents = await recordHostEvents(page);
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
				expect(await hostEvents()).toContain(EmbeddedEventName.EMBEDDED_CLOSE_REQUESTED);
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

		test.describe('RECORDING_STARTED, RECORDING_UPDATED and RECORDING_ENDED Events', () => {
			// The recording reaches everyone in the meeting, not only whoever started it.
			test('should report the start, the update and the end of a recording to a participant who did not start it, and let no participant without recordingControl start one', async ({
				page,
				browser
			}) => {
				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				await recordingStartCommand(page);

				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await expectEvent(moderatorPage, EmbeddedEventName.JOINED);

				await test.step('should not start a recording for a speaker who lacks the recordingControl permission', async () => {
					await expect(eventLocator(page, EmbeddedEventName.RECORDING_STARTED)).toHaveCount(0);
				});

				await startRecording(moderatorPage);

				const started = await expectEvent(page, EmbeddedEventName.RECORDING_STARTED, { timeout: 20_000 });
				const recordingId = await eventPayloadField(started, 'recordingId');
				const updated = recordingEventLocator(
					page,
					EmbeddedEventName.RECORDING_UPDATED,
					MeetRecordingStatus.ACTIVE
				);
				await expect(updated).toHaveCount(1, { timeout: 20_000 });
				await expect(updated).toContainText(recordingId);

				await stopRecording(moderatorPage);

				await expect(
					recordingEventLocator(page, EmbeddedEventName.RECORDING_ENDED, MeetRecordingStatus.COMPLETE)
				).toContainText(recordingId, { timeout: 20_000 });
				await expect(
					recordingEventLocator(
						moderatorPage,
						EmbeddedEventName.RECORDING_ENDED,
						MeetRecordingStatus.COMPLETE
					)
				).toHaveCount(1, { timeout: 20_000 });
				await expectEvent(page, EmbeddedEventName.RECORDING_STARTED);

				await moderatorContext.close();
			});

			test('should report the recording once, as started and after meetingJoined, to a participant who joins while recording', async ({
				page,
				browser
			}) => {
				const moderatorContext = await browser.newContext();
				const moderatorPage = await moderatorContext.newPage();
				await openMeeting(moderatorPage, roomId, { role: 'moderator' });
				await startRecording(moderatorPage);
				await expect(
					recordingEventLocator(
						moderatorPage,
						EmbeddedEventName.RECORDING_UPDATED,
						MeetRecordingStatus.ACTIVE
					)
				).toHaveCount(1, { timeout: 20_000 });

				await openMeeting(page, roomId, { integration, role: 'speaker' });
				await expectEvent(page, EmbeddedEventName.JOINED);

				const started = await expectEvent(page, EmbeddedEventName.RECORDING_STARTED);
				await expect(started).toContainText(`"status":"${MeetRecordingStatus.ACTIVE}"`);
				const lifecycle = (await eventSequence(page)).filter(
					(name) => name === EmbeddedEventName.MEETING_JOINED || name === EmbeddedEventName.RECORDING_STARTED
				);
				expect(lifecycle).toEqual([EmbeddedEventName.MEETING_JOINED, EmbeddedEventName.RECORDING_STARTED]);

				await stopRecording(moderatorPage);

				await expect(
					recordingEventLocator(page, EmbeddedEventName.RECORDING_ENDED, MeetRecordingStatus.COMPLETE)
				).toHaveCount(1, { timeout: 20_000 });
				await expectEvent(page, EmbeddedEventName.RECORDING_STARTED);

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
					await participantRaiseHandCommand(speakerPage);
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

		test.describe('Event Error Handling', () => {
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
				const joinedParticipant = await eventParticipant(joined);
				expect(joinedParticipant.type).toBe(MeetParticipantType.ANONYMOUS);
				expect(joinedParticipant).toEqual((joinedWebhook.data as MeetParticipantJoinedPayload).participant);
				expect((leftWebhook.data as MeetParticipantLeftPayload).participant).toMatchObject(
					await eventParticipant(left)
				);

				await test.step('should receive participantJoined and participantLeft webhooks for a participant that joins and leaves', async () => {
					expect(
						await webhooksFromStorage(page, roomId, MeetWebhookEventType.PARTICIPANT_JOINED)
					).toHaveLength(2);
					expect(await webhooksFromStorage(page, roomId, MeetWebhookEventType.PARTICIPANT_LEFT)).toHaveLength(
						1
					);
				});

				await test.step('should carry the correlation fields through the participantJoined webhook', async () => {
					const joinedPayload = joinedWebhook.data as MeetParticipantJoinedPayload;
					expect(joinedPayload.roomId).toBe(roomId);
					expect(joinedPayload.participant.participantName).toBe(speakerName);
					expect(joinedPayload.participant.role).toBe(MeetRoomMemberRole.SPEAKER);
					expect(joinedPayload.participant.joinDate).toBeLessThanOrEqual(Date.now());
					expect(joinedPayload.participant.externalId).toBe('crm-user_42');
					expect(joinedPayload.participant.metadata).toBe('{"plan":"premium"}');
				});

				await test.step('should carry the correlation fields through the participantLeft webhook', async () => {
					const leftPayload = leftWebhook.data as MeetParticipantLeftPayload;
					expect(leftPayload.roomId).toBe(roomId);
					expect(leftPayload.participant.participantName).toBe(speakerName);
					expect(leftPayload.participant.leaveReason).toBe(LeftEventReason.VOLUNTARY_LEAVE);
					expect(leftPayload.participant.durationSeconds).toBeGreaterThanOrEqual(0);
					expect(leftPayload.participant.externalId).toBe('crm-user_42');
					expect(leftPayload.participant.metadata).toBe('{"plan":"premium"}');
				});

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
			test('should not emit a media event when the requested state is already active', async ({ page }) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 10_000 });

				await mediaToggleAudioCommand(page, true);
				await expectToolbarMicEnabled(page, integration, true, { timeout: 5_000 });
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

			test('should emit broadcastStarted, broadcastUpdated as it streams and broadcastEnded, with the stream key hidden, show the broadcast tag and send their webhooks', async ({
				page
			}) => {
				let startedBroadcast!: MeetBroadcastInfo;
				await openMeeting(page, broadcastRoomId, { integration, role: 'moderator' });
				await expectEvent(page, EmbeddedEventName.MEETING_JOINED);

				await broadcastStartCommand(page);

				const started = await expectEvent(page, EmbeddedEventName.BROADCAST_STARTED);
				await expect(started).toContainText(`"roomId":"${broadcastRoomId}"`);
				await expect(started).toContainText(`"status":"${MeetBroadcastStatus.STARTING}"`);
				await expect(started).toContainText('/********"');
				await expect(started).not.toContainText(sinkUrl.split('/').pop()!);
				await expect(meetLocator(page, integration, '#broadcast-tag')).toBeVisible({ timeout: 40_000 });

				const streaming = eventLocator(page, EmbeddedEventName.BROADCAST_UPDATED).filter({
					hasText: `"status":"${MeetBroadcastStatus.ACTIVE}"`
				});
				await expect(streaming.first()).toBeAttached({ timeout: 40_000 });

				await test.step('should receive broadcastStarted and broadcastUpdated webhooks', async () => {
					const startedWebhook = await getWebhookFromStorage(
						page,
						broadcastRoomId,
						MeetWebhookEventType.BROADCAST_STARTED
					);
					startedBroadcast = startedWebhook.data as MeetBroadcastInfo;
					expect(startedBroadcast.roomId).toBe(broadcastRoomId);
					expect(startedBroadcast.status).toBe(MeetBroadcastStatus.STARTING);
					expect(startedBroadcast.destination.url).toContain('/********');
					expect(startedBroadcast.destination.url).not.toContain(sinkUrl.split('/').pop()!);

					const updatedWebhook = await getWebhookFromStorage(
						page,
						broadcastRoomId,
						MeetWebhookEventType.BROADCAST_UPDATED,
						{ timeout: 40_000 }
					);
					expect((updatedWebhook.data as MeetBroadcastInfo).broadcastId).toBe(startedBroadcast.broadcastId);
				});

				await broadcastStopAllCommand(page);

				const ended = await expectEvent(page, EmbeddedEventName.BROADCAST_ENDED, { timeout: 30_000 });
				await expect(ended).toContainText(`"status":"${MeetBroadcastStatus.COMPLETE}"`);
				await expect(meetLocator(page, integration, '#broadcast-tag')).toBeHidden();

				await test.step('should receive broadcastEnded webhook', async () => {
					const endedWebhook = await getWebhookFromStorage(
						page,
						broadcastRoomId,
						MeetWebhookEventType.BROADCAST_ENDED,
						{ timeout: 30_000 }
					);
					const endedBroadcast = endedWebhook.data as MeetBroadcastInfo;
					expect(endedBroadcast.broadcastId).toBe(startedBroadcast.broadcastId);
					expect(endedBroadcast.status).toBe(MeetBroadcastStatus.COMPLETE);
				});
			});
		});

		test.describe('Locked room', () => {
			const contexts: BrowserContext[] = [];
			let lockedRoomId: string;

			const createLockedRoom = async (config: MeetRoomConfigOptions = {}): Promise<void> => {
				({ roomId: lockedRoomId } = await createRoom({
					config,
					access: { lock: { enabled: true } }
				}));
				createdRoomIds.push(lockedRoomId);
			};

			/** A page of its own browser context, closed after the test. */
			const otherPage = async (browser: Browser): Promise<Page> => {
				const context = await browser.newContext();
				contexts.push(context);
				return context.newPage();
			};

			const waiter = async (browser: Browser, name: string): Promise<Page> => {
				const waiterPage = await otherPage(browser);
				await askToJoin(waiterPage, lockedRoomId, { name });
				return waiterPage;
			};

			/** Who waits, by the time they asked, as the meeting lists them: the API promises no order. */
			const waiting = async (): Promise<MeetWaitingParticipant[]> =>
				(await getWaitingParticipants(lockedRoomId)).participants.sort((a, b) => a.knockDate - b.knockDate);
			const waitingNames = async (): Promise<string[]> =>
				(await waiting()).map(({ participantName }) => participantName);
			const waitingIdentityOf = async (name: string): Promise<string> =>
				(await waiting()).find(({ participantName }) => participantName === name)!.participantIdentity;

			const waitingStates = (target: Page) =>
				eventPayloads<WaitingParticipantStatusChangedPayload>(
					target,
					EmbeddedEventName.WAITING_PARTICIPANT_STATUS_CHANGED
				);
			const lastWaitingUpdate = async (target: Page) =>
				(
					await eventPayloads<WaitingParticipantListUpdatedPayload>(
						target,
						EmbeddedEventName.WAITING_PARTICIPANT_LIST_UPDATED
					)
				).at(-1);
			const knocks = (target: Page) =>
				eventPayloads<WaitingParticipantKnockedPayload>(target, EmbeddedEventName.WAITING_PARTICIPANT_KNOCKED);

			test.afterEach(async () => {
				await Promise.all(contexts.splice(0).map((context) => context.close().catch(() => {})));
			});

			test('should report waiting once, nothing when another is admitted, then the admission and meetingJoined with the same identity', async ({
				page,
				browser
			}) => {
				await createLockedRoom();
				await waiter(browser, 'Ana');
				await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				const stillWaiting = {
					roomId: lockedRoomId,
					participant: { participantIdentity: ben },
					status: MeetWaitingParticipantStatus.WAITING
				};

				await expect.poll(() => waitingStates(page)).toMatchObject([stillWaiting]);

				await decideOnWaitingParticipants(lockedRoomId, 'admit', await waitingIdentityOf('Ana'));
				await expect.poll(waitingNames).toEqual(['Ben']);

				await decideOnWaitingParticipants(lockedRoomId, 'admit', ben);
				const joined = await expectEvent(page, EmbeddedEventName.MEETING_JOINED, { timeout: 20_000 });
				expect(await eventPayloadField(joined, 'participantIdentity')).toBe(ben);
				expect(await waitingStates(page)).toMatchObject([
					stillWaiting,
					{
						roomId: lockedRoomId,
						participant: { participantIdentity: ben },
						status: MeetWaitingParticipantStatus.ADMITTED,
						origin: MeetEventOrigin.MODERATOR
					}
				]);
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
			});

			test('should report a rejection without meetingLeft', async ({ page }) => {
				await createLockedRoom();
				const { meet } = await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(() => waitingStates(page)).toHaveLength(1);

				await decideOnWaitingParticipants(lockedRoomId, 'reject', ben);

				await expect(meet('#waiting-outcome-rejected')).toBeVisible({ timeout: 10_000 });
				await expect
					.poll(async () => (await waitingStates(page)).at(-1))
					.toMatchObject({
						roomId: lockedRoomId,
						participant: { participantIdentity: ben },
						status: MeetWaitingParticipantStatus.REJECTED,
						origin: MeetEventOrigin.MODERATOR
					});
				await expect(eventLocator(page, EmbeddedEventName.MEETING_LEFT)).toHaveCount(0);
			});

			test('should report expired when the meeting says the participant lost their place', async ({ page }) => {
				await createLockedRoom();
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
				const { meet } = await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(waitingNames, { timeout: UNCONNECTED_KNOCK_TIMEOUT }).toEqual([]);

				holding = false;
				await Promise.all(held.map((ws) => ws.close()));

				await expect(meet('#waiting-outcome-expired')).toBeVisible({ timeout: 15_000 });
				await expect
					.poll(() => waitingStates(page))
					.toMatchObject([
						{
							roomId: lockedRoomId,
							participant: { participantIdentity: ben },
							status: MeetWaitingParticipantStatus.EXPIRED
						}
					]);
				const expired = await getWebhookFromStorage(
					page,
					lockedRoomId,
					MeetWebhookEventType.WAITING_PARTICIPANT_STATUS_CHANGED
				);
				expect(expired.data).toMatchObject({
					roomId: lockedRoomId,
					status: MeetWaitingParticipantStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					participant: { participantIdentity: ben }
				});
			});

			test(`should end the wait as expired, never left, once the host removes the ${integration === 'iframe' ? 'iframe' : 'element'}`, async ({
				page
			}) => {
				await createLockedRoom();
				await askToJoin(page, lockedRoomId, { integration, name: 'Ben' });
				const ben = await waitingIdentityOf('Ben');
				await expect.poll(() => waitingStates(page)).toHaveLength(1);

				await removeEmbeddedMeeting(page, integration);

				await expect.poll(waitingNames, { timeout: PLACE_LOST_TIMEOUT, intervals: [1_000] }).toEqual([]);
				const ended = await getWebhookFromStorage(
					page,
					lockedRoomId,
					MeetWebhookEventType.WAITING_PARTICIPANT_STATUS_CHANGED
				);
				expect(ended.data).toMatchObject({
					roomId: lockedRoomId,
					status: MeetWaitingParticipantStatus.EXPIRED,
					origin: MeetEventOrigin.SYSTEM,
					participant: { participantIdentity: ben }
				});
				expect(
					await webhooksFromStorage(
						page,
						lockedRoomId,
						MeetWebhookEventType.WAITING_PARTICIPANT_STATUS_CHANGED
					)
				).toHaveLength(1);
			});

			test('should list on joining those already waiting, then report each new one with waitingParticipantKnocked and each decision with waitingParticipantStatusChanged', async ({
				page,
				browser
			}) => {
				await createLockedRoom({ maxParticipants: 5 });
				await waiter(browser, 'Zoe');
				await waiter(browser, 'Ana');
				const [zoe, ana] = await waiting();

				await openMeeting(page, lockedRoomId, { integration, role: 'moderator' });
				await expect
					.poll(() => lastWaitingUpdate(page))
					.toEqual({ roomId: lockedRoomId, participants: [zoe, ana] });

				await waiter(browser, 'Ben');
				const ben = (await waiting())[2];
				await expect.poll(() => knocks(page)).toEqual([{ roomId: lockedRoomId, participant: ben }]);
				await expect
					.poll(() => lastWaitingUpdate(page))
					.toEqual({ roomId: lockedRoomId, participants: [zoe, ana, ben] });

				await decideOnWaitingParticipants(lockedRoomId, 'reject', zoe.participantIdentity);
				await expect
					.poll(() => lastWaitingUpdate(page))
					.toEqual({ roomId: lockedRoomId, participants: [ana, ben] });

				await decideOnWaitingParticipants(lockedRoomId, 'admit', ana.participantIdentity);
				await expect.poll(() => lastWaitingUpdate(page)).toEqual({ roomId: lockedRoomId, participants: [ben] });
				expect(await knocks(page)).toHaveLength(1);
				await expect
					.poll(() => waitingStates(page))
					.toEqual([
						{
							roomId: lockedRoomId,
							participant: zoe,
							status: MeetWaitingParticipantStatus.REJECTED,
							origin: MeetEventOrigin.MODERATOR
						},
						{
							roomId: lockedRoomId,
							participant: ana,
							status: MeetWaitingParticipantStatus.ADMITTED,
							origin: MeetEventOrigin.MODERATOR
						}
					]);
			});

			test('should report a participant waiting again after a failed admission through waitingParticipantListUpdated, not waitingParticipantKnocked', async ({
				page,
				browser
			}) => {
				await createLockedRoom({ maxParticipants: 2 });
				await openMeeting(page, lockedRoomId, { integration, role: 'moderator' });

				// Zoe's request for her join token waits until the last place is taken.
				const zoePage = await otherPage(browser);
				let releaseTokenRequest!: () => void;
				const released = new Promise<void>((resolve) => (releaseTokenRequest = resolve));
				let tokenRequestHeld!: () => void;
				const held = new Promise<void>((resolve) => (tokenRequestHeld = resolve));
				await zoePage.route('**/members/token', async (route) => {
					if (route.request().postDataJSON()?.waitingTicket) {
						tokenRequestHeld();
						await released;
					}

					await route.continue();
				});
				await askToJoin(zoePage, lockedRoomId, { name: 'Zoe' });
				const [zoe] = await waiting();
				await expect.poll(() => knocks(page)).toEqual([{ roomId: lockedRoomId, participant: zoe }]);
				await expect.poll(() => waitingStates(zoePage)).toHaveLength(1);
				const lastPlaceTaker = await openMeetingAtMediaSetup(await otherPage(browser), lockedRoomId, {
					role: 'moderator'
				});

				await decideOnWaitingParticipants(lockedRoomId, 'admit', zoe.participantIdentity);
				await held;
				await lastPlaceTaker.meet('#join-button').click();
				await expect(lastPlaceTaker.meet('#layout-container')).toBeVisible({ timeout: 15_000 });
				releaseTokenRequest();

				await expect
					.poll(() => lastWaitingUpdate(page), { timeout: NEXT_STATE_TIMEOUT })
					.toEqual({ roomId: lockedRoomId, participants: [zoe] });
				expect(await knocks(page)).toHaveLength(1);
				await expect
					.poll(async () => (await waitingStates(zoePage)).at(-1), { timeout: NEXT_STATE_TIMEOUT })
					.toMatchObject({ status: MeetWaitingParticipantStatus.WAITING });
				const statuses = (await waitingStates(zoePage)).map(({ status }) => status);
				expect(statuses).toEqual([
					MeetWaitingParticipantStatus.WAITING,
					MeetWaitingParticipantStatus.ADMITTED,
					MeetWaitingParticipantStatus.WAITING
				]);
			});
		});

		test.describe('Canonical/Legacy Dual Dispatch', () => {
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
