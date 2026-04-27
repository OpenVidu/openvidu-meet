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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { MeetRoomMember, MeetRoomMemberSortField, SortOrder } from '@openvidu-meet/typings';
import { setsAreEqual } from '../../../../shared/utils/array.utils';
import { RoomMemberUiUtils } from '../../utils/ui';

export interface MemberTableAction {
	members: MeetRoomMember[];
	action: 'addMember' | 'edit' | 'copyLink' | 'delete' | 'bulkDelete';
}

export interface MemberTableFilter {
	nameFilter: string;
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
		MatTooltipModule,
		MatProgressSpinnerModule,
		MatToolbarModule,
		MatBadgeModule,
		MatDividerModule,
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
	showFilters = input(false);
	showSelection = input(true);
	showLoadMore = input(false);
	loading = input(false);
	canViewUserProfiles = input(true);
	initialFilters = input<MemberTableFilter>({
		nameFilter: '',
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
	nameFilterControl = new FormControl<string>('', { nonNullable: true });

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
		this.nameFilterControl.setValue(this.initialFilters().nameFilter);
		this.currentSortField.set(this.initialFilters().sortField);
		this.currentSortOrder.set(this.initialFilters().sortOrder);

		this.nameFilterControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
			if (!value) {
				this.emitFilterChange();
			}
		});
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
		const nameFilter = this.nameFilterControl.value;
		this.loadMore.emit({
			nameFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	refreshMembers() {
		const nameFilter = this.nameFilterControl.value;
		this.refresh.emit({
			nameFilter,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
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

	private emitFilterChange() {
		this.filterChange.emit({
			nameFilter: this.nameFilterControl.value,
			sortField: this.currentSortField(),
			sortOrder: this.currentSortOrder()
		});
	}

	hasActiveFilters(): boolean {
		return !!this.nameFilterControl.value;
	}

	clearFilters() {
		this.nameFilterControl.setValue('');
	}
}
