// tests/e2e/openvidu-meet.e2e.ts
import { test, expect } from '@playwright/test';

test.describe('OpenViduMeet E2E Tests', () => {
	test('should load iframe with correct URL including additional parameters', async ({ page }) => {
		await page.setContent(
			`<openvidu-meet room-url="https://meet.example.com" room-name="Sala1" pepito-perez="55"></openvidu-meet>`
		);
		const iframe = page.locator('iframe');
		await expect(iframe).toHaveAttribute('src', 'https://meet.example.com?room-name=Sala1&pepito-perez=55');
	});

	test('should handle postMessage interactions', async ({ page }) => {
		await page.setContent(`<openvidu-meet room-url="https://meet.example.com" room-name="Sala1"></openvidu-meet>`);

		const [event] = await Promise.all([
			page.evaluate(() => {
				return new Promise((resolve) => {
					const component = document.querySelector('openvidu-meet');
					if (component) {
						component.addEventListener('conference-event', (e) => resolve(e.detail));
					}
					window.postMessage({ event: 'participant-joined', participant: 'María Gómez' }, '*');
				});
			})
		]);

		expect(event).toEqual({ event: 'participant-joined', participant: 'María Gómez' });
	});
});
