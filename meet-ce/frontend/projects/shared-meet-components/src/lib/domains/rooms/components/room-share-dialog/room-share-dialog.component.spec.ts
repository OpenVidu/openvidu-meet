import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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
		return fixture;
	}

	const OFFERED = {
		'ROOMS.SHARE_DIALOG.USERS': 'user',
		'ROOMS.SHARE_DIALOG.ANONYMOUS_SPEAKER': 'anonymous-speaker',
		'ROOMS.SHARE_DIALOG.ANONYMOUS_MODERATOR': 'anonymous-moderator'
	} as Record<string, string>;

	const optionFor = (fixture: ComponentFixture<RoomShareDialogComponent>, title: string) =>
		Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('mat-radio-button')).find(
			(option) => option.querySelector('.option-title')?.textContent?.trim() === title
		);

	const offeredLinks = (fixture: ComponentFixture<RoomShareDialogComponent>) =>
		Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.option-title')).map(
			(title) => OFFERED[title.textContent!.trim()]
		);

	it('offers the user, speaker and moderator links when the server returned both anonymous URLs', () => {
		const fixture = render({
			access: access({ moderator: 'https://meet.example.com/m', speaker: 'https://meet.example.com/s' })
		});

		expect(offeredLinks(fixture)).toEqual(['user', 'anonymous-speaker', 'anonymous-moderator']);
	});

	it('offers no moderator link when the server left its URL out', () => {
		const fixture = render({ access: access({ speaker: 'https://meet.example.com/s' }) });

		expect(offeredLinks(fixture)).toEqual(['user', 'anonymous-speaker']);
	});

	it('offers only the user link when the server left both anonymous URLs out', () => {
		const fixture = render({ access: access({}) });

		expect(offeredLinks(fixture)).toEqual(['user']);
	});

	it('keeps a returned but disabled link visible and not selectable', () => {
		const fixture = render({
			access: access({ moderator: 'https://meet.example.com/m', speaker: 'https://meet.example.com/s' }, false),
			canManageRoom: true
		});

		const speaker = optionFor(fixture, 'ROOMS.SHARE_DIALOG.ANONYMOUS_SPEAKER');
		expect(speaker?.classList).toContain('access-disabled');
		expect(speaker?.querySelector('.enable-link')).not.toBeNull();

		fixture.componentInstance.onAccessTypeChange('anonymous-speaker');
		fixture.componentInstance.generateLink();
		expect(fixture.componentInstance.roomUrl()).toBeUndefined();
	});

	it('generates the URL and label of the chosen link', () => {
		const fixture = render({
			access: access({ moderator: 'https://meet.example.com/m', speaker: 'https://meet.example.com/s' })
		});
		const dialog = fixture.componentInstance;

		dialog.onAccessTypeChange('anonymous-moderator');
		dialog.generateLink();
		expect(dialog.roomUrl()).toBe('https://meet.example.com/m');
		expect(dialog.selectedAccessLabel()).toBe('ROOMS.SHARE_DIALOG.ANONYMOUS_MODERATOR');

		dialog.onAccessTypeChange('user');
		dialog.generateLink();
		expect(dialog.roomUrl()).toBe('https://meet.example.com/room/r1');
		expect(dialog.selectedAccessLabel()).toBe('ROOMS.SHARE_DIALOG.USERS');
	});
});
