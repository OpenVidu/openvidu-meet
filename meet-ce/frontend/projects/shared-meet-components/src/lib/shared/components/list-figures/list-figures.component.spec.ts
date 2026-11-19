import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ViewportService } from '../../../domains/meeting/openvidu-components/services/viewport/viewport.service';
import { TranslateService } from '../../services/i18n/translate.service';
import { ListFigure } from './list-figure.model';
import { ListFiguresComponent } from './list-figures.component';

const FIGURES: ListFigure<string>[] = [
	{ key: 'all', label: 'All rooms', count: 24, color: 'grey', icon: 'video_chat', filter: null },
	{ key: 'meeting', label: 'In a meeting now', count: 3, color: 'blue', icon: 'videocam', filter: 'active_meeting' },
	{ key: 'open', label: 'Open', count: 15, color: 'green', icon: 'lock_open', filter: 'open' },
	{ key: 'closed', label: 'Closed', count: 6, color: 'grey', icon: 'lock', filter: 'closed' },
	{
		key: 'expiring',
		label: 'Expiring in 7 days',
		count: 2,
		color: 'orange',
		icon: 'schedule',
		sentence: '2 rooms expire in 7 days',
		next: { name: 'Design Review', link: ['/rooms', 'room-1'], when: 'in 2 days' }
	}
];

describe('ListFiguresComponent', () => {
	let fixture: ComponentFixture<ListFiguresComponent<string>>;
	let isMobileView: ReturnType<typeof signal<boolean>>;
	let selections: (string | null)[];

	const el = () => fixture.nativeElement as HTMLElement;
	const tiles = () => Array.from(el().querySelectorAll<HTMLElement>('.tile'));
	const chips = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.card-chip'));
	const tile = (label: string) => tiles().find((t) => t.textContent?.includes(label))!;

	beforeEach(async () => {
		isMobileView = signal(false);
		selections = [];

		await TestBed.configureTestingModule({
			imports: [ListFiguresComponent],
			providers: [
				provideZonelessChangeDetection(),
				provideRouter([]),
				{ provide: ViewportService, useValue: { isMobileView } },
				{
					provide: TranslateService,
					useValue: {
						translate: (key: string, params?: Record<string, unknown>) =>
							params ? `${key} ${JSON.stringify(params)}` : key,
						translationsLoaded: () => 0
					}
				}
			]
		}).compileComponents();

		fixture = TestBed.createComponent(ListFiguresComponent<string>);
		fixture.componentRef.setInput('figures', FIGURES);
		fixture.componentRef.setInput('unit', 'rooms');
		fixture.componentInstance.figureSelect.subscribe((filter) => selections.push(filter));
		await fixture.whenStable();
	});

	describe('tiles', () => {
		it('show every figure with its count and its share of the total', () => {
			expect(tiles().length).toBe(5);
			expect(tile('In a meeting now').textContent).toContain('3');
			expect(tile('In a meeting now').textContent).toContain('"percent":13');
			expect(tile('Open').textContent).toContain('"percent":63');
		});

		it('split the bar of the total by figure', () => {
			const segments = tile('All rooms').querySelectorAll<HTMLElement>('.segment');

			expect(Array.from(segments).map((s) => s.style.flexGrow)).toEqual(['3', '15', '6']);
		});

		it('make the figures with a filter buttons and the informing one not', () => {
			expect(tiles().filter((t) => t.tagName === 'BUTTON').length).toBe(4);
			expect(tile('Expiring in 7 days').tagName).toBe('DIV');
		});

		it('point the informing figure at the next item', () => {
			const link = tile('Expiring in 7 days').querySelector('a')!;

			expect(link.textContent).toBe('Design Review');
			expect(link.getAttribute('href')).toBe('/rooms/room-1');
			expect(tile('Expiring in 7 days').textContent).toContain('in 2 days');
		});

		it('mark only the selected figure as pressed', async () => {
			fixture.componentRef.setInput('selectedKey', 'open');
			await fixture.whenStable();

			const pressed = tiles().filter((t) => t.getAttribute('aria-pressed') === 'true');
			expect(pressed).toEqual([tile('Open')]);
		});

		it('emit the filter of the figure the user selects', () => {
			tile('In a meeting now').click();

			expect(selections).toEqual(['active_meeting']);
		});

		it('emit null when the selected figure is selected again', async () => {
			fixture.componentRef.setInput('selectedKey', 'closed');
			await fixture.whenStable();

			tile('Closed').click();

			expect(selections).toEqual([null]);
		});

		it('emit null for the total', () => {
			tile('All rooms').click();

			expect(selections).toEqual([null]);
		});
	});

	describe('on a phone', () => {
		beforeEach(async () => {
			isMobileView.set(true);
			await fixture.whenStable();
		});

		it('show one card with the total, a bar and a chip per figure that selects, the total included', () => {
			expect(el().querySelector('.card-total')!.textContent).toContain('24');
			expect(el().querySelector('.card-total')!.textContent).toContain('rooms');
			expect(el().querySelectorAll('.bar .segment').length).toBe(3);
			expect(chips().map((c) => c.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
				'All rooms 24',
				'In a meeting now 3',
				'Open 15',
				'Closed 6'
			]);
			expect(el().querySelector('.tiles')).toBeNull();
		});

		it('state the informing figure under the chips', () => {
			const informing = el().querySelector('.card-informing')!;

			expect(informing.textContent).toContain('2 rooms expire in 7 days');
			expect(informing.querySelector('a')!.textContent).toBe('Design Review');
		});

		it('select and clear a figure through its chip', async () => {
			chips()[1].click();
			fixture.componentRef.setInput('selectedKey', 'meeting');
			await fixture.whenStable();

			expect(chips()[1].getAttribute('aria-pressed')).toBe('true');

			chips()[1].click();

			expect(selections).toEqual(['active_meeting', null]);
		});

		it('clear the filter through the total chip, which has no swatch', async () => {
			fixture.componentRef.setInput('selectedKey', 'all');
			await fixture.whenStable();

			expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
			expect(chips()[0].querySelector('.card-chip-dot')).toBeNull();
			expect(chips()[1].querySelector('.card-chip-dot')).not.toBeNull();

			chips()[0].click();

			expect(selections).toEqual([null]);
		});
	});
});
