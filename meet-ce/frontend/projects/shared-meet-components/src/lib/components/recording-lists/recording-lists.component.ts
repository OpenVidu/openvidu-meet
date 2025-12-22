import { CommonModule, DatePipe } from '@angular/common';
import {
	Component,
	computed,
	EventEmitter,
	Input,
	OnChanges,
	OnInit,
	Output,
	signal,
	SimpleChanges
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MeetRecordingInfo, MeetRecordingStatus } from '@openvidu-meet/typings';
import { ViewportService } from 'openvidu-components-angular';
import { formatBytes, formatDurationToHMS } from '../../utils';

export interface RecordingTableAction {
	recordings: MeetRecordingInfo[];
	action: 'play' | 'download' | 'shareLink' | 'delete' | 'bulkDelete' | 'bulkDownload';
}

export interface RecordingTableFilter {
	nameFilter: string;
	statusFilter: MeetRecordingStatus | '';
	sortField: 'roomName' | 'startDate' | 'duration' | 'size';
	sortOrder: 'asc' | 'desc';
}

/**
 * Reusable component for displaying a list of recordings with filtering, selection, and bulk operations.
 *
 * Features:
 * - Display recordings in a Material Design table
 * - Filter by room name and status
 * - Multi-selection for bulk operations
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
		MatSortModule,
		DatePipe
	],
	templateUrl: './recording-lists.component.html',
	styleUrl: './recording-lists.component.scss'
})
export class RecordingListsComponent implements OnInit, OnChanges {
	// Input properties
	@Input() recordings: MeetRecordingInfo[] = [];
	@Input() canDeleteRecordings = false;
	@Input() showSearchBox = true;
	@Input() showFilters = true;
	@Input() showSelection = true;
	@Input() showRoomInfo = true;
	@Input() showLoadMore = false;
	@Input() loading = false;
	@Input() roomName?: string; // Optional: if provided, shows room-specific empty state message
	@Input() initialFilters: RecordingTableFilter = {
		nameFilter: '',
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: 'desc'
	};
	// Output events
	@Output() recordingAction = new EventEmitter<RecordingTableAction>();
	@Output() filterChange = new EventEmitter<RecordingTableFilter>();
	@Output() loadMore = new EventEmitter<RecordingTableFilter>();
	@Output() refresh = new EventEmitter<RecordingTableFilter>();

	// Filter controls
	nameFilterControl = new FormControl('');
	statusFilterControl = new FormControl('');

	// Sort state
	currentSortField: 'roomName' | 'startDate' | 'duration' | 'size' = 'startDate';
	currentSortOrder: 'asc' | 'desc' = 'desc';

	showEmptyFilterMessage = false; // Show message when no recordings match filters

	// Selection state
	selectedRecordings = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns: string[] = ['select', 'roomInfo', 'status', 'startDate', 'duration', 'size', 'actions'];

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
	private readonly STATUS_GROUPS = {
		ACTIVE: [MeetRecordingStatus.ACTIVE] as readonly MeetRecordingStatus[],
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

	constructor(private viewportService: ViewportService) {}

	protected isMobileView = computed(() => this.viewportService.isMobileView());

	ngOnInit() {
		this.setupFilters();
		this.updateDisplayedColumns();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (changes['recordings']) {
			// Update selected recordings based on current recordings
			const validIds = new Set(this.recordings.map((r) => r.recordingId));
			const filteredSelection = new Set([...this.selectedRecordings()].filter((id) => validIds.has(id)));
			this.selectedRecordings.set(filteredSelection);
			this.updateSelectionState();

			// Show message when no recordings match filters
			this.showEmptyFilterMessage = this.recordings.length === 0 && this.hasActiveFilters();
		}
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Set up initial filter values
		this.nameFilterControl.setValue(this.initialFilters.nameFilter);
		this.statusFilterControl.setValue(this.initialFilters.statusFilter);
		this.currentSortField = this.initialFilters.sortField;
		this.currentSortOrder = this.initialFilters.sortOrder;

		// Set up name filter change detection
		this.nameFilterControl.valueChanges.subscribe((value) => {
			// Emit filter change if value is empty
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Set up status filter change detection
		this.statusFilterControl.valueChanges.subscribe(() => {
			this.emitFilterChange();
		});
	}

	private updateDisplayedColumns() {
		this.displayedColumns = [];

		if (this.showSelection) {
			this.displayedColumns.push('select');
		}
		if (this.showRoomInfo) {
			this.displayedColumns.push('roomInfo');
		}

		this.displayedColumns.push('status', 'startDate', 'duration', 'size', 'actions');
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
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.SELECTABLE);
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

	shareRecordingLink(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'shareLink' });
	}

	deleteRecording(recording: MeetRecordingInfo) {
		this.recordingAction.emit({ recordings: [recording], action: 'delete' });
	}

	bulkDeleteSelected() {
		const selectedRecordings = this.getSelectedRecordings();
		if (selectedRecordings.length > 0) {
			this.recordingAction.emit({ recordings: selectedRecordings, action: 'bulkDelete' });
		}
	}

	bulkDownloadSelected() {
		const selectedRecordings = this.getSelectedRecordings();
		if (selectedRecordings.length > 0) {
			this.recordingAction.emit({ recordings: selectedRecordings, action: 'bulkDownload' });
		}
	}

	loadMoreRecordings() {
		const nameFilter = this.nameFilterControl.value || '';
		const statusFilter = (this.statusFilterControl.value || '') as MeetRecordingStatus | '';
		this.loadMore.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	refreshRecordings() {
		const nameFilter = this.nameFilterControl.value || '';
		const statusFilter = (this.statusFilterControl.value || '') as MeetRecordingStatus | '';
		this.refresh.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	onSortChange(sortState: Sort) {
		this.currentSortField = sortState.active as 'roomName' | 'startDate' | 'duration' | 'size';
		this.currentSortOrder = sortState.direction as 'asc' | 'desc';
		this.emitFilterChange();
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
	}

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value || '',
			statusFilter: (this.statusFilterControl.value || '') as MeetRecordingStatus | '',
			sortField: this.currentSortField,
			sortOrder: this.currentSortOrder
		});
	}

	hasActiveFilters(): boolean {
		return !!(this.nameFilterControl.value || this.statusFilterControl.value);
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
		this.statusFilterControl.setValue('');
	}

	// ===== STATUS UTILITY METHODS =====

	private isStatusInGroup(status: MeetRecordingStatus, group: readonly MeetRecordingStatus[]): boolean {
		return group.includes(status);
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

	canPlayRecording(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.PLAYABLE);
	}

	canDownloadRecording(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.DOWNLOADABLE);
	}

	canDeleteRecording(recording: MeetRecordingInfo): boolean {
		return this.canDeleteRecordings && this.isStatusInGroup(recording.status, this.STATUS_GROUPS.SELECTABLE);
	}

	isRecordingFailed(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.ERROR);
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
		if (this.isStatusInGroup(status, this.STATUS_GROUPS.COMPLETED)) {
			return 'var(--ov-meet-color-success)';
		}
		if (this.isStatusInGroup(status, this.STATUS_GROUPS.ACTIVE)) {
			return 'var(--ov-meet-color-primary)';
		}
		if (this.isStatusInGroup(status, this.STATUS_GROUPS.IN_PROGRESS)) {
			return 'var(--ov-meet-color-warning)';
		}
		if (this.isStatusInGroup(status, this.STATUS_GROUPS.ERROR)) {
			return 'var(--ov-meet-color-error)';
		}
		return 'var(--ov-meet-text-secondary)';
	}

	formatDuration(duration?: number): string {
		return formatDurationToHMS(duration);
	}

	formatFileSize(bytes?: number): string {
		return formatBytes(bytes);
	}
}
