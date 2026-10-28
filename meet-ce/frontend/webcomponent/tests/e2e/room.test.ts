import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { applyBackgroundEffect, startScreensharing, stopScreensharing } from '../helpers/media-controls.helper';
import { createRoom, deleteRooms, getRoom } from '../helpers/meet-api.helper';
import { openMoreOptionsMenu } from '../helpers/panels.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { expectSignificantImageDifferenceEventually, screenshotWcElement } from '../helpers/stream.helper';
import { ensureFixture, leaveMeeting, openMeeting, openMeetingAtMediaSetup } from '../helpers/testapp.helper';
import { openWebcomponentWithAttributes } from '../helpers/webcomponent-attributes.helper';
import { INTEGRATIONS, meetLocator, wcHost, wcLocator } from '../helpers/webcomponent.helper';

test.describe('Room Features E2E Tests', () => {
	const createdRoomIds: string[] = [];
	let roomId: string;

	test.beforeEach(async () => {
		({ roomId } = await createRoom());
		createdRoomIds.push(roomId);
	});

	test.afterAll(async () => {
		await deleteRooms(createdRoomIds);
	});

	test.describe('Component Rendering', () => {
		test('should load the web component and render its shadow content', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			// The host element mounts and Playwright pierces its open Shadow DOM to
			// reach the in-meeting view rendered inside it (no iframe involved).
			await expect(page.locator('openvidu-meet')).toBeVisible();
			await expect(wcLocator(page, 'ov-meeting-view')).toBeVisible();

			await leaveMeeting(page, { role: 'moderator' });
		});

		test("should ask to log in when room-url switches to another room's user access link", async ({ page }) => {
			const [roomA, roomB] = await Promise.all([getRoom(roomId), createRoom()]);
			createdRoomIds.push(roomB.roomId);
			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.ROOM_URL]: roomA.access.anonymous.speaker.url
			});
			await expect(wcLocator(page, '#participant-name-input')).toBeVisible({ timeout: 15_000 });

			await wcHost(page).evaluate(
				(element, [attribute, url]) => element.setAttribute(attribute, url),
				[EmbeddedAttribute.ROOM_URL, roomB.access.user.url]
			);

			await expect(wcLocator(page, '#login-button')).toBeVisible({ timeout: 15_000 });
		});
	});

	// What CSS lets cross a shadow root by design (inherited and custom properties, parts) still does;
	// no stylesheet rule crosses it in either direction.
	test.describe('Style isolation', () => {
		test('should not let a host page rule reach inside the element', async ({ page }) => {
			await ensureFixture(page);
			await page.addStyleTag({ content: 'button { background: rgb(255, 0, 0) !important; }' });

			const { meet } = await openMeetingAtMediaSetup(page, roomId, { role: 'moderator' });

			await expect(meet('#join-button')).not.toHaveCSS('background-color', 'rgb(255, 0, 0)');
		});

		test("should not let Meet's rules reach the host page", async ({ page }) => {
			await ensureFixture(page);
			const probe = await page.evaluateHandle(() => {
				const button = document.createElement('button');
				button.className = 'mat-mdc-button mdc-button';
				button.textContent = 'Host button';
				return document.body.appendChild(button);
			});
			const probeStyle = () =>
				probe.evaluate((button) => {
					const { fontFamily, padding, height, borderRadius, color } = getComputedStyle(button);
					return { fontFamily, padding, height, borderRadius, color };
				});
			const styleBefore = await probeStyle();

			await openMeeting(page, roomId, { role: 'moderator' });
			await openMoreOptionsMenu(page);

			expect(await probeStyle()).toEqual(styleBefore);
			// Meet's stylesheets are the ones inside its shadow roots; none of them is in the host's <head>.
			const leaked = await page.locator('openvidu-meet').evaluate((element) => {
				const meetStyles = new Set<string>();

				const collect = (root: ShadowRoot | null): void => {
					root?.querySelectorAll('style').forEach((style) => meetStyles.add(style.textContent ?? ''));
					root?.querySelectorAll('*').forEach((node) => collect(node.shadowRoot));
				};

				collect(element.shadowRoot);
				meetStyles.delete('');

				return [...document.head.querySelectorAll('style')]
					.map((style) => style.textContent ?? '')
					.filter((text) => meetStyles.has(text));
			});
			expect(leaked).toEqual([]);
		});
	});

	test.describe('Basic Room Features', () => {
		test('should start a videoconference and display video elements', async ({ page, browser }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expect(wcLocator(page, '.OV_stream.local')).toBeVisible();

			const moderatorPage = await browser.newPage();
			await openMeeting(moderatorPage, roomId, { role: 'moderator' });

			await expect(wcLocator(page, '.OV_stream.remote')).toBeVisible();

			await leaveMeeting(moderatorPage, { role: 'moderator' });
			await moderatorPage.close();

			await leaveMeeting(page);
		});

		test('should share and stop screen sharing', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await expect(wcLocator(page, '#toolbar')).toBeVisible();

			const videos = wcLocator(page, 'video');
			await expect(videos).toHaveCount(1);

			await startScreensharing(page);
			await expect(videos).toHaveCount(2);

			await stopScreensharing(page);
			await expect(videos).toHaveCount(1);

			await startScreensharing(page);
			await expect(videos).toHaveCount(2);

			await stopScreensharing(page);
			await expect(videos).toHaveCount(1);

			await leaveMeeting(page);
		});

		test('should apply virtual background and detect visual changes', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			const before = await screenshotWcElement(page, '.OV_video-element');
			await applyBackgroundEffect(page, 'professional-1');

			await expectSignificantImageDifferenceEventually(page, '.OV_video-element', before, {
				threshold: 0.4,
				minDiffPixels: 500
			});

			await leaveMeeting(page);
		});

		test('should start and stop a recording', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await startRecording(page);
			await expect(wcLocator(page, '#stop-recording-btn')).toBeVisible();

			await stopRecording(page);
			await expect(wcLocator(page, '#stop-recording-btn')).toBeHidden();

			await leaveMeeting(page, { role: 'moderator' });
		});

		// One element joins meeting after meeting, and the one it leaves can go on recording without it.
		test('should not carry a recording into the next meeting joined with the same element', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await startRecording(page);
			await expect(wcLocator(page, '#recording-tag')).toBeVisible({ timeout: 20_000 });
			await leaveMeeting(page, { role: 'moderator' });

			const { roomId: nextRoomId } = await createRoom();
			createdRoomIds.push(nextRoomId);
			await openMeeting(page, nextRoomId, { role: 'moderator' });

			await expect(wcLocator(page, '#meeting-elapsed-time')).toBeVisible();
			await expect(wcLocator(page, '#recording-tag')).toBeHidden();

			await leaveMeeting(page, { role: 'moderator' });
		});
	});

	test.describe('UI Panels and Components', () => {
		test('should show the toolbar and media buttons', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await expect(wcLocator(page, '#toolbar')).toBeVisible();
			await expect(wcLocator(page, '#camera-btn')).toBeVisible();
			await expect(wcLocator(page, '#mic-btn')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should open the chat panel and send a message', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await wcLocator(page, '#chat-panel-btn').click();

			const chatInput = wcLocator(page, '#chat-input');
			await expect(chatInput).toBeVisible();
			await chatInput.fill('Hello world');
			await wcLocator(page, '#send-btn').click();

			await expect(wcLocator(page, '.chat-message')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should start the next meeting joined with the same element with an empty chat', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			await wcLocator(page, '#chat-panel-btn').click();
			await wcLocator(page, '#chat-input').fill('Hello world');
			await wcLocator(page, '#send-btn').click();
			await expect(wcLocator(page, '.chat-message')).toBeVisible();
			await leaveMeeting(page);

			const { roomId: nextRoomId } = await createRoom();
			createdRoomIds.push(nextRoomId);
			await openMeeting(page, nextRoomId, { role: 'speaker' });

			await expect(wcLocator(page, '#chat-panel-btn .mat-badge-content:visible')).toHaveCount(0);
			await wcLocator(page, '#chat-panel-btn').click();
			await expect(wcLocator(page, '#chat-input')).toBeVisible();
			await expect(wcLocator(page, '.chat-message')).toHaveCount(0);

			await leaveMeeting(page);
		});

		test('should leave every key typed in the chat to the chat, the meeting shortcuts included', async ({
			page
		}) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await wcLocator(page, '#chat-panel-btn').click();
			const chatInput = wcLocator(page, '#chat-input');
			await chatInput.pressSequentially('hello there 1');

			await expect(chatInput).toHaveValue('hello there 1');
			await expect(wcLocator(page, '#raise-hand-button')).not.toHaveClass(/active/);
			await expect(wcLocator(page, '#reactions-button')).not.toHaveClass(/active/);

			await leaveMeeting(page);
		});

		test('should show activities panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await wcLocator(page, '#activities-panel-btn').click();
			await expect(wcLocator(page, 'ov-activities-panel')).toBeVisible();

			await leaveMeeting(page, { role: 'moderator' });
		});

		test('should show participants panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await wcLocator(page, '#participants-panel-btn').click();
			await expect(wcLocator(page, 'ov-participants-panel')).toBeVisible();

			await leaveMeeting(page);
		});

		test('should show settings panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });

			await openMoreOptionsMenu(page);
			await wcLocator(page, '#toolbar-settings-btn').click();

			await expect(wcLocator(page, 'ov-settings-panel')).toBeVisible();

			await leaveMeeting(page);
		});
	});

	// Share-access-link affordances are owned by the host application in BOTH
	// embedded transports, so Meet hides them when running as a webcomponent OR
	// inside an iframe and shows the waiting panel/overlay in their place. The
	// rest of this file is webcomponent-only by design; these parity checks run
	// against each integration.
	for (const integration of INTEGRATIONS) {
		test.describe(`Embedded share-link affordances hidden [${integration}]`, () => {
			test('does not show the copy link toolbar button', async ({ page }) => {
				// Join as moderator: in SPA this role shows the copy meeting link button,
				// so it is the strongest check that the embedded mode hides it.
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				await expect(meetLocator(page, integration, '#toolbar')).toBeVisible();
				await expect(meetLocator(page, integration, '#copy-speaker-link')).toHaveCount(0);

				await leaveMeeting(page, { integration, role: 'moderator' });
			});

			test('does not render the share-room-access-link component in the lobby', async ({ page }) => {
				const room = await createRoom({ config: { e2ee: { enabled: true } } });
				createdRoomIds.push(room.roomId);
				const accessUrl = room.access.anonymous.moderator.url;

				await openWebcomponentWithAttributes(
					page,
					{ [EmbeddedAttribute.ROOM_URL]: accessUrl },
					{ integration }
				);

				await expect(meetLocator(page, integration, '#participant-name-input')).toBeVisible();
				await expect(meetLocator(page, integration, 'ov-share-room-access-link')).toHaveCount(0);
			});

			test('shows the waiting panel instead of the invite panel in the participants panel', async ({ page }) => {
				// Join as moderator: in SPA this role would see the share/copy link panel,
				// so it is the strongest check that the embedded mode replaces it.
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				await meetLocator(page, integration, '#participants-panel-btn').click();
				await expect(meetLocator(page, integration, 'ov-participants-panel')).toBeVisible();

				// Embedded mode replaces the share/copy link panel with the waiting panel
				await expect(meetLocator(page, integration, '#waiting-panel')).toBeVisible();
				await expect(meetLocator(page, integration, '#invite-panel')).toHaveCount(0);

				await leaveMeeting(page, { integration, role: 'moderator' });
			});

			test('shows the waiting overlay instead of the share link overlay when alone', async ({ page }) => {
				// Moderator alone: in SPA this shows the share link overlay, so it is the
				// strongest check that the embedded mode shows the waiting overlay instead.
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				await expect(meetLocator(page, integration, '#waiting-overlay')).toBeVisible();
				await expect(meetLocator(page, integration, '#share-link-overlay')).toHaveCount(0);

				await leaveMeeting(page, { integration, role: 'moderator' });
			});
		});
	}
});
