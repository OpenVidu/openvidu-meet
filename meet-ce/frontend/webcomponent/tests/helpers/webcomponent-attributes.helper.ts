import { WebComponentProperty } from '@openvidu-meet/typings';
import { expect, type Page } from '@playwright/test';
import { ensureFixture } from './testapp.helper';

/**
 * Attribute map for `<openvidu-meet>`. Keys must be valid `WebComponentProperty`
 * values; values must be serializable as HTML attributes.
 */
export type WebComponentAttributes = Partial<Record<WebComponentProperty, string | boolean | number>>;

// Map every text-input WebComponentProperty to the testapp's input testId.
const TEXT_INPUT_TESTIDS: ReadonlyArray<[WebComponentProperty, string]> = [
	[WebComponentProperty.ROOM_URL, 'input-roomUrl'],
	[WebComponentProperty.RECORDING_URL, 'input-recordingUrl'],
	[WebComponentProperty.PARTICIPANT_NAME, 'input-participantName'],
	[WebComponentProperty.E2EE_KEY, 'input-e2eeKey'],
	[WebComponentProperty.LEAVE_REDIRECT_URL, 'input-leaveRedirectUrl'],
	[WebComponentProperty.SHOW_RECORDING, 'input-showRecording']
];

const toBoolean = (value: string | boolean | number | undefined): boolean => {
	if (value === undefined || value === null) return false;

	if (typeof value === 'boolean') return value;

	const normalized = String(value).toLowerCase();
	return normalized !== '' && normalized !== 'false' && normalized !== '0';
};

/**
 * Mounts `<openvidu-meet>` on the Angular testapp with the given attributes
 * by filling the property form and clicking "Apply config". The WC is gated
 * behind the first apply so the requested attributes are present on the
 * first render — no live property re-assignment.
 */
export const openWebcomponentWithAttributes = async (page: Page, attributes: WebComponentAttributes): Promise<void> => {
	await ensureFixture(page);

	for (const [property, testId] of TEXT_INPUT_TESTIDS) {
		const value = attributes[property];
		const filled = value === undefined || value === null ? '' : String(value);
		await page.getByTestId(testId).fill(filled);
	}

	const showOnlyRecordingsCheckbox = page.getByTestId('input-showOnlyRecordings');
	const desired = toBoolean(attributes[WebComponentProperty.SHOW_ONLY_RECORDINGS]);

	if ((await showOnlyRecordingsCheckbox.isChecked()) !== desired) {
		await showOnlyRecordingsCheckbox.click();
	}

	await page.getByTestId('btn-apply-config').click();
	await expect(page.locator('openvidu-meet')).toBeVisible();
};
