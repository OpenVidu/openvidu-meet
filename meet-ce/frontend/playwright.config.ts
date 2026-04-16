import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const fakeAudioPath = path.resolve(__dirname, 'e2e/assets/audio_test.wav');

export default defineConfig({
	testDir: './e2e',
	testMatch: ['**/*.test.ts'],
	testIgnore: ['**/selenium/**'],
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: 'list',
	use: {
		headless: true,
		viewport: { width: 1366, height: 900 },
		trace: 'on-first-retry',
		video: 'off',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			grepInvert: /@no-media-permissions/,
			use: {
				...devices['Desktop Chrome'],
				permissions: ['microphone', 'camera'],
				launchOptions: {
					args: [
						'--use-fake-ui-for-media-stream',
						'--use-fake-device-for-media-stream',
						`--use-file-for-fake-audio-capture=${fakeAudioPath}`,
						'--window-size=1366,900'
					]
				}
			}
		},
		{
			name: 'chromium-no-media-permissions',
			grep: /@no-media-permissions/,
			use: {
				...devices['Desktop Chrome'],
				permissions: [],
				launchOptions: {
					args: ['--window-size=1366,900']
				}
			}
		}
	]
});
