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
const isCI = process.env['RUN_MODE'] === 'CI';

const commonArgs = [
	'--use-fake-ui-for-media-stream',
	'--use-fake-device-for-media-stream',
	'--enable-gpu'
];

export default defineConfig({
	tsconfig: './tsconfig.test.json',
	fullyParallel: false,
	// These specs drive real browsers + LiveKit + fake media. When a test joins several
	// participants they all boot the app in parallel, and the resulting resource spike can
	// push a cold Angular bootstrap past the lobby wait. That flakiness is environmental
	// (failures recover 100% in isolation), so retry it instead of failing the run.
	retries: isCI ? 2 : 0,
	workers: 1,
	reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
	outputDir: 'test-results/output',
	timeout: 60000,
	use: {
		headless: isCI,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		ignoreHTTPSErrors: true,
		permissions: ['camera', 'microphone']
	},
	projects: [
		{
			name: 'spa',
			testDir: './e2e',
			testMatch: ['**/*.test.ts'],
			testIgnore: ['**/selenium/**'],
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1366, height: 900 },
				video: 'off',
				launchOptions: {
					args: [
						...commonArgs,
						`--use-file-for-fake-audio-capture=${fakeAudioPath}`,
						'--window-size=1366,900'
					]
				}
			}
		}
	]
});
