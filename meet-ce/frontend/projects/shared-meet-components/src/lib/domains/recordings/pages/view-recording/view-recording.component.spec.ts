import { signal, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { MeetRoomMemberPermissions } from '@openvidu-meet/typings';
import { DialogService } from '../../../../shared/services/dialog.service';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { LeaveRedirectService } from '../../../../shared/services/leave-redirect.service';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { RuntimeConfigService } from '../../../../shared/services/runtime-config.service';
import { AuthService } from '../../../auth/services/auth.service';
import { ViewportService } from '../../../meeting/openvidu-components';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { RecordingEntryService } from '../../services/recording-entry.service';
import { RecordingService } from '../../services/recording.service';
import { ViewRecordingComponent } from './view-recording.component';

describe('ViewRecordingComponent download offer', () => {
	const linkGrantsDownload = signal(false);
	const permissions = signal<Partial<MeetRoomMemberPermissions> | undefined>(undefined);

	const createComponent = (recordingSecret?: string) => {
		TestBed.overrideComponent(ViewRecordingComponent, { set: { template: '', imports: [], styleUrls: [] } });
		const component = TestBed.createComponent(ViewRecordingComponent).componentInstance;
		component.recordingSecret = recordingSecret;
		return component;
	};

	beforeEach(() => {
		linkGrantsDownload.set(false);
		permissions.set(undefined);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: RecordingEntryService, useValue: { linkGrantsDownload } },
				{ provide: RoomMemberContextService, useValue: { permissions } },
				{ provide: ActivatedRoute, useValue: {} },
				...[
					RecordingService,
					NotificationService,
					DialogService,
					NavigationService,
					LeaveRedirectService,
					RuntimeConfigService,
					AuthService,
					ViewportService,
					TranslateService
				].map((provide) => ({ provide, useValue: {} }))
			]
		});
	});

	it('is not offered by a play-only secret, even to a member holding recordingDownload', () => {
		permissions.set({ recordingDownload: true });

		expect(createComponent('secret').canDownloadRecording()).toBeFalse();
	});

	it('is offered by a secret that grants download', () => {
		linkGrantsDownload.set(true);

		expect(createComponent('secret').canDownloadRecording()).toBeTrue();
	});

	it('follows recordingDownload of the member when the visit brings no secret', () => {
		permissions.set({ recordingDownload: true });
		expect(createComponent().canDownloadRecording()).toBeTrue();
	});

	it('is not offered without a secret to a member lacking recordingDownload', () => {
		permissions.set({ recordingDownload: false });
		expect(createComponent().canDownloadRecording()).toBeFalse();
	});
});
