import { Component, inject, input, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { MeetRecordingFilters, MeetRecordingInfo, SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { EntityListState } from '../../../../shared/models/entity-list.model';
import { NavigationService } from '../../../../shared/services/navigation.service';
import { NotificationService } from '../../../../shared/services/notification.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
import { MeetingContextService } from '../../../meeting/services';
import { RoomMemberContextService } from '../../../room-members/services/room-member-context.service';
import { RoomService } from '../../../rooms/services/room.service';
import { RecordingListsComponent } from '../../components/recording-lists/recording-lists.component';
import { RecordingTableAction, RecordingTableFilter } from '../../models/recording-list.model';
import { RecordingActionsService } from '../../services/recording-actions.service';
import { RecordingService } from '../../services/recording.service';
import { LoggerService } from '../../../../shared/services/logger.service';
import type { ILogger } from '../../../../shared/models/logger.model';

@Component({
	selector: 'ov-room-recordings',
	templateUrl: './room-recordings.component.html',
	styleUrls: ['./room-recordings.component.scss'],
	imports: [
		MatToolbarModule,
		MatButtonModule,
		RecordingListsComponent,
		MatIconModule,
		MatProgressSpinnerModule,
		TranslatePipe
	]
})
export class RoomRecordingsComponent implements OnInit {
	protected readonly loggerService = inject(LoggerService);
	protected readonly recordingService = inject(RecordingService);
	private readonly recordingActions = inject(RecordingActionsService);
	protected readonly roomMemberContextService = inject(RoomMemberContextService);
	protected readonly roomService = inject(RoomService);
	protected readonly notificationService = inject(NotificationService);
	protected readonly navigationService = inject(NavigationService);
	protected readonly meetingContextService = inject(MeetingContextService);
	private readonly translateService = inject(TranslateService);
	protected readonly route = inject(ActivatedRoute);
	protected log: ILogger = this.loggerService.get('OpenVidu Meet - RoomRecordingsComponent');

	/**
	 * Optional input that takes precedence over `ActivatedRoute.snapshot.params`.
	 * Populated when this component is rendered outside the Angular Router
	 * (e.g. the Angular Elements Web Component); the SPA leaves it empty and
	 * falls back to the route snapshot.
	 */
	readonly roomIdInput = input<string>('', { alias: 'roomId' });

	roomId = '';
	roomName = signal('');
	canDeleteRecordings = signal(false);
	canDownloadRecordings = signal(false);

	initialFilters = signal<RecordingTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	protected readonly list = new EntityListState<MeetRecordingInfo, RecordingTableFilter>({
		initialFilters: this.initialFilters(),
		fetchPage: (filters, nextPageToken) => this.fetchRecordingsPage(filters, nextPageToken),
		onLoadError: (error) => {
			this.notificationService.showSnackbar(
				this.translateService.translate('RECORDINGS.ERRORS.LOAD_RECORDINGS_FAILED')
			);
			this.log.e('Error loading recordings:', error);
		}
	});

	async ngOnInit() {
		this.roomId = this.roomIdInput() || this.route.snapshot.paramMap.get('room-id')!;
		this.canDeleteRecordings.set(this.roomMemberContextService.hasPermission('recordingDelete'));
		this.canDownloadRecordings.set(this.roomMemberContextService.hasPermission('recordingDownload'));

		await this.list.initialize(this.initialFilters(), () => this.resolveRoomName());
	}

	/** Derives the toolbar title from the first page, falling back to the room service. */
	private async resolveRoomName() {
		const [firstRecording] = this.list.items();

		if (firstRecording) {
			this.roomName.set(firstRecording.roomName);
		} else {
			const { roomName } = await this.roomService.getRoom(this.roomId, { fields: ['roomName'] });
			this.roomName.set(roomName);
		}
	}

	async goBackToRoom() {
		try {
			await this.navigationService.goBackToRoom(this.roomId);
		} catch (error) {
			this.log.e('Error navigating back to room:', error);
		}
	}

	async onRecordingAction(action: RecordingTableAction) {
		await this.recordingActions.handle(action, { list: this.list, log: this.log });
	}

	private async fetchRecordingsPage(filters: RecordingTableFilter, nextPageToken: string | undefined) {
		const recordingFilters: MeetRecordingFilters = {
			roomId: this.roomId,
			maxItems: 50,
			nextPageToken,
			sortField: filters.sortField,
			sortOrder: filters.sortOrder
		};

		// Apply status filter if provided
		if (filters.statusFilter) {
			recordingFilters.status = filters.statusFilter;
		}

		const response = await this.recordingService.listRecordings(recordingFilters);

		return {
			items: response.recordings,
			nextPageToken: response.pagination.nextPageToken,
			hasMore: response.pagination.isTruncated
		};
	}
}
