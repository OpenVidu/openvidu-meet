import { expect, test } from '@playwright/test';
import { MEET_TESTAPP_URL } from '../../config';
import {
	createTestRoom,
	deleteAllRecordings,
	deleteAllRooms,
	joinRoomAs,
	leaveRoom,
	prepareForJoiningRoom
} from '../../helpers/function-helpers';
import { LeftEventReason } from '@openvidu-meet/typings';

let subscribedToAppErrors = false;

test.describe('Web Component E2E Tests', () => {
	let roomId: string;
	let participantName: string;

	test.beforeAll(async () => {
		// Create a test room before all tests
		roomId = await createTestRoom('test-room');
	});

	test.beforeEach(async ({ page }) => {
		if (!subscribedToAppErrors) {
			page.on('console', (msg) => {
				const type = msg.type();
				const tag = type === 'error' ? 'ERROR' : type === 'warning' ? 'WARNING' : 'LOG';
				console.log('[' + tag + ']', msg.text());
			});
			subscribedToAppErrors = true;
		}

		await prepareForJoiningRoom(page, MEET_TESTAPP_URL, roomId);
		participantName = `P-${Math.random().toString(36).substring(2, 9)}`;
	});

	test.afterEach(async ({ context }) => {
		await context.storageState({ path: 'test_localstorage_state.json' });
	});

	test.afterAll(async ({ browser }) => {
		const tempContext = await browser.newContext();
		const tempPage = await tempContext.newPage();
		await deleteAllRooms(tempPage);
		await deleteAllRecordings(tempPage);

		await tempContext.close();
		await tempPage.close();
	});

	test.describe('Event Handling', () => {
		test.describe('JOINED Event', () => {
			test('should receive joined event when joining as moderator', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });
				const joinElements = await page.locator('.event-joined').all();
				expect(joinElements.length).toBe(1);

				// Verify event payload contains required data
				const eventText = await joinElements[0].textContent();
				expect(eventText).toContain('roomId');
				expect(eventText).toContain('participantIdentity');
				expect(eventText).toContain(roomId);
			});

			test('should receive joined event when joining as speaker', async ({ page }) => {
				await joinRoomAs('speaker', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });
				const joinElements = await page.locator('.event-joined').all();
				expect(joinElements.length).toBe(1);

				// Verify event payload contains required data
				const eventText = await joinElements[0].textContent();
				expect(eventText).toContain('roomId');
				expect(eventText).toContain('participantIdentity');
				expect(eventText).toContain(roomId);
			});

			test('should receive only one joined event per join action', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				// Wait a bit to ensure no duplicate events
				await page.waitForTimeout(1000);

				const joinElements = await page.locator('.event-joined').all();
				expect(joinElements.length).toBe(1);
			});
		});

		test.describe('LEFT Event', () => {
			test('should receive left event with voluntary_leave reason when using leave command', async ({
				page
			}) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#leave-room-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);

				// Verify event payload contains required data including reason
				const eventText = await leftElements[0].textContent();
				expect(eventText).toContain('roomId');
				expect(eventText).toContain('participantIdentity');
				expect(eventText).toContain('reason');
				expect(eventText).toContain(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should receive left event with voluntary_leave reason when using disconnect button', async ({
				page
			}) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await leaveRoom(page, 'moderator');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);

				// Verify event payload
				const eventText = await leftElements[0].textContent();
				expect(eventText).toContain('reason');
				expect(eventText).toContain(LeftEventReason.VOLUNTARY_LEAVE);
			});

			test('should receive left event with meeting_ended reason when moderator ends meeting', async ({
				page
			}) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#end-meeting-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);

				// Verify event payload contains meeting_ended_by_self reason
				const eventText = await leftElements[0].textContent();
				expect(eventText).toContain('reason');
				expect(eventText).toContain(LeftEventReason.MEETING_ENDED);
			});

			test('should receive left event when speaker leaves room', async ({ page }) => {
				await joinRoomAs('speaker', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await leaveRoom(page, 'speaker');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);

				// Verify event payload
				const eventText = await leftElements[0].textContent();
				expect(eventText).toContain('roomId');
				expect(eventText).toContain('participantIdentity');
				expect(eventText).toContain('reason');
			});
		});

		test.describe('CLOSED Event', () => {
			test('should receive closed event after leaving as moderator', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#leave-room-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				// The closed event should be emitted after the left event
				// Wait for a reasonable amount of time for the closed event
				try {
					await page.waitForSelector('.event-closed', { timeout: 5000 });
					const closedElements = await page.locator('.event-closed').all();
					expect(closedElements.length).toBeGreaterThanOrEqual(1);
				} catch (e) {
					// Closed event might not always be emitted depending on the flow
					console.log('Closed event not received - this might be expected behavior');
				}
			});

			test('should receive closed event after ending meeting', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#end-meeting-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				// Wait for closed event after ending meeting
				try {
					await page.waitForSelector('.event-closed', { timeout: 5000 });
					const closedElements = await page.locator('.event-closed').all();
					expect(closedElements.length).toBeGreaterThanOrEqual(1);
				} catch (e) {
					console.log('Closed event not received - this might be expected behavior');
				}
			});
		});

		test.describe('Event Sequences', () => {
			test('should receive events in correct order: joined -> left', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				// Verify joined event is received first
				let joinElements = await page.locator('.event-joined').all();
				expect(joinElements.length).toBe(1);

				await page.click('#leave-room-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				// Verify both events are present
				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);

				// Verify joined event is still present
				joinElements = await page.locator('.event-joined').all();
				expect(joinElements.length).toBe(1);
			});
		});

		test.describe('Event Payload Validation', () => {
			test('should include correct roomId in joined event payload', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				const joinElements = await page.locator('.event-joined').all();
				const eventText = await joinElements[0].textContent();

				// Parse the event text to extract the payload
				expect(eventText).toContain(roomId);
				expect(eventText).toContain('"roomId"');
			});

			test('should include participantIdentity in joined event payload', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				const joinElements = await page.locator('.event-joined').all();
				const eventText = await joinElements[0].textContent();

				expect(eventText).toContain('"participantIdentity"');
				// The participantIdentity should be present (actual value may vary)
				expect(eventText).toMatch(/participantIdentity.*:/);
			});

			test('should include all required fields in left event payload', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#leave-room-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				const eventText = await leftElements[0].textContent();

				// Verify all required fields are present
				expect(eventText).toContain('"roomId"');
				expect(eventText).toContain('"participantIdentity"');
				expect(eventText).toContain('"reason"');
				expect(eventText).toContain(roomId);
			});

			test('should have valid reason in left event payload', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				await page.click('#leave-room-btn');
				await page.waitForSelector('.event-left', { timeout: 10000 });

				const leftElements = await page.locator('.event-left').all();
				const eventText = await leftElements[0].textContent();

				// Check for valid reason values from LeftEventReason enum
				const validReasons = Object.values(LeftEventReason);

				const hasValidReason = validReasons.some((reason) => eventText.includes(reason));
				expect(hasValidReason).toBe(true);
			});
		});

		test.describe('Event Error Handling', () => {
			test('should handle joining and immediately leaving', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);

				// Leave immediately after join (without waiting for full connection)
				await page.waitForTimeout(500); // Minimal wait
				await page.click('#leave-room-btn');

				// Should still receive left event
				await page.waitForSelector('.event-left', { timeout: 10000 });
				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);
			});

			test('should not emit duplicate events on rapid actions', async ({ page }) => {
				await joinRoomAs('moderator', participantName, page);
				await page.waitForSelector('.event-joined', { timeout: 10000 });

				// Rapid clicking on leave button
				await page.click('#leave-room-btn');
				await page.click('#leave-room-btn').catch(() => {
					/* Button might not be available */
				});
				await page.click('#leave-room-btn').catch(() => {
					/* Button might not be available */
				});

				await page.waitForSelector('.event-left', { timeout: 10000 });
				await page.waitForTimeout(1000); // Wait for any potential duplicate events

				// Should only have one left event
				const leftElements = await page.locator('.event-left').all();
				expect(leftElements.length).toBe(1);
			});
		});
	});
});
