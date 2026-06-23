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
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
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
import {
	MeetRecordingInfo,
	MeetRecordingSortField,
	MeetRecordingStatus,
	SortOrder,
	TextMatchMode
} from '@openvidu-meet/typings';
import { merge } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../shared/services/i18n/translate.service';
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
		DatePipe,
		TranslatePipe
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
	private readonly translateService = inject(TranslateService);

	recordings = input<MeetRecordingInfo[]>([]);
	canDeleteRecordings = input(false);
	deletableRoomIds = input<Set<string>>(new Set());
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showRoomInfo = input(true);
	showLoadMore = input(false);
	loading = input(false);
	roomName = input<string | undefined>(undefined);
	initialFilters = input<RecordingTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
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
	filtersForm = new FormGroup({
		nameFilter: new FormControl<string>('', { nonNullable: true }),
		nameMatchMode: new FormControl<TextMatchMode>(TextMatchMode.PREFIX, { nonNullable: true }),
		nameCaseInsensitive: new FormControl<boolean>(false, { nonNullable: true }),
		statusFilter: new FormControl<MeetRecordingStatus | ''>('', { nonNullable: true })
	});

	get controls() {
		return this.filtersForm.controls;
	}

	// Pending form snapshot — reflects what's in the input fields right now.
	// Drives transient UI cues (clear-X visibility, search-modifier active states).
	protected filterState = signal(this.filtersForm.getRawValue());

	// Applied filter snapshot — reflects what's actually filtering the table.
	// Updated only when emitFilterChange() fires.
	protected appliedFilterState = signal(this.filtersForm.getRawValue());

	// Reads the applied snapshot so pending free-text input doesn't count as "active".
	hasActiveFilters = computed(() => {
		const f = this.appliedFilterState();
		return !!(f.nameFilter || f.statusFilter);
	});

	// Whether the inline filter panel is expanded
	showFilterPanel = signal(false);

	nameMatchModeOptions = [
		{
			value: TextMatchMode.PREFIX,
			label: this.translateService.translate('RECORDINGS.LIST.MATCH_MODE_STARTS_WITH'),
			icon: 'first_page'
		},
		{
			value: TextMatchMode.PARTIAL,
			label: this.translateService.translate('RECORDINGS.LIST.MATCH_MODE_CONTAINS'),
			icon: 'more_horiz'
		},
		{
			value: TextMatchMode.EXACT,
			label: this.translateService.translate('RECORDINGS.LIST.MATCH_MODE_EXACT'),
			icon: 'format_quote'
		},
		{
			value: TextMatchMode.REGEX,
			label: this.translateService.translate('RECORDINGS.LIST.MATCH_MODE_REGEX'),
			icon: 'code'
		}
	];

	// Currently selected match mode option (drives the search-box trigger button)
	currentMatchMode = computed(
		() =>
			this.nameMatchModeOptions.find((o) => o.value === this.filterState().nameMatchMode) ??
			this.nameMatchModeOptions[0]
	);

	// Active filters shown as removable chips. Reads the applied snapshot.
	activeFilterChips = computed(() => {
		const f = this.appliedFilterState();
		const chips: { key: string; label: string }[] = [];
		if (f.statusFilter) {
			const opt = this.statusOptions.find((o) => o.value === f.statusFilter);
			chips.push({
				key: 'statusFilter',
				label: `${this.translateService.translate('RECORDINGS.LIST.STATUS_FILTER_LABEL_PREFIX')}${opt?.label ?? f.statusFilter}`
			});
		}
		return chips;
	});

	// Expose TextMatchMode for template
	protected readonly TextMatchMode = TextMatchMode;

	// Sort state
	currentSortField = signal<MeetRecordingSortField>('startDate');
	currentSortOrder = signal<SortOrder>(SortOrder.DESC);

	showEmptyFilterMessage = signal(false); // Show message when no recordings match filters

	// Selection state
	selectedRecordings = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Derived subsets of the current selection
	deletableSelected = computed(() => {
		const selected = this.selectedRecordings();
		return this.recordings().filter(
			(r) =>
				selected.has(r.recordingId) && RecordingUiUtils.isDeletable(r.status) && this.canDeleteRecordingItem(r)
		);
	});
	downloadableSelected = computed(() => {
		const selected = this.selectedRecordings();
		return this.recordings().filter(
			(r) => selected.has(r.recordingId) && RecordingUiUtils.isDownloadable(r.status)
		);
	});

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
		{ value: '', label: this.translateService.translate('RECORDINGS.LIST.STATUS_ALL') },
		{ value: MeetRecordingStatus.STARTING, label: this.translateService.translate('RECORDINGS.LIST.STATUS_STARTING') },
		{ value: MeetRecordingStatus.ACTIVE, label: this.translateService.translate('RECORDINGS.LIST.STATUS_ACTIVE') },
		{ value: MeetRecordingStatus.ENDING, label: this.translateService.translate('RECORDINGS.LIST.STATUS_ENDING') },
		{ value: MeetRecordingStatus.COMPLETE, label: this.translateService.translate('RECORDINGS.LIST.STATUS_COMPLETE') },
		{ value: MeetRecordingStatus.FAILED, label: this.translateService.translate('RECORDINGS.LIST.STATUS_FAILED') },
		{ value: MeetRecordingStatus.ABORTED, label: this.translateService.translate('RECORDINGS.LIST.STATUS_ABORTED') },
		{
			value: MeetRecordingStatus.LIMIT_REACHED,
			label: this.translateService.translate('RECORDINGS.LIST.STATUS_LIMIT_REACHED')
		}
	];

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
		const filters = this.initialFilters();
		this.filtersForm.patchValue(filters, { emitEvent: false });
		const initialSnapshot = this.filtersForm.getRawValue();
		this.filterState.set(initialSnapshot);
		this.appliedFilterState.set(initialSnapshot);
		this.currentSortField.set(filters.sortField);
		this.currentSortOrder.set(filters.sortOrder);

		// Keep the reactive snapshot in sync with any form change
		this.filtersForm.valueChanges
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.filterState.set(this.filtersForm.getRawValue()));

		const { nameFilter, nameMatchMode, nameCaseInsensitive, statusFilter } = this.controls;

		// Emit only when text field is cleared
		nameFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) this.emitFilterChange();
		});

		// Emit immediately on any option/select change
		merge(nameMatchMode.valueChanges, nameCaseInsensitive.valueChanges, statusFilter.valueChanges)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.emitFilterChange());
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
		return (
			RecordingUiUtils.isDownloadable(recording.status) ||
			(RecordingUiUtils.isDeletable(recording.status) && this.canDeleteRecordingItem(recording))
		);
	}

	canDeleteRecordingItem(recording: MeetRecordingInfo): boolean {
		if (this.canDeleteRecordings()) return true;
		return this.deletableRoomIds().has(recording.roomId);
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
		const recordings = this.deletableSelected();
		if (recordings.length > 0) {
			this.recordingAction.emit({ recordings, action: 'bulkDelete' });
		}
	}

	bulkDownloadSelected() {
		const recordings = this.downloadableSelected();
		if (recordings.length > 0) {
			this.recordingAction.emit({ recordings, action: 'bulkDownload' });
		}
	}

	loadMoreRecordings() {
		this.loadMore.emit(this.buildFilterSnapshot());
	}

	refreshRecordings() {
		this.refresh.emit(this.buildFilterSnapshot());
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

	toggleFilterPanel() {
		this.showFilterPanel.update((open) => !open);
	}

	toggleCaseInsensitive() {
		this.controls.nameCaseInsensitive.setValue(!this.controls.nameCaseInsensitive.value);
	}

	clearNameFilter() {
		this.controls.nameFilter.setValue('');
	}

	setMatchMode(mode: TextMatchMode) {
		this.controls.nameMatchMode.setValue(mode);
	}

	removeFilter(key: string) {
		const control = (this.filtersForm.controls as Record<string, FormControl>)[key];
		if (!control) return;
		control.setValue(typeof control.value === 'boolean' ? false : '');
	}

	private buildFilterSnapshot(): RecordingTableFilter {
		return {
			...this.filtersForm.getRawValue(),
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		};
	}

	private emitFilterChange() {
		const snapshot = this.buildFilterSnapshot();
		this.appliedFilterState.set(snapshot);
		this.filterChange.emit(snapshot);
	}

	clearFilters() {
		this.filtersForm.reset(
			{
				nameFilter: '',
				// Preserve search modifiers — they are not part of "filters"
				nameMatchMode: this.controls.nameMatchMode.value,
				nameCaseInsensitive: this.controls.nameCaseInsensitive.value,
				statusFilter: ''
			},
			{ emitEvent: false }
		);
		this.filterState.set(this.filtersForm.getRawValue());
		this.emitFilterChange();
	}
}
