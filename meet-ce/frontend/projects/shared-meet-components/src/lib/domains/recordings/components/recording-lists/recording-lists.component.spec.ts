import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { RECORDINGS_BULK_MAX_ITEMS } from '../../models/recording-list.model';
import { RecordingListsComponent } from './recording-lists.component';

const recording = (recordingId: string, roomId: string): MeetRecordingInfo =>
	({ recordingId, roomId, roomName: roomId, status: MeetRecordingStatus.COMPLETE }) as MeetRecordingInfo;

describe('RecordingListsComponent', () => {
	let fixture: ComponentFixture<RecordingListsComponent>;
	let component: RecordingListsComponent;

	const button = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLButtonElement;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [RecordingListsComponent],
			providers: [
				provideZonelessChangeDetection(),
				{
					provide: TranslateService,
					useValue: {
						translate: (key: string) => key,
						translationsLoaded: () => 0
					}
				}
			]
		}).compileComponents();

		fixture = TestBed.createComponent(RecordingListsComponent);
		component = fixture.componentInstance;
	});

	describe('play and share', () => {
		const recordingA = recording('a--EG_1--x', 'a');
		const recordingB = recording('b--EG_2--x', 'b');

		beforeEach(async () => {
			fixture.componentRef.setInput('recordings', [recordingA, recordingB]);
			fixture.componentRef.setInput('canPlayRecordings', false);
			fixture.componentRef.setInput('playableRoomIds', new Set(['a']));
			await fixture.whenStable();
		});

		it('are enabled for the rooms that grant recordingPlay and disabled for the others', () => {
			expect(button(`#play-recording-btn-${recordingA.recordingId}`).disabled).toBeFalse();
			expect(button(`#play-recording-btn-${recordingB.recordingId}`).disabled).toBeTrue();
			expect(button(`#share-recording-link-${recordingB.recordingId}`)?.disabled ?? true).toBeTrue();
		});

		it('name the missing permission in the tooltip of a disabled action', () => {
			expect(component.playTooltip(recordingB)).toBe('RECORDINGS.LIST.PLAY_PERMISSION_REQUIRED');
			expect(component.shareTooltip(recordingB)).toBe('RECORDINGS.LIST.PLAY_PERMISSION_REQUIRED');
			expect(component.playTooltip(recordingA)).not.toBe('RECORDINGS.LIST.PLAY_PERMISSION_REQUIRED');
		});

		it('are enabled for every recording once the host grants recordingPlay', async () => {
			fixture.componentRef.setInput('canPlayRecordings', true);
			await fixture.whenStable();

			expect(button(`#play-recording-btn-${recordingB.recordingId}`).disabled).toBeFalse();
		});
	});

	describe('bulk actions', () => {
		const selectRecordings = async (count: number) => {
			const recordings = Array.from({ length: count }, (_, i) => recording(`r--EG_${i}--x`, 'r'));
			fixture.componentRef.setInput('recordings', recordings);
			fixture.componentRef.setInput('canDeleteRecordings', true);
			await fixture.whenStable();
			component.selectedRecordings.set(new Set(recordings.map((r) => r.recordingId)));
			await fixture.whenStable();
		};

		it('are enabled for a selection of exactly the limit', async () => {
			await selectRecordings(RECORDINGS_BULK_MAX_ITEMS);

			expect(button('.bulk-delete-btn').disabled).toBeFalse();
			expect(component.bulkDownloadDisabled()).toBeFalse();
		});

		it('are disabled for a larger selection, saying why', async () => {
			await selectRecordings(RECORDINGS_BULK_MAX_ITEMS + 1);

			expect(button('.bulk-delete-btn').disabled).toBeTrue();
			expect(component.bulkDownloadDisabled()).toBeTrue();
			expect(component.bulkDeleteTooltip()).toBe('RECORDINGS.LIST.BULK_LIMIT_EXCEEDED');
			expect(component.bulkDownloadTooltip()).toBe('RECORDINGS.LIST.BULK_LIMIT_EXCEEDED');
		});
	});
});
