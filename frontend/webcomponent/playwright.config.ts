// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { RUN_MODE } from './tests/config';

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 0,
	workers: 1,
	fullyParallel: false,
	use: {
		headless: RUN_MODE === 'CI',
		viewport: { width: 1280, height: 720 },
		ignoreHTTPSErrors: true,
		permissions: ['camera', 'microphone'],
		video: 'retain-on-failure'
	}
});
