import { test as base, chromium, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * Fixtures for the media-devices specs.
 *
 * - `noMediaPage`: a dedicated Chromium with NO `--use-fake-ui-for-media-stream` and no media
 *   permissions, so `getUserMedia()` is genuinely blocked (regardless of the project launch flags).
 * - `fakeAudioFile` + `micAudioPage`: the project feeds one fixed fake audio file through
 *   `--use-file-for-fake-audio-capture`, and that flag is only read at browser launch. To exercise
 *   voice-activity detection against different inputs (speech, silence, ambient noise) a test picks
 *   a file with `test.use({ fakeAudioFile })` and drives `micAudioPage`, a dedicated Chromium
 *   launched with that file. Files live in `e2e/assets/audio/`.
 *
 * The regular `page` fixture is left untouched (project browser, shared setup), so only the tests
 * that need these behaviours pay for a dedicated browser.
 */
const AUDIO_DIR = path.resolve(__dirname, '../assets/audio');

// Mirrors playwright.config.ts `commonArgs` so the fake-media setup matches the rest of the suite.
const COMMON_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-gpu'];

type MediaDevicesFixtures = {
	noMediaPage: Page;
	/** Name of a file under e2e/assets/audio captured as the fake mic by `micAudioPage`. */
	fakeAudioFile: string;
	micAudioPage: Page;
};

export const test = base.extend<MediaDevicesFixtures>({
	noMediaPage: async ({}, use, testInfo) => {
		const browser = await chromium.launch({
			headless: testInfo.project.use.headless,
			args: ['--window-size=1366,900']
		});
		const context = await browser.newContext({
			permissions: [],
			viewport: { width: 1366, height: 900 }
		});
		const page = await context.newPage();

		await use(page);

		await context.close();
		await browser.close();
	},

	fakeAudioFile: ['continuous_speech.wav', { option: true }],

	micAudioPage: async ({ fakeAudioFile }, use, testInfo) => {
		const browser = await chromium.launch({
			headless: testInfo.project.use.headless,
			args: [
				...COMMON_ARGS,
				`--use-file-for-fake-audio-capture=${path.resolve(AUDIO_DIR, fakeAudioFile)}`,
				'--window-size=1366,900'
			]
		});
		const context = await browser.newContext({
			permissions: ['camera', 'microphone'],
			viewport: { width: 1366, height: 900 },
			ignoreHTTPSErrors: true
		});
		const page = await context.newPage();

		await use(page);

		await context.close();
		await browser.close();
	}
});

export { expect } from '@playwright/test';
