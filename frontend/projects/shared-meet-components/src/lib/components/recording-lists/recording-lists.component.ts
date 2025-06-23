import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { Component, EventEmitter, HostBinding, Input, OnInit, Output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActionService } from 'openvidu-components-angular';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ShareRecordingDialogComponent } from '../dialogs/share-recording-dialog/share-recording-dialog.component';
import { HttpService } from '../../services';
import { MeetRecordingInfo, MeetRecordingStatus } from '../../typings/ce';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';

export interface RecordingTableAction {
	recordings: MeetRecordingInfo[];
	action: 'play' | 'download' | 'copyLink' | 'delete' | 'batchDelete' | 'batchDownload';
}

/**
 * Reusable component for displaying a list of recordings with filtering, selection, and batch operations.
 *
 * Features:
 * - Display recordings in a Material Design table
 * - Filter by room name and status
 * - Multi-selection for batch operations
 * - Individual recording actions (play, download, share, delete)
 * - Responsive design with mobile optimization
 * - Status-based styling using design tokens
 *
 * @example
 * ```html
 * <ov-recording-lists
 *   [recordings]="recordings"
 *   [canDeleteRecordings]="true"
 *   [loading]="isLoading"
 *   (recordingAction)="handleRecordingAction($event)"
 *   (filterChange)="handleFilterChange($event)">
 * </ov-recording-lists>
 * ```
 */

@Component({
	selector: 'ov-recording-lists',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatTableModule,
		MatCheckboxModule,
		MatButtonModule,
		MatIconModule,
		MatFormFieldModule,
		MatInputModule,
		MatSelectModule,
		MatMenuModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatToolbarModule,
		MatBadgeModule,
		MatDividerModule,
		DatePipe,
		DecimalPipe
	],
	templateUrl: './recording-lists.component.html',
	styleUrl: './recording-lists.component.scss'
})
export class RecordingListsComponent implements OnInit {
	// Input properties
	@Input() recordings: MeetRecordingInfo[] = [];
	@Input() canDeleteRecordings = false;
	@Input() canDownloadRecordings = true;
	@Input() showFilters = false;
	@Input() showSelection = true;
	@Input() loading = false;
	@Input() emptyMessage = 'No recordings found';

	// Host binding for styling when recordings are selected
	@HostBinding('class.has-selections')
	get hasSelections(): boolean {
		return this.selectedRecordings().size > 0;
	}

	// Output events
	@Output() recordingAction = new EventEmitter<RecordingTableAction>();
	@Output() filterChange = new EventEmitter<{ nameFilter: string; statusFilter: string }>();
	@Output() refresh = new EventEmitter<void>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

	// Selection state
	selectedRecordings = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns: string[] = ['select', 'roomId', 'status', 'startDate', 'duration', 'size', 'actions'];

	// Status options using enum values
	statusOptions = [
		{ value: '', label: 'All statuses' },
		{ value: MeetRecordingStatus.STARTING, label: 'Starting' },
		{ value: MeetRecordingStatus.ACTIVE, label: 'Active' },
		{ value: MeetRecordingStatus.ENDING, label: 'Ending' },
		{ value: MeetRecordingStatus.COMPLETE, label: 'Complete' },
		{ value: MeetRecordingStatus.FAILED, label: 'Failed' },
		{ value: MeetRecordingStatus.ABORTED, label: 'Aborted' },
		{ value: MeetRecordingStatus.LIMIT_REACHED, label: 'Limit Reached' }
	];

	// Recording status sets for different states using enum constants
	private static readonly STATUS_GROUPS = {
		ACTIVE: [
			MeetRecordingStatus.STARTING,
			MeetRecordingStatus.ACTIVE,
			MeetRecordingStatus.ENDING
		] as readonly MeetRecordingStatus[],
		COMPLETED: [MeetRecordingStatus.COMPLETE] as readonly MeetRecordingStatus[],
		ERROR: [
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		] as readonly MeetRecordingStatus[],
		IN_PROGRESS: [MeetRecordingStatus.STARTING, MeetRecordingStatus.ENDING] as readonly MeetRecordingStatus[],
		SELECTABLE: [
			MeetRecordingStatus.COMPLETE,
			MeetRecordingStatus.FAILED,
			MeetRecordingStatus.ABORTED,
			MeetRecordingStatus.LIMIT_REACHED
		] as readonly MeetRecordingStatus[],
		PLAYABLE: [MeetRecordingStatus.COMPLETE] as readonly MeetRecordingStatus[],
		DOWNLOADABLE: [MeetRecordingStatus.COMPLETE] as readonly MeetRecordingStatus[]
	} as const;

