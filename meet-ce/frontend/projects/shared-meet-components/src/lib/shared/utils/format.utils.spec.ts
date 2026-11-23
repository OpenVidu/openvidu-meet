import { daysUntil, escapeHtml } from './format.utils';

describe('escapeHtml', () => {
	it('shows markup as text', () => {
		expect(escapeHtml(`<img src="x"> & 'y'`)).toBe('&lt;img src=&quot;x&quot;&gt; &amp; &#39;y&#39;');
	});

	it('leaves plain text as it is', () => {
		expect(escapeHtml('Ana López')).toBe('Ana López');
	});
});

describe('daysUntil', () => {
	const from = new Date(2026, 10, 19, 23, 30);

	it('counts calendar days whatever the time of day', () => {
		expect(daysUntil(new Date(2026, 10, 19, 0, 5), from)).toBe(0);
		expect(daysUntil(new Date(2026, 10, 20, 0, 5), from)).toBe(1);
		expect(daysUntil(new Date(2026, 10, 26, 23, 59), from)).toBe(7);
	});

	it('is negative for a day before', () => {
		expect(daysUntil(new Date(2026, 10, 18, 12), from)).toBe(-1);
	});

	it('accepts a timestamp', () => {
		expect(daysUntil(new Date(2026, 10, 21, 8).getTime(), from)).toBe(2);
	});
});
