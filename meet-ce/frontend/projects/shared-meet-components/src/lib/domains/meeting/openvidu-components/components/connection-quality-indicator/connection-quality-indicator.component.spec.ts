import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { ParticipantModel } from '../../models/participant.model';
import { ConnectionQuality } from '../../services/livekit';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ConnectionQualityIndicatorComponent } from './connection-quality-indicator.component';

function participantWith(quality: ConnectionQuality, sid = 'sid-1'): ParticipantModel {
	return { sid, connectionQuality: quality } as unknown as ParticipantModel;
}

/**
 * Which qualities each variant is willing to surface. The tile floats over a video and reports
 * whatever LiveKit says, briefly; a participants-panel row is pinned to an avatar in a list, so it
 * only speaks up for trouble — a healthy connection marked on every row is noise. E2E cannot reach
 * the trouble values (fake media reports "excellent" and nothing forces otherwise), so this is the
 * only place the rule is expressible.
 */
describe('ConnectionQualityIndicatorComponent', () => {
	let fixture: ComponentFixture<ConnectionQualityIndicatorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ConnectionQualityIndicatorComponent],
			providers: [
				provideZonelessChangeDetection(),
				{ provide: ComponentFixtureAutoDetect, useValue: false },
				{ provide: MeetingTranslateService, useValue: { translate: (key: string) => key } }
			]
		}).compileComponents();

		fixture = TestBed.createComponent(ConnectionQualityIndicatorComponent);
	});

	function showsBadgeFor(quality: ConnectionQuality, variant: 'tile' | 'badge'): boolean {
		fixture.componentRef.setInput('participant', participantWith(quality));
		fixture.componentRef.setInput('variant', variant);
		fixture.detectChanges();
		return fixture.componentInstance.showBadge();
	}

	function render(quality: ConnectionQuality, variant: 'tile' | 'badge', sid = 'sid-1'): void {
		fixture.componentRef.setInput('participant', participantWith(quality, sid));
		fixture.componentRef.setInput('variant', variant);
		fixture.detectChanges();
	}

	function iconsByQuality(variant: 'tile' | 'badge'): Record<string, string> {
		const icons: Record<string, string> = {};

		for (const [name, quality] of Object.entries({
			excellent: ConnectionQuality.Excellent,
			good: ConnectionQuality.Good,
			poor: ConnectionQuality.Poor,
			lost: ConnectionQuality.Lost,
			unknown: ConnectionQuality.Unknown
		})) {
			render(quality, variant);
			icons[name] = fixture.componentInstance.icon();
		}

		return icons;
	}

	function tooltipFor(quality: ConnectionQuality): string {
		render(quality, 'tile');
		return fixture.componentInstance.tooltipText();
	}

	// The icon is the whole message: nothing else on the tile says how the connection is doing.
	it('shows a different icon per quality', () => {
		expect(iconsByQuality('tile')).toEqual({
			excellent: 'signal_wifi_4_bar',
			good: 'network_wifi_3_bar',
			poor: 'network_wifi_2_bar',
			lost: 'signal_wifi_off',
			unknown: 'signal_wifi_off'
		});
	});

	// A panel row's badge is a fraction of the size of a tile's, so trouble gets the two icons that
	// read at that size.
	it('swaps in the small-badge icons for trouble on a panel row', () => {
		expect(iconsByQuality('badge')).toEqual({
			excellent: 'signal_wifi_4_bar',
			good: 'network_wifi_3_bar',
			poor: 'signal_wifi_bad',
			lost: 'wifi_off',
			unknown: 'wifi_off'
		});
	});

	// The stub translate echoes the key it is given, so the tooltip shows which keys it composed.
	it('names the quality in the tooltip, after the label', () => {
		const label = 'PANEL.PARTICIPANTS.CONNECTION_QUALITY.LABEL';

		expect(tooltipFor(ConnectionQuality.Excellent)).toBe(
			`${label}: PANEL.PARTICIPANTS.CONNECTION_QUALITY.EXCELLENT`
		);
		expect(tooltipFor(ConnectionQuality.Good)).toBe(`${label}: PANEL.PARTICIPANTS.CONNECTION_QUALITY.GOOD`);
		expect(tooltipFor(ConnectionQuality.Poor)).toBe(`${label}: PANEL.PARTICIPANTS.CONNECTION_QUALITY.POOR`);
		expect(tooltipFor(ConnectionQuality.Lost)).toBe(`${label}: PANEL.PARTICIPANTS.CONNECTION_QUALITY.LOST`);
	});

	// The component is reused down a list of participants, so it must not report the previous
	// participant's connection against the next one.
	it('starts over when the tile is handed a different participant', () => {
		render(ConnectionQuality.Poor, 'tile', 'sid-1');
		expect(fixture.componentInstance.showBadge()).toBeTrue();

		render(ConnectionQuality.Unknown, 'tile', 'sid-2');

		expect(fixture.componentInstance.showBadge()).toBeFalse();
	});

	it('surfaces only a troubled connection on a panel row', () => {
		expect(showsBadgeFor(ConnectionQuality.Poor, 'badge')).toBeTrue();
		expect(showsBadgeFor(ConnectionQuality.Lost, 'badge')).toBeTrue();
	});

	it('stays out of the way on a panel row while the connection is fine', () => {
		expect(showsBadgeFor(ConnectionQuality.Excellent, 'badge')).toBeFalse();
		expect(showsBadgeFor(ConnectionQuality.Good, 'badge')).toBeFalse();
		expect(showsBadgeFor(ConnectionQuality.Unknown, 'badge')).toBeFalse();
	});

	it('reports a healthy connection on a video tile, where the row would not', () => {
		expect(showsBadgeFor(ConnectionQuality.Excellent, 'tile')).toBeTrue();
		expect(showsBadgeFor(ConnectionQuality.Excellent, 'badge')).toBeFalse();
	});

	it('says nothing on a video tile until a quality is known', () => {
		expect(showsBadgeFor(ConnectionQuality.Unknown, 'tile')).toBeFalse();
	});

	// Trouble is the one quality a tile holds instead of auto-hiding, so the two variants agree here.
	it('holds a troubled connection on a video tile too', () => {
		expect(showsBadgeFor(ConnectionQuality.Poor, 'tile')).toBeTrue();
	});
});