	constructor(
		private dialog: MatDialog,
		private httpService: HttpService,
		private actionService: ActionService
	) {}

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Set up name filter with debounce
		this.nameFilterControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => {
			this.filterChange.emit({
				nameFilter: value || '',
				statusFilter: this.statusFilterControl.value || ''
			});
		});

		// Set up status filter
		this.statusFilterControl.valueChanges.subscribe((value) => {
			this.filterChange.emit({
				nameFilter: this.nameFilterControl.value || '',
				statusFilter: value || ''
			});
		});
	}

	private updateDisplayedColumns() {
		this.displayedColumns = [];

		if (this.showSelection) {
			this.displayedColumns.push('select');
		}

		this.displayedColumns.push('roomId', 'status', 'startDate', 'duration', 'size', 'actions');
	}

	// ===== SELECTION METHODS =====
	toggleAllSelection() {
		const selected = this.selectedRecordings();
		if (this.allSelected()) {
			selected.clear();
		} else {
			this.recordings.forEach((recording) => {
				if (this.canSelectRecording(recording)) {
					selected.add(recording.recordingId);
				}
			});
		}
		this.selectedRecordings.set(new Set(selected));
		this.updateSelectionState();
	}

	toggleRecordingSelection(recording: MeetRecordingInfo) {
		const selected = this.selectedRecordings();
		if (selected.has(recording.recordingId)) {
			selected.delete(recording.recordingId);
		} else {
			selected.add(recording.recordingId);
		}
		this.selectedRecordings.set(new Set(selected));
		this.updateSelectionState();
	}

	private updateSelectionState() {
		const selectableRecordings = this.recordings.filter((r) => this.canSelectRecording(r));
		const selectedCount = this.selectedRecordings().size;
		const selectableCount = selectableRecordings.length;

		this.allSelected.set(selectedCount > 0 && selectedCount === selectableCount);
		this.someSelected.set(selectedCount > 0 && selectedCount < selectableCount);
	}

	isRecordingSelected(recording: MeetRecordingInfo): boolean {
		return this.selectedRecordings().has(recording.recordingId);
	}

	canSelectRecording(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.SELECTABLE.includes(recording.status);
	}

	getSelectedRecordings(): MeetRecordingInfo[] {
		const selected = this.selectedRecordings();
		return this.recordings.filter((r) => selected.has(r.recordingId));
	}

	// ===== ACTION METHODS =====
	playRecording(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'play' });
	}

	downloadRecording(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'download' });
	}

	copyAccessLink(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'copyLink' });
	}

	deleteRecording(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'delete' });
	}

	batchDeleteSelected() {
		const selectedRecordings = this.getSelectedRecordings();
		if (selectedRecordings.length > 0) {
			this.recordingAction.emit({ recordings: selectedRecordings, action: 'batchDelete' });
		}
	}

	batchDownloadSelected() {
		const selectedRecordings = this.getSelectedRecordings();
		if (selectedRecordings.length > 0) {
			this.recordingAction.emit({ recordings: selectedRecordings, action: 'batchDownload' });
		}
	}

	clearSelection() {
		this.selectedRecordings.set(new Set());
		this.updateSelectionState();
	}

	// ===== STATUS UTILITY METHODS =====

	/**
	 * Utility methods for status checking
	 */
	private static isStatusInGroup(status: MeetRecordingStatus, group: readonly MeetRecordingStatus[]): boolean {
		return group.includes(status);
	}

	/**
	 * Check if a recording is in an active/processing state
	 */
	isRecordingActive(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.ACTIVE.includes(recording.status);
	}

	/**
	 * Check if a recording is completed successfully
	 */
	isRecordingCompleted(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.COMPLETED.includes(recording.status);
	}

	/**
	 * Check if a recording has an error status
	 */
	isRecordingError(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.ERROR.includes(recording.status);
	}

	/**
	 * Get a human-readable status label
	 */
	getStatusLabel(status: MeetRecordingStatus): string {
		const statusOption = this.statusOptions.find((option) => option.value === status);
		const label = statusOption?.label || status;
		return label.toUpperCase().replace(/_/g, ' ');
	}

	// ===== PERMISSION AND CAPABILITY METHODS =====

	// Utility methods
	canPlayRecording(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.PLAYABLE.includes(recording.status);
	}

	canDownloadRecording(recording: MeetRecordingInfo): boolean {
		return RecordingListsComponent.STATUS_GROUPS.DOWNLOADABLE.includes(recording.status);
	}

	canDeleteRecording(recording: MeetRecordingInfo): boolean {
		return this.canDeleteRecordings && RecordingListsComponent.STATUS_GROUPS.SELECTABLE.includes(recording.status);
	}

	// ===== UI HELPER METHODS =====

	getStatusIcon(status: MeetRecordingStatus): string {
		switch (status) {
			case MeetRecordingStatus.COMPLETE:
				return 'check_circle';
			case MeetRecordingStatus.ACTIVE:
				return 'radio_button_checked';
			case MeetRecordingStatus.STARTING:
				return 'hourglass_top';
			case MeetRecordingStatus.ENDING:
				return 'hourglass_bottom';
			case MeetRecordingStatus.FAILED:
				return 'error';
			case MeetRecordingStatus.ABORTED:
				return 'cancel';
			case MeetRecordingStatus.LIMIT_REACHED:
				return 'warning';
			default:
				return 'help';
		}
	}

	getStatusColor(status: MeetRecordingStatus): string {
		if (RecordingListsComponent.STATUS_GROUPS.COMPLETED.includes(status)) {
			return 'var(--ov-meet-color-success)';
		}
		if (status === MeetRecordingStatus.ACTIVE) {
			return 'var(--ov-meet-color-primary)';
		}
		if (RecordingListsComponent.STATUS_GROUPS.IN_PROGRESS.includes(status)) {
			return 'var(--ov-meet-color-warning)';
		}
		if (RecordingListsComponent.STATUS_GROUPS.ERROR.includes(status)) {
			return 'var(--ov-meet-color-error)';
		}
		return 'var(--ov-meet-text-secondary)';
	}

	formatFileSize(bytes: number | undefined): string {
		if (!bytes || bytes === 0) return '-';

		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));

		return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
	}

	formatDuration(duration: number | undefined): string {
		if (!duration || duration === 0) return '-';

		const hours = Math.floor(duration / 3600);
		const minutes = Math.floor((duration % 3600) / 60);
		const seconds = Math.floor(duration % 60);

		if (hours > 0) {
			return `${hours}h ${minutes}m ${seconds}s`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds}s`;
		} else {
			return `${seconds}s`;
		}
	}
}
