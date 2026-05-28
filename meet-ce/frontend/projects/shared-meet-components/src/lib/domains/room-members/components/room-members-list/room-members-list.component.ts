import { CommonModule, DatePipe } from '@angular/common';
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { MeetRoomMember, MeetRoomMemberSortField, SortOrder, TextMatchMode } from '@openvidu-meet/typings';
import { merge } from 'rxjs';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomMemberUiUtils } from '../../utils/ui';

export interface MemberTableAction {
	members: MeetRoomMember[];
	action: 'addMember' | 'edit' | 'copyLink' | 'delete' | 'bulkDelete';
}

export interface MemberTableFilter {
	nameFilter: string;
	nameMatchMode: TextMatchMode;
	nameCaseInsensitive: boolean;
	sortField: MeetRoomMemberSortField;
	sortOrder: SortOrder;
}

/**
 * Reusable component for displaying a list of room members with filtering, selection, and bulk operations.
 *
 * Features:
 * - Display room members in a Material Design table
 * - Filter by member name
 * - Multi-selection for bulk operations
 * - Individual member actions (copy link, delete)
 * - Responsive design with mobile optimization
 *
 * @example
 * ```html
 * <ov-room-members-lists
 *   [members]="members"
 *   [loading]="isLoading"
 *   [showFilters]="true"
 *   [showSelection]="true"
 *   (memberAction)="handleMemberAction($event)"
 *   (filterChange)="handleFilterChange($event)"
 *   (refresh)="refreshMembers()">
 * </ov-room-members-lists>
 * ```
 */
@Component({
	selector: 'ov-room-members-list',
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatTableModule,
		MatCheckboxModule,
		MatButtonModule,
		MatIconModule,
		MatFormFieldModule,
		MatInputModule,
		MatMenuModule,
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatToolbarModule,
		MatBadgeModule,
		MatSortModule,
		RouterModule,
		DatePipe
	],
	templateUrl: './room-members-list.component.html',
	styleUrl: './room-members-list.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: {
		'[class.has-selections]': 'hasSelections()'
	}
})
export class RoomMembersListsComponent implements OnInit {
	private destroyRef = inject(DestroyRef);

	members = input<MeetRoomMember[]>([]);
	showSearchBox = input(true);
	showFilters = input(true);
	showSelection = input(true);
	showLoadMore = input(false);
	loading = input(false);
	canViewUserProfiles = input(true);
	initialFilters = input<MemberTableFilter>({
		nameFilter: '',
		nameMatchMode: TextMatchMode.PREFIX,
		nameCaseInsensitive: false,
		sortField: 'membershipDate',
		sortOrder: SortOrder.DESC
	});

	// Host binding state for styling when members are selected
	hasSelections = computed(() => this.selectedMembers().size > 0);

	// Output events
	readonly memberAction = output<MemberTableAction>();
	readonly filterChange = output<MemberTableFilter>();
	readonly loadMore = output<MemberTableFilter>();
	readonly refresh = output<MemberTableFilter>();
	readonly memberClicked = output<string>();

	// Filter controls
	filtersForm = new FormGroup({
		nameFilter: new FormControl<string>('', { nonNullable: true }),
		nameMatchMode: new FormControl<TextMatchMode>(TextMatchMode.PREFIX, { nonNullable: true }),
		nameCaseInsensitive: new FormControl<boolean>(false, { nonNullable: true })
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
	hasActiveFilters = computed(() => !!this.appliedFilterState().nameFilter);

	nameMatchModeOptions = [
		{ value: TextMatchMode.PREFIX, label: 'Starts with', icon: 'first_page' },
		{ value: TextMatchMode.PARTIAL, label: 'Contains', icon: 'more_horiz' },
		{ value: TextMatchMode.EXACT, label: 'Exact match', icon: 'format_quote' },
		{ value: TextMatchMode.REGEX, label: 'Regex', icon: 'code' }
	];

	// Currently selected match mode option (drives the search-box trigger button)
	currentMatchMode = computed(
		() =>
			this.nameMatchModeOptions.find((o) => o.value === this.filterState().nameMatchMode) ??
			this.nameMatchModeOptions[0]
	);

	// Expose TextMatchMode for template
	protected readonly TextMatchMode = TextMatchMode;

	// Sort state
	currentSortField = signal<MeetRoomMemberSortField>('membershipDate');
	currentSortOrder = signal<SortOrder>(SortOrder.DESC);

	showEmptyFilterMessage = signal(false);

	// Selection state
	selectedMembers = signal<Set<string>>(new Set());
	allSelected = signal(false);
	someSelected = signal(false);

	// Table configuration
	displayedColumns = computed(() => {
		const columns = ['name', 'role', 'memberType', 'membershipDate', 'actions'];
		return this.showSelection() ? ['select', ...columns] : columns;
	});

	protected readonly RoomMemberUiUtils = RoomMemberUiUtils;

	constructor() {
		effect(() => {
			const members = this.members();
			const validMemberIds = new Set(members.map((m) => m.memberId));

			const currentSelection = untracked(() => this.selectedMembers());
			const filteredSelection = new Set([...currentSelection].filter((id) => validMemberIds.has(id)));

			if (!setsAreEqual(filteredSelection, currentSelection)) {
				this.selectedMembers.set(filteredSelection);
				this.updateSelectionState();
			}

			this.showEmptyFilterMessage.set(members.length === 0 && this.hasActiveFilters());
		});
	}

	ngOnInit() {
		this.setupFilters();
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

		const { nameFilter, nameMatchMode, nameCaseInsensitive } = this.controls;

		// Emit only when text field is cleared
		nameFilter.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) this.emitFilterChange();
		});

