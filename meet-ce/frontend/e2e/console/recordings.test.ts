import { expect, test } from '@playwright/test';
import {
	chooseRecordingStatuses,
	figure,
	figureCount,
	gotoConsolePage,
	signInAdminBeforeEach
} from '../helpers/console.helper';

signInAdminBeforeEach();

test.describe('Console Recordings list E2E Tests', () => {
	const emptyList = { recordings: [], pagination: { isTruncated: false, maxItems: 50 } };
	/** The list hides its toolbar and filter panel while it is empty and unfiltered. */
	const oneRecording = {
		recordings: [
			{
				recordingId: 'room--EG_1--x',
				roomId: 'room',
				roomName: 'room',
				status: 'complete',
				startDate: 1_700_000_000_000,
				duration: 10,
				size: 1024
			}
		],
		pagination: { isTruncated: false, maxItems: 50 }
	};

	test('renders the recordings list rather than an error page', async ({ page }) => {
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('.error-page')).toHaveCount(0);
	});

	test('the failed figure filters by its three statuses and clears when selected again', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(figureCount(page, 'failed')).toHaveText('2');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect(page).toHaveURL(/status=failed,aborted,limit_reached/);
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');
		await expect(page.locator('.ov-active-filters .filter-chip')).toContainText('Failed, Aborted, Limit Reached');

		await figure(page, 'failed').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('choosing several statuses in the status filter lists them all', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: oneRecording });
		});
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await chooseRecordingStatuses(page, ['Failed', 'Aborted']);

		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted');
		await expect(page).toHaveURL(/status=failed,aborted/);
	});

	test('on a phone the figures are one card whose chips filter the list', async ({ page }) => {
		const statusesRequested: (string | null)[] = [];
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 5, completeRecordings: 2, recordingsInProgress: 1, failedRecordings: 2 }
			})
		);
		await page.route('**/api/v1/recordings?*', (route) => {
			statusesRequested.push(new URL(route.request().url()).searchParams.get('status'));
			return route.fulfill({ json: emptyList });
		});
		await page.setViewportSize({ width: 390, height: 844 });
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');

		await expect(page.locator('ov-list-figures .tile')).toHaveCount(0);
		await expect(page.locator('ov-list-figures .card-total-count')).toHaveText('5');
		await expect(page.locator('ov-list-figures .bar .segment')).toHaveCount(3);
		await expect(page.locator('ov-list-figures .card-chip')).toHaveCount(4);
		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');

		await figure(page, 'failed').click();

		await expect(figure(page, 'failed')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBe('failed,aborted,limit_reached');

		await figure(page, 'all').click();

		await expect(figure(page, 'all')).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => statusesRequested.at(-1)).toBeNull();
	});

	test('shows no figures when there is nothing to count or the figures cannot be read', async ({ page }) => {
		await page.route('**/api/v1/recordings?*', (route) => route.fulfill({ json: emptyList }));
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({
				json: { totalRecordings: 0, completeRecordings: 0, recordingsInProgress: 0, failedRecordings: 0 }
			})
		);
		await gotoConsolePage(page, 'recordings', 'ov-recording-lists');
		await expect(page.locator('ov-list-figures')).toHaveCount(0);

		await page.unroute('**/internal-api/v1/recordings/summary');
		await page.route('**/internal-api/v1/recordings/summary', (route) =>
			route.fulfill({ status: 500, body: '{}' })
		);
		await page.reload();

		await expect(page.locator('ov-recording-lists')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('ov-list-figures')).toHaveCount(0);
	});
});
