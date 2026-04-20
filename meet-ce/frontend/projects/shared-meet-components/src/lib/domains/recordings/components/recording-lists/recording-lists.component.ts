import { DatePipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	OnInit,
	output,
	signal,
	untracked
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MeetRecordingInfo, MeetRecordingSortField, MeetRecordingStatus, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { ViewportService } from '../../../meeting/openvidu-components';
import { RecordingTableAction, RecordingTableFilter } from '../../models/recording-list.model';
import { RecordingUiUtils } from '../../utils/ui';

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
	styleUrl: './recording-lists.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[class.has-selections]': 'hasSelections()'
	}
})
export class RecordingListsComponent implements OnInit {
	private viewportService = inject(ViewportService);
	private destroyRef = inject(DestroyRef);

	recordings = input<MeetRecordingInfo[]>([]);
	canDeleteRecordings = input(false);
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showRoomInfo = input(true);
	showLoadMore = input(false);
	loading = input(false);
	roomName = input<string | undefined>(undefined);
	initialFilters = input<RecordingTableFilter>({
		nameFilter: '',
		statusFilter: '',
		sortField: 'startDate',
		sortOrder: SortOrder.DESC
	});

	// Host binding state for styling when rooms are selected
	hasSelections = computed(() => this.selectedRecordings().size > 0);

	// Output events
	recordingAction = output<RecordingTableAction>();
	recordingClicked = output<string>();
	filterChange = output<RecordingTableFilter>();
	loadMore = output<RecordingTableFilter>();
	refresh = output<RecordingTableFilter>();

	// Filter controls
	nameFilterControl = new FormControl<string>('', { nonNullable: true });
	statusFilterControl = new FormControl<MeetRecordingStatus | ''>('', { nonNullable: true });

	// Sort state
	currentSortField = signal<MeetRecordingSortField>('startDate');
	currentSortOrder = signal<SortOrder>(SortOrder.DESC);

	showEmptyFilterMessage = signal(false); // Show message when no recordings match filters

	// Selection state
	selectedRecordings = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns = computed(() => {
		const columns = ['status', 'startDate', 'duration', 'size', 'actions'];
		if (this.showRoomInfo()) {
			columns.unshift('roomInfo');
		}
		if (this.showSelection()) {
			columns.unshift('select');
		}
		return columns;
	});

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

	protected isMobileView = this.viewportService.isMobileView;

	// Make RecordingUiUtils available in template
	protected readonly RecordingUiUtils = RecordingUiUtils;

	constructor() {
		effect(() => {
			// Update selected recordings based on current recordings
			const recordings = this.recordings();
			const validRecordingIds = new Set(recordings.map((r) => r.recordingId));

			// Use untracked to avoid circular dependency in effect
			const currentSelection = untracked(() => this.selectedRecordings());
			const filteredSelection = new Set([...currentSelection].filter((id) => validRecordingIds.has(id)));

			// Only update if the selection has actually changed
			if (!setsAreEqual(filteredSelection, currentSelection)) {
				this.selectedRecordings.set(filteredSelection);
				this.updateSelectionState();
			}

			// Show message when no recordings match filters
			this.showEmptyFilterMessage.set(recordings.length === 0 && this.hasActiveFilters());
		});
	}

	ngOnInit() {
		this.setupFilters();

		// Calculate showEmptyFilterMessage based on initial state
		this.showEmptyFilterMessage.set(this.recordings().length === 0 && this.hasActiveFilters());
	}

	// ===== INITIALIZATION METHODS =====

	private setupFilters() {
		// Set up initial filter values from input signal
		const filters = this.initialFilters();
		this.nameFilterControl.setValue(filters.nameFilter);
		this.statusFilterControl.setValue(filters.statusFilter);
		this.currentSortField.set(filters.sortField);
		this.currentSortOrder.set(filters.sortOrder);

		// Set up name filter change detection
		this.nameFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			// Emit filter change if value is empty
			if (!value) {
				this.emitFilterChange();
			}
		});

		// Set up status filter change detection
		this.statusFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
			this.emitFilterChange();
		});
	}

	// ===== SELECTION METHODS =====

	toggleAllSelection() {
		const selected = this.selectedRecordings();
		if (this.allSelected()) {
			selected.clear();
		} else {
			this.recordings().forEach((recording) => {
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
		const selectableRecordings = this.recordings().filter((r) => this.canSelectRecording(r));
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
		return this.recordings().filter((r) => selected.has(r.recordingId));
	}

	// ===== ACTION METHODS =====

	onRecordingClick(recording: MeetRecordingInfo) {
		this.recordingClicked.emit(recording.recordingId);
	}

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
		const nameFilter = this.nameFilterControl.value;
		const statusFilter = this.statusFilterControl.value;
		this.loadMore.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	refreshRecordings() {
		const nameFilter = this.nameFilterControl.value;
		const statusFilter = this.statusFilterControl.value;
		this.refresh.emit({
			nameFilter,
			statusFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	onSortChange(sortState: Sort) {
		this.currentSortField.set(sortState.active as MeetRecordingSortField);
		this.currentSortOrder.set(sortState.direction as SortOrder);
		this.emitFilterChange();
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
	}

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value,
			statusFilter: this.statusFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
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

	// ===== PERMISSION AND CAPABILITY METHODS =====

	canPlayRecording(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.PLAYABLE);
	}

	canDownloadRecording(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.DOWNLOADABLE);
	}

	canDeleteRecording(recording: MeetRecordingInfo): boolean {
		return this.canDeleteRecordings() && this.isStatusInGroup(recording.status, this.STATUS_GROUPS.SELECTABLE);
	}

	isRecordingFailed(recording: MeetRecordingInfo): boolean {
		return this.isStatusInGroup(recording.status, this.STATUS_GROUPS.ERROR);
	}
}