		// Emit immediately on any option change
		merge(nameMatchMode.valueChanges, nameCaseInsensitive.valueChanges)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => this.emitFilterChange());
	}

	// ===== SELECTION METHODS =====

	toggleAllSelection() {
		const selected = this.selectedMembers();
		if (this.allSelected()) {
			selected.clear();
		} else {
			this.members().forEach((member) => {
				if (this.canSelectMember(member)) {
					selected.add(member.memberId);
				}
			});
		}
		this.selectedMembers.set(new Set(selected));
		this.updateSelectionState();
	}

	toggleMemberSelection(member: MeetRoomMember) {
		const selected = this.selectedMembers();
		if (selected.has(member.memberId)) {
			selected.delete(member.memberId);
		} else {
			selected.add(member.memberId);
		}
		this.selectedMembers.set(new Set(selected));
		this.updateSelectionState();
	}

	private updateSelectionState() {
		const selectableMembers = this.members().filter((m) => this.canSelectMember(m));
		const selectedCount = this.selectedMembers().size;
		const selectableCount = selectableMembers.length;

		this.allSelected.set(selectedCount > 0 && selectedCount === selectableCount);
		this.someSelected.set(selectedCount > 0 && selectedCount < selectableCount);
	}

	isMemberSelected(member: MeetRoomMember): boolean {
		return this.selectedMembers().has(member.memberId);
	}

	canSelectMember(_member: MeetRoomMember): boolean {
		return true;
	}

	getSelectedMembers(): MeetRoomMember[] {
		const selected = this.selectedMembers();
		return this.members().filter((m) => selected.has(m.memberId));
	}

	// ===== ACTION METHODS =====

	addMember() {
		this.memberAction.emit({ members: [], action: 'addMember' });
	}

	onMemberClick(member: MeetRoomMember) {
		this.memberClicked.emit(member.memberId);
	}

	copyMemberLink(member: MeetRoomMember) {
		this.memberAction.emit({ members: [member], action: 'copyLink' });
	}

	editMember(member: MeetRoomMember) {
		this.memberAction.emit({ members: [member], action: 'edit' });
	}

	deleteMember(member: MeetRoomMember) {
		this.memberAction.emit({ members: [member], action: 'delete' });
	}

	bulkDeleteSelected() {
		const selectedMembers = this.getSelectedMembers();
		if (selectedMembers.length > 0) {
			this.memberAction.emit({ members: selectedMembers, action: 'bulkDelete' });
		}
	}

	loadMoreMembers() {
		this.loadMore.emit(this.buildFilterSnapshot());
	}

	refreshMembers() {
		this.refresh.emit(this.buildFilterSnapshot());
	}

	onSortChange(sortState: Sort) {
		this.currentSortField.set(sortState.active as MeetRoomMemberSortField);
		this.currentSortOrder.set(sortState.direction as SortOrder);
		this.emitFilterChange();
	}

	// ===== FILTER METHODS =====

	triggerSearch() {
		this.emitFilterChange();
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

	private buildFilterSnapshot(): MemberTableFilter {
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
				nameCaseInsensitive: this.controls.nameCaseInsensitive.value
			},
			{ emitEvent: false }
		);
		this.filterState.set(this.filtersForm.getRawValue());
		this.emitFilterChange();
	}
}
