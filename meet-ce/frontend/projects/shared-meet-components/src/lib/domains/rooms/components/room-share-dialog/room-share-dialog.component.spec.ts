import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MeetRoomAccess } from '@openvidu-meet/typings';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { RoomShareDialogComponent, RoomShareDialogData } from './room-share-dialog.component';

const access = (urls: { moderator?: string; speaker?: string }, speakerEnabled = true): MeetRoomAccess =>
	({
		anonymous: {
			moderator: { enabled: true, url: urls.moderator },
			speaker: { enabled: speakerEnabled, url: urls.speaker },
			recording: { enabled: true }
		},
		user: { enabled: true, url: 'https://meet.example.com/room/r1' }
	}) as MeetRoomAccess;

describe('RoomShareDialogComponent', () => {
	function render(data: RoomShareDialogData) {
		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: MAT_DIALOG_DATA, useValue: data },
				{ provide: MatDialogRef, useValue: { close: () => {} } },
				{ provide: NavigationService, useValue: {} },
				{
					provide: TranslateService,
					useValue: { translationsLoaded: () => true, translate: (key: string) => key }
				}
			]
		});

		const fixture = TestBed.createComponent(RoomShareDialogComponent);
		fixture.detectChanges();
		return fixture.nativeElement as HTMLElement;
	}

	const offeredLinks = (element: HTMLElement) =>
		Array.from(element.querySelectorAll('mat-radio-button')).map((option) => option.getAttribute('value'));

	it('offers the user, speaker and moderator links when the server returned both anonymous URLs', () => {
		const element = render({
			access: access({ moderator: 'https://meet.example.com/m', speaker: 'https://meet.example.com/s' })
		});

		expect(offeredLinks(element)).toEqual(['user', 'anonymous-speaker', 'anonymous-moderator']);
	});

	it('offers no moderator link when the server left its URL out', () => {
		const element = render({ access: access({ speaker: 'https://meet.example.com/s' }) });

		expect(offeredLinks(element)).toEqual(['user', 'anonymous-speaker']);
	});

	it('offers only the user link when the server left both anonymous URLs out', () => {
		const element = render({ access: access({}) });

		expect(offeredLinks(element)).toEqual(['user']);
	});

	it('keeps a returned but disabled link visible and not selectable', () => {
		const element = render({
			access: access({ moderator: 'https://meet.example.com/m', speaker: 'https://meet.example.com/s' }, false),
			canManageRoom: true
		});

		const speaker = element.querySelector('mat-radio-button[value="anonymous-speaker"]');
		expect(speaker?.classList).toContain('access-disabled');
		expect(speaker?.querySelector('.enable-link')).not.toBeNull();
	});
});
