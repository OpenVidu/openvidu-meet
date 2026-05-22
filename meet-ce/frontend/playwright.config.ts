import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';

const resolveFakeAudioPath = (): string => {
	const fakeAudioPathFromEnv = process.env['E2E_FAKE_AUDIO_PATH'];

	if (fakeAudioPathFromEnv) {
		return path.resolve(__dirname, fakeAudioPathFromEnv);
	}

	const fakeAudioFile = process.env['E2E_FAKE_AUDIO_FILE'];

	if (fakeAudioFile) {
		const candidatePaths = [
			path.resolve(__dirname, 'e2e/assets/audio', fakeAudioFile),
			path.resolve(__dirname, 'e2e/assets', fakeAudioFile)
		];

		for (const candidate of candidatePaths) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	const defaultCandidates = [
		path.resolve(__dirname, 'e2e/assets/audio/continuous_speech.wav'),
		path.resolve(__dirname, 'e2e/assets/audio_test.wav')
	];

	for (const candidate of defaultCandidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return defaultCandidates[0];
};

const fakeAudioPath = resolveFakeAudioPath();

export default defineConfig({
	testDir: './e2e',
	tsconfig: './tsconfig.test.json',
	testMatch: ['**/*.test.ts'],
	testIgnore: ['**/selenium/**'],
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
	outputDir: 'test-results/output',
	timeout: 60000,
	use: {
		headless: process.env['RUN_MODE'] === 'CI',
		viewport: { width: 1366, height: 900 },
		trace: 'on-first-retry',
		video: 'off',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
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
		}
	]
});
