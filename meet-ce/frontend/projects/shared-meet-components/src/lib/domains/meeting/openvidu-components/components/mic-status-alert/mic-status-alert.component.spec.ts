import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService } from '../../../../../shared/services/i18n/translate.service';
import { LocalMediaService } from '../../services/local-media/local-media.service';
import { MicActivityService } from '../../services/mic-activity/mic-activity.service';
import { MicStatusAlertComponent } from './mic-status-alert.component';

/** The mic button the alert hangs from, which the page can move without resizing it. */
@Component({
	imports: [MicStatusAlertComponent],
	template: `
		<div class="anchor" style="position: absolute; top: 300px; left: 200px">
			<button id="mic-btn" style="width: 40px; height: 40px">mic</button>
			<ov-mic-status-alert originSelector="#mic-btn" />
		</div>
	`
})
class MicButtonHost {}

describe('MicStatusAlertComponent', () => {
	let fixture: ComponentFixture<MicButtonHost>;
	const systemMuted = signal(true);

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [MicButtonHost],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: { translate: (key: string) => key, translationsLoaded: signal(0) }
				},
				{ provide: LocalMediaService, useValue: { microphone: { enabled: signal(true) } } },
				{
					provide: MicActivityService,
					useValue: { active: signal(true), systemMuted, isSpeaking: signal(false) }
				}
			]
		}).compileComponents();

		fixture = TestBed.createComponent(MicButtonHost);
		fixture.detectChanges();
		await fixture.whenStable();
	});

	afterEach(() => fixture.destroy());

	const bubble = () => document.querySelector<HTMLElement>('#mic-system-muted-alert');
	const button = () => fixture.nativeElement.querySelector('#mic-btn') as HTMLElement;
	const anchor = () => fixture.nativeElement.querySelector('.anchor') as HTMLElement;

	const bubbleCenterOverButton = () => {
		const bubbleRect = bubble()!.getBoundingClientRect();
		const buttonRect = button().getBoundingClientRect();
		return Math.abs(bubbleRect.left + bubbleRect.width / 2 - (buttonRect.left + buttonRect.width / 2)) < 1;
	};

	it('follows the mic button when the page moves it without resizing anything', async () => {
		await waitFor(() => bubble() !== null && bubble()!.getBoundingClientRect().width > 0);
		await waitFor(bubbleCenterOverButton);
		await delay(100);

		anchor().style.transform = 'translate(120px, -80px)';

		await waitFor(bubbleCenterOverButton);
		expect(bubble()!.getBoundingClientRect().bottom).toBeLessThanOrEqual(button().getBoundingClientRect().top);
	});

	it('reads the position of the mic button only when it moves', async () => {
		await waitFor(() => bubble() !== null && bubble()!.getBoundingClientRect().width > 0);
		await delay(100);
		const reads = spyOn(button(), 'getBoundingClientRect').and.callThrough();

		await delay(300);

		expect(reads).not.toHaveBeenCalled();
	});
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
	const start = performance.now();

	while (!condition()) {
		if (performance.now() - start > timeoutMs) {
			throw new Error('Timed out waiting for condition');
		}

		await delay(20);
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
