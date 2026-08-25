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
