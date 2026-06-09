import { defineConfig } from '@playwright/test';

const isCI = process.env['RUN_MODE'] === 'CI';

const commonArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];

export default defineConfig({
	tsconfig: '../tsconfig.test.json',
	fullyParallel: false,
	retries: 0,
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
			name: 'webcomponent',
			testDir: './tests/e2e',
			use: {
				viewport: { width: 1024, height: 1024 },
				video: 'retain-on-failure',
				launchOptions: {
					args: [
						...commonArgs,
						'--allow-file-access-from-files',
						'--no-sandbox',
						'--disable-dev-shm-usage'
					]
				}
			}
		}
	]
});
