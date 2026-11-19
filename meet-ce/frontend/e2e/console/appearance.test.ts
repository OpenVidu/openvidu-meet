import { MeetAppearanceConfig, MeetRoomTheme, MeetRoomThemeMode } from '@openvidu-meet/typings';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { signInAdminBeforeEach } from '../helpers/console.helper';
import { MEET_BASE_URL } from '../helpers/meet-api.helper';

type ColorKey = 'backgroundColor' | 'primaryColor' | 'secondaryColor' | 'accentColor' | 'surfaceColor';

const COLOR_LABELS: Record<ColorKey, string> = {
	backgroundColor: 'Meeting background',
	primaryColor: 'Main controls',
	secondaryColor: 'Secondary elements',
	accentColor: 'Highlights & accents',
	surfaceColor: 'Panels & dialogs'
};

const LIGHT_DEFAULTS: Record<ColorKey, string> = {
	backgroundColor: '#f5f5f5',
	primaryColor: '#d6d6d6ff',
	secondaryColor: '#d6d6d6ff',
	accentColor: '#a9e3f0ff',
	surfaceColor: '#ffffff'
};

const DARK_DEFAULTS: Record<ColorKey, string> = {
	backgroundColor: '#1f2020',
	primaryColor: '#4a4e4e',
	secondaryColor: '#5c5c5cff',
	accentColor: '#009ab9',
	surfaceColor: '#2d2d2d'
};

/** What the color circle of a picker shows for a stored color: the opaque `rgb()` form the browser computes. */
const rgb = (hex: string): string => {
	const [red, green, blue] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
	return `rgb(${red}, ${green}, ${blue})`;
};

const storedTheme: MeetRoomTheme = {
	name: 'default',
	enabled: true,
	baseTheme: MeetRoomThemeMode.LIGHT,
	backgroundColor: '#112233',
	primaryColor: '#223344',
	secondaryColor: '#334455',
	accentColor: '#445566',
	surfaceColor: '#556677'
};

const picker = (page: Page, key: ColorKey): Locator =>
	page.locator('.color-picker-item', { hasText: COLOR_LABELS[key] });

const expectColor = async (page: Page, key: ColorKey, hex: string): Promise<void> => {
	await expect(picker(page, key).locator('.color-circle')).toHaveCSS('background-color', rgb(hex));
};

const expectColors = async (page: Page, colors: Record<ColorKey, string>): Promise<void> => {
	for (const key of Object.keys(colors) as ColorKey[]) {
		await expectColor(page, key, colors[key]);
	}
};

const pickColor = (page: Page, key: ColorKey, hex: string): Promise<void> => page.locator(`#${key}`).fill(hex);

const APPEARANCE_URL = /\/internal-api\/v1\/config\/rooms\/appearance$/;

/**
 * Serves the appearance the Configuration page reads from a state of its own and keeps what it saves, so
 * the deployment's stored theme is never touched. The server stores one theme at least, so only a fake can
 * show a deployment where none was ever saved.
 */
const fakeAppearance = async (page: Page, themes: MeetRoomTheme[]) => {
	const saved: MeetAppearanceConfig[] = [];
	let stored = themes;

	await page.route(APPEARANCE_URL, async (route) => {
		if (route.request().method() === 'PUT') {
			const { appearance } = route.request().postDataJSON() as { appearance: MeetAppearanceConfig };
			saved.push(appearance);
			stored = appearance.themes;
			await route.fulfill({ json: { message: 'Rooms appearance config updated successfully' } });
		} else {
			await route.fulfill({ json: { appearance: { themes: stored } } });
		}
	});

	return saved;
};

const customDesignSwitch = (page: Page): Locator => page.getByRole('switch');

const gotoConfiguration = async (page: Page): Promise<void> => {
	await page.goto(`${MEET_BASE_URL}/config`, { waitUntil: 'domcontentloaded' });
	await expect(customDesignSwitch(page)).toBeVisible({ timeout: 20_000 });
};

const saveButton = (page: Page): Locator => page.getByRole('button', { name: 'Save Changes' });
const resetButton = (page: Page): Locator => page.getByRole('button', { name: 'Reset Colors' });

signInAdminBeforeEach();

test.describe('Console Configuration page E2E Tests', () => {
	test('with no theme stored the switch is off, and turning it on shows the light defaults', async ({ page }) => {
		await fakeAppearance(page, []);
		await gotoConfiguration(page);

		await expect(customDesignSwitch(page)).not.toBeChecked();
		await expect(picker(page, 'primaryColor')).toHaveCount(0);

		await customDesignSwitch(page).click();

		await expect(page.getByRole('combobox', { name: 'Background style' })).toHaveText('Light');
		await expectColors(page, LIGHT_DEFAULTS);
	});

	test('saving stores a complete default theme with the picked color and the base defaults for the rest', async ({
		page
	}) => {
		const saved = await fakeAppearance(page, []);
		await gotoConfiguration(page);
		await customDesignSwitch(page).click();

		await pickColor(page, 'primaryColor', '#ff0000');
		await saveButton(page).click();

		await expect(
			page.locator('.ov-notification[data-kind="message"]', { hasText: 'Visual settings saved successfully' })
		).toBeVisible();
		expect(saved).toEqual([
			{
				themes: [
					{
						name: 'default',
						enabled: true,
						baseTheme: MeetRoomThemeMode.LIGHT,
						...LIGHT_DEFAULTS,
						primaryColor: '#ff0000'
					}
				]
			}
		]);
		await expect(saveButton(page)).toBeDisabled();
	});

	test('switching off a stored enabled theme saves at once and keeps its colors', async ({ page }) => {
		const saved = await fakeAppearance(page, [storedTheme]);
		await gotoConfiguration(page);
		await expect(customDesignSwitch(page)).toBeChecked();
		await pickColor(page, 'accentColor', '#abcdef');

		await customDesignSwitch(page).click();

		await expect(customDesignSwitch(page)).not.toBeChecked();
		expect(saved).toEqual([{ themes: [{ ...storedTheme, enabled: false }] }]);
	});

	test('changing the base replaces only the colors still at the previous base default', async ({ page }) => {
		await fakeAppearance(page, []);
		await gotoConfiguration(page);
		await customDesignSwitch(page).click();
		await pickColor(page, 'primaryColor', '#ff0000');

		await page.getByRole('combobox', { name: 'Background style' }).click();
		await page.getByRole('option', { name: 'Dark' }).click();

		await expectColors(page, { ...DARK_DEFAULTS, primaryColor: '#ff0000' });
	});

	test('resetting the colors restores the stored ones and disables the action', async ({ page }) => {
		await fakeAppearance(page, [storedTheme]);
		await gotoConfiguration(page);
		await expect(resetButton(page)).toBeDisabled();
		await expect(saveButton(page)).toBeDisabled();

		await pickColor(page, 'backgroundColor', '#ff0000');
		await pickColor(page, 'surfaceColor', '#00ff00');
		await expectColor(page, 'backgroundColor', '#ff0000');
		await expect(resetButton(page)).toBeEnabled();
		await expect(saveButton(page)).toBeEnabled();

		await resetButton(page).click();

		await expectColors(page, {
			backgroundColor: storedTheme.backgroundColor!,
			primaryColor: storedTheme.primaryColor!,
			secondaryColor: storedTheme.secondaryColor!,
			accentColor: storedTheme.accentColor!,
			surfaceColor: storedTheme.surfaceColor!
		});
		await expect(resetButton(page)).toBeDisabled();
		await expect(saveButton(page)).toBeDisabled();
	});
});
