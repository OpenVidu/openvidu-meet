import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { expect, test } from '@playwright/test';
import { applyBackgroundEffect } from '../helpers/media-controls.helper';
import { createRoom, deleteRooms, getRoom, listMeetingParticipants } from '../helpers/meet-api.helper';
import { openMoreOptionsMenu } from '../helpers/panels.helper';
import { startRecording, stopRecording } from '../helpers/recordings.helper';
import { expectSignificantImageDifferenceEventually, screenshotWcElement } from '../helpers/stream.helper';
import {
	ensureFixture,
	joinedParticipantIdentity,
	leaveMeeting,
	openMeeting,
	openMeetingAtMediaSetup
} from '../helpers/testapp.helper';
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

		test('should show the join screen of room B, and no error, when the element is replaced by one on room B', async ({
			page
		}) => {
			const [roomA, roomB] = await Promise.all([getRoom(roomId), createRoom({ roomName: 'Replacement room' })]);
			createdRoomIds.push(roomB.roomId);
			await openWebcomponentWithAttributes(page, {
				[EmbeddedAttribute.ROOM_URL]: roomA.access.anonymous.speaker.url
			});
			await expect(wcLocator(page, '#participant-name-input')).toBeVisible({ timeout: 15_000 });

			await wcHost(page).evaluate(
				(element, [attribute, url]) => {
					const replacement = document.createElement(element.tagName);
					replacement.setAttribute(attribute, url);
					element.replaceWith(replacement);
				},
				[EmbeddedAttribute.ROOM_URL, roomB.access.anonymous.speaker.url]
			);

			await expect(wcLocator(page, '.room-title')).toHaveText('Replacement room', { timeout: 15_000 });
			await expect(wcLocator(page, '#participant-name-input')).toBeVisible();
			await expect(wcLocator(page, '.error-title')).toHaveCount(0);
		});

		test('should leave the meeting of room A and show the join screen of room B when room-url changes to room B', async ({
			page
		}) => {
			const roomB = await createRoom({ roomName: 'Next room' });
			createdRoomIds.push(roomB.roomId);
			await openMeeting(page, roomId, { role: 'speaker' });
			const identity = await joinedParticipantIdentity(page);

			await wcHost(page).evaluate(
				(element, [attribute, url]) => element.setAttribute(attribute, url),
				[EmbeddedAttribute.ROOM_URL, roomB.access.anonymous.speaker.url]
			);

			await expect(wcLocator(page, '.room-title')).toHaveText('Next room', { timeout: 15_000 });
			await expect(wcLocator(page, '#layout-container')).toHaveCount(0);
			await expect
				.poll(async () => (await listMeetingParticipants(roomId)).map((p) => p.participantIdentity))
				.not.toContain(identity);
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

		test("should leave the host page's <html> as the host set it", async ({ page }) => {
			await page.emulateMedia({ colorScheme: 'light' });
			await ensureFixture(page);
			const html = page.locator('html');
			await html.evaluate((root) => {
				root.removeAttribute('data-ov-theme');
				root.setAttribute('data-theme', 'cupcake');
				root.setAttribute('style', '--host-accent: rgb(1, 2, 3);');
			});

			const expectHtmlUntouched = async () => {
				await expect(html).toHaveAttribute('data-theme', 'cupcake');
				await expect(html).not.toHaveAttribute('data-ov-theme');
				await expect(html).toHaveAttribute('style', '--host-accent: rgb(1, 2, 3);');
			};

			const meetingBackground = () =>
				wcLocator(page, '#meeting-view-container').evaluate((element) =>
					getComputedStyle(element).getPropertyValue('--ov-background-color').trim()
				);

			await openMeeting(page, roomId, { role: 'moderator' });
			await expectHtmlUntouched();
			await expect.poll(meetingBackground).toBe('#f5f5f5');

			await page.emulateMedia({ colorScheme: 'dark' });
			await expect.poll(meetingBackground).toBe('#1f2020');
			await expectHtmlUntouched();

			await wcHost(page).evaluate((element) => element.remove());
			await expectHtmlUntouched();
		});

		test('should keep the device setup screen inside the element', async ({ page }) => {
			const { meet } = await openMeetingAtMediaSetup(page, roomId, { role: 'moderator' });
			await expect(meet('.top-toolbar')).toBeVisible();

			// Points of the top of the page outside the element, where the setup toolbar used to lie.
			const { outside, taken } = await wcHost(page).evaluate((element) => {
				const box = element.getBoundingClientRect();
				const points: [number, number][] = [];

				for (let x = 5; x < window.innerWidth; x += 40) {
					for (let y = 5; y < 90; y += 20) {
						if (x < box.left || x > box.right || y < box.top || y > box.bottom) points.push([x, y]);
					}
				}

				return {
					outside: points.length,
					taken: points.filter(([x, y]) => document.elementFromPoint(x, y) === element).length
				};
			});

			expect(outside).toBeGreaterThan(0);
			expect(taken).toBe(0);
		});

		test("should leave the host page's accessibility nodes in the host page", async ({ page }) => {
			await ensureFixture(page);
			const appendHostNodes = (suffix: string) =>
				page.evaluate((suffix) => {
					const liveRegion = document.createElement('div');
					liveRegion.className = 'cdk-live-announcer-element cdk-visually-hidden';
					liveRegion.id = `host-live-${suffix}`;
					const descriptions = document.createElement('div');
					descriptions.className = 'cdk-describedby-message-container cdk-visually-hidden';
					descriptions.id = `host-descriptions-${suffix}`;
					const message = document.createElement('div');
					message.id = `cdk-describedby-message-host-${suffix}-0`;
					descriptions.appendChild(message);
					document.body.append(liveRegion, descriptions);
				}, suffix);
			const hostNodesInBody = () =>
				page.evaluate(() =>
					[...document.body.querySelectorAll(':scope > [id^="host-"]')].map((node) => node.id)
				);

			await appendHostNodes('before');
			await openMeeting(page, roomId, { role: 'moderator' });
			await appendHostNodes('after');
			await openMoreOptionsMenu(page);

			await expect.poll(hostNodesInBody).toHaveLength(4);
			await expect(wcLocator(page, '.cdk-live-announcer-element')).toHaveCount(1);

			await wcHost(page).evaluate((element) => element.remove());
			await expect.poll(hostNodesInBody).toHaveLength(4);
		});
	});

	test.describe('Basic Room Features', () => {
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

		test('should keep every toolbar button inside an element narrower than the window and open the panels beside the grid', async ({
			page
		}) => {
			await openMeeting(page, roomId, { role: 'moderator' });
			await wcHost(page).evaluate((element) => (element.style.width = '700px'));

			const outside = () =>
				wcHost(page).evaluate((element) => {
					const box = element.getBoundingClientRect();
					const buttons: Element[] = [];
					const collect = (root: ParentNode): void =>
						root.querySelectorAll('*').forEach((node) => {
							if (node.matches('#toolbar button')) buttons.push(node);

							if (node.shadowRoot) collect(node.shadowRoot);
						});
					collect(element.shadowRoot!);

					return buttons
						.map((button) => ({
							id: button.id || button.className,
							button: button.getBoundingClientRect()
						}))
						.filter(
							({ button }) => button.width > 0 && (button.left < box.left || button.right > box.right)
						)
						.map(({ id }) => id);
				});

			expect(await wcHost(page).evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(750);
			await expect.poll(outside).toEqual([]);

			const grid = wcLocator(page, '.sidenav-main');
			const widthBefore = (await grid.boundingBox())!.width;
			await openMoreOptionsMenu(page);
			await wcLocator(page, '#toolbar-settings-btn').click();

			await expect(wcLocator(page, '.sidenav-menu')).toHaveClass(/mat-drawer-side/);
			await expect(wcLocator(page, '.mat-drawer-backdrop.mat-drawer-shown')).toHaveCount(0);
			await expect.poll(async () => (await grid.boundingBox())!.width).toBeLessThan(widthBefore);

			await leaveMeeting(page, { role: 'moderator' });
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

		test('should take the meeting shortcuts only from keys pressed inside the element', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'speaker' });
			const raiseHandButton = wcLocator(page, '#raise-hand-button');
			await page.evaluate(() => {
				const hostButton = document.createElement('button');
				hostButton.id = 'host-shortcut-probe';
				hostButton.textContent = 'Host button';
				document.body.appendChild(hostButton);
			});

			await page.locator('#host-shortcut-probe').focus();
			await page.keyboard.press('r');
			await page.keyboard.press('e');

			await expect(raiseHandButton).not.toHaveClass(/active/);
			await expect(wcLocator(page, '#reactions-button')).not.toHaveClass(/active/);

			await wcLocator(page, '#layout-container').click({ position: { x: 5, y: 5 } });
			await page.keyboard.press('r');

			await expect(raiseHandButton).toHaveClass(/active/);

			await leaveMeeting(page);
		});

		test('should take the meeting shortcuts while the toolbar keeps its buttons in the More options menu', async ({
			page
		}) => {
			await page.setViewportSize({ width: 700, height: 800 });
			await openMeeting(page, roomId, { role: 'speaker' });

			await wcLocator(page, '#layout-container').click({ position: { x: 5, y: 5 } });
			await page.keyboard.press('r');
			await wcLocator(page, '#more-options-btn').click();

			await expect(wcLocator(page, '#raise-hand-button')).toContainText('Lower hand');

			await page.keyboard.press('Escape');
			await leaveMeeting(page);
		});

		test('should enter fullscreen from More options with its menus inside, and leave it again', async ({
			page
		}) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await openMoreOptionsMenu(page);
			await wcLocator(page, '#fullscreen-btn').click();
			await expect(wcLocator(page, '#meeting-stage:fullscreen')).toHaveCount(1);

			await openMoreOptionsMenu(page);
			const menuItem = wcLocator(page, '#meeting-stage > .cdk-overlay-container #fullscreen-btn');
			await expect(menuItem.locator('mat-icon')).toHaveText('fullscreen_exit');

			await menuItem.click();
			await expect(wcLocator(page, '#meeting-stage:fullscreen')).toHaveCount(0);
			await expect(wcLocator(page, '#meeting-stage > .cdk-overlay-container')).toHaveCount(0);

			await openMoreOptionsMenu(page);
			await expect(wcLocator(page, '#fullscreen-btn mat-icon')).toHaveText('fullscreen');

			await page.keyboard.press('Escape');
			await leaveMeeting(page, { role: 'moderator' });
		});

		test('should show activities panel', async ({ page }) => {
			await openMeeting(page, roomId, { role: 'moderator' });

			await wcLocator(page, '#activities-panel-btn').click();
			await expect(wcLocator(page, 'ov-activities-panel')).toBeVisible();

			await leaveMeeting(page, { role: 'moderator' });
		});

		test('should keep the panel buttons in a wide toolbar laid out before its icon font arrives', async ({
			page
		}) => {
			await page.route('https://fonts.googleapis.com/icon?family=Material+Icons', (route) =>
				route.fulfill({
					contentType: 'text/css',
					body: `@font-face {
						font-family: 'Material Icons';
						src: local('DejaVu Sans'), local('Liberation Sans'), local('Arial');
						size-adjust: 300%;
					}`
				})
			);
			await openMeeting(page, roomId, { role: 'speaker' });

			await expect(wcLocator(page, '#participants-panel-btn')).toBeVisible();

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
	// inside an iframe and shows the invitation and the overlay without the link. The
	// rest of this file is webcomponent-only by design; these parity checks run
	// against each integration.
	for (const integration of INTEGRATIONS) {
		test.describe(`Embedded share-link affordances hidden [${integration}]`, () => {
			// Join as moderator: in SPA this role shows the copy meeting link button, the link in the
			// invite overlay and the link in the invite panel, so it is the strongest check that the
			// embedded mode hides them.
			test('does not show the copy link toolbar button, nor the link in the invite overlay and the participants panel', async ({
				page
			}) => {
				await openMeeting(page, roomId, { integration, role: 'moderator' });

				await test.step('does not show the copy link toolbar button', async () => {
					await expect(meetLocator(page, integration, '#toolbar')).toBeVisible();
					await expect(meetLocator(page, integration, '#camera-btn')).toBeVisible();
					await expect(meetLocator(page, integration, '#mic-btn')).toBeVisible();
					await expect(meetLocator(page, integration, '#copy-speaker-link')).toHaveCount(0);
				});

				await test.step('shows the invite overlay without the link when alone', async () => {
					await expect(meetLocator(page, integration, '#invite-overlay')).toBeVisible();
					await expect(meetLocator(page, integration, '#invite-overlay .copy-url-btn')).toHaveCount(0);
				});

				await test.step('shows the invitation without the link in the participants panel', async () => {
					await meetLocator(page, integration, '#participants-panel-btn').click();
					await expect(meetLocator(page, integration, 'ov-participants-panel')).toBeVisible();

					await expect(meetLocator(page, integration, '#invite-without-link')).toBeVisible();
					await expect(meetLocator(page, integration, '#invite-panel')).toHaveCount(0);
				});

				await leaveMeeting(page, { integration, role: 'moderator' });
			});

			test('does not render the share-room-access-link component on the join screen', async ({ page }) => {
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
		});
	}
});
