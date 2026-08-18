import { EmbeddedAttribute } from '@openvidu-meet/typings';
import { expect, type Page } from '@playwright/test';
import { ensureFixture } from './testapp.helper';
import { type Integration } from './webcomponent.helper';

/**
 * Attribute map for `<openvidu-meet>`. Keys must be valid `EmbeddedAttribute`
 * values; values must be serializable as HTML attributes.
 */
export type WebComponentAttributes = Partial<Record<EmbeddedAttribute, string | boolean | number>>;

// Map every text-input EmbeddedAttribute to the testapp's input testId.
const TEXT_INPUT_TESTIDS: ReadonlyArray<[EmbeddedAttribute, string]> = [
	[EmbeddedAttribute.ROOM_URL, 'input-roomUrl'],
	[EmbeddedAttribute.RECORDING_URL, 'input-recordingUrl'],
	[EmbeddedAttribute.PARTICIPANT_NAME, 'input-participantName'],
	[EmbeddedAttribute.E2EE_KEY, 'input-e2eeKey'],
	[EmbeddedAttribute.LEAVE_REDIRECT_URL, 'input-leaveRedirectUrl'],
	[EmbeddedAttribute.SHOW_RECORDING, 'input-showRecording']
];

const toBoolean = (value: string | boolean | number | undefined): boolean => {
	if (value === undefined || value === null) return false;

	if (typeof value === 'boolean') return value;

	const normalized = String(value).toLowerCase();
	return normalized !== '' && normalized !== 'false' && normalized !== '0';
};

/**
 * Mounts the chosen integration on the Angular testapp with the given
 * attributes by filling the property form and clicking "Apply config". The view
 * is gated behind the first apply so the requested attributes are present on the
 * first render — no live property re-assignment.
 *
 * @param options.integration - `'webcomponent'` (default) or `'iframe'`.
 */
export const openWebcomponentWithAttributes = async (
	page: Page,
	attributes: WebComponentAttributes,
	options?: { integration?: Integration }
): Promise<void> => {
	const integration = options?.integration ?? 'webcomponent';

	await ensureFixture(page);

	await page.getByTestId('select-integration').selectOption(integration);

	for (const [property, testId] of TEXT_INPUT_TESTIDS) {
		const value = attributes[property];
		const filled = value === undefined || value === null ? '' : String(value);
		await page.getByTestId(testId).fill(filled);
	}

	// [attribute, testId, default checkbox state when the attribute is omitted]. The media-enabled
	// pair defaults to checked (the attribute itself defaults to `true`), unlike the others.
	const CHECKBOX_TESTIDS: ReadonlyArray<[EmbeddedAttribute, string, boolean]> = [
		[EmbeddedAttribute.SHOW_ONLY_RECORDINGS, 'input-showOnlyRecordings', false],
		[EmbeddedAttribute.INITIAL_AUDIO_ENABLED, 'input-initialAudioEnabled', true],
		[EmbeddedAttribute.INITIAL_VIDEO_ENABLED, 'input-initialVideoEnabled', true]
	];

	for (const [property, testId, defaultValue] of CHECKBOX_TESTIDS) {
		const checkbox = page.getByTestId(testId);
		const desired = attributes[property] === undefined ? defaultValue : toBoolean(attributes[property]);

		if ((await checkbox.isChecked()) !== desired) {
			await checkbox.click();
		}
	}

	await page.getByTestId('btn-apply-config').click();

	const host = integration === 'iframe' ? page.getByTestId('meet-iframe') : page.locator('openvidu-meet');
	await expect(host).toBeVisible();
};
