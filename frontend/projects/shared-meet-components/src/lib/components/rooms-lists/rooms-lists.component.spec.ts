import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { RoomsListsComponent } from './rooms-lists.component';
import { MeetRoom } from '../../typings/ce';

describe('RoomsListsComponent', () => {
	let component: RoomsListsComponent;
	let fixture: ComponentFixture<RoomsListsComponent>;

	const mockRooms: MeetRoom[] = [
		{
			roomId: 'test-room-1',
			creationDate: 1642248000000, // 2024-01-15T10:00:00Z
			markedForDeletion: false,
			autoDeletionDate: undefined,
			roomIdPrefix: 'test',
			moderatorRoomUrl: 'http://localhost/room/test-room-1?secret=mod-123',
			speakerRoomUrl: 'http://localhost/room/test-room-1?secret=pub-123',
			preferences: {
				chatPreferences: { enabled: true },
				recordingPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: true }
			}
		},
		{
			roomId: 'test-room-2',
			creationDate: 1642334400000, // 2024-01-16T14:30:00Z
			markedForDeletion: true,
			autoDeletionDate: 1643673600000, // 2024-02-01T00:00:00Z
			roomIdPrefix: 'test',
			moderatorRoomUrl: 'http://localhost/room/test-room-2?secret=mod-456',
			speakerRoomUrl: 'http://localhost/room/test-room-2?secret=pub-456',
			preferences: {
				chatPreferences: { enabled: true },
				recordingPreferences: { enabled: false },
				virtualBackgroundPreferences: { enabled: true }
			}
		}
	];

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [RoomsListsComponent, NoopAnimationsModule, MatSnackBarModule]
		}).compileComponents();

		fixture = TestBed.createComponent(RoomsListsComponent);
		component = fixture.componentInstance;

		// Set up test data
		component.rooms = mockRooms;
		component.loading = false;
		component.canDeleteRooms = true;

		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should initialize with correct default values', () => {
		expect(component.rooms).toEqual(mockRooms);
		expect(component.canDeleteRooms).toBe(true);
		expect(component.loading).toBe(false);
		expect(component.showFilters).toBe(false);
		expect(component.showSelection).toBe(true);
		expect(component.emptyMessage).toBe('No rooms found');
	});

	it('should update displayed columns based on showSelection', () => {
		component.showSelection = false;
		component.ngOnInit();
		expect(component.displayedColumns).not.toContain('select');

		component.showSelection = true;
		component.ngOnInit();
		expect(component.displayedColumns).toContain('select');
	});

	it('should determine room status correctly', () => {
		expect(component.isRoomActive(mockRooms[0])).toBe(true);
		expect(component.isRoomActive(mockRooms[1])).toBe(false);
		expect(component.isRoomInactive(mockRooms[0])).toBe(false);
		expect(component.isRoomInactive(mockRooms[1])).toBe(true);
	});

	it('should return correct status information', () => {
		expect(component.getRoomStatus(mockRooms[0])).toBe('Active');
		expect(component.getRoomStatus(mockRooms[1])).toBe('Inactive');

		expect(component.getStatusIcon(mockRooms[0])).toBe('check_circle');
		expect(component.getStatusIcon(mockRooms[1])).toBe('delete_outline');

		expect(component.getStatusColor(mockRooms[0])).toBe('var(--ov-meet-color-success)');
		expect(component.getStatusColor(mockRooms[1])).toBe('var(--ov-meet-color-error)');
	});

	it('should handle auto-deletion information correctly', () => {
		expect(component.hasAutoDeletion(mockRooms[0])).toBe(false);
		expect(component.hasAutoDeletion(mockRooms[1])).toBe(true);

		expect(component.getAutoDeletionStatus(mockRooms[0])).toBe('Not scheduled');
		expect(component.getAutoDeletionStatus(mockRooms[1])).toBe('Scheduled');

		expect(component.getAutoDeletionIcon(mockRooms[0])).toBe('close');
		expect(component.getAutoDeletionIcon(mockRooms[1])).toBe('auto_delete');
	});

	it('should handle room selection correctly', () => {
		const room = mockRooms[0];

		expect(component.isRoomSelected(room)).toBe(false);

		component.toggleRoomSelection(room);
		expect(component.isRoomSelected(room)).toBe(true);

		component.toggleRoomSelection(room);
		expect(component.isRoomSelected(room)).toBe(false);
	});

	it('should determine if room can be selected', () => {
		expect(component.canSelectRoom(mockRooms[0])).toBe(true); // Active room
		expect(component.canSelectRoom(mockRooms[1])).toBe(false); // Marked for deletion
	});

	it('should determine room permissions correctly', () => {
		expect(component.canOpenRoom(mockRooms[0])).toBe(true);
		expect(component.canOpenRoom(mockRooms[1])).toBe(false);

		expect(component.canEditRoom(mockRooms[0])).toBe(true);
		expect(component.canEditRoom(mockRooms[1])).toBe(false);

		expect(component.canDeleteRoom(mockRooms[0])).toBe(true);
		expect(component.canDeleteRoom(mockRooms[1])).toBe(false);
	});

	it('should emit room actions correctly', () => {
		spyOn(component.roomAction, 'emit');

		component.openRoom(mockRooms[0]);
		expect(component.roomAction.emit).toHaveBeenCalledWith({
			rooms: [mockRooms[0]],
			action: 'open'
		});

		component.deleteRoom(mockRooms[0]);
		expect(component.roomAction.emit).toHaveBeenCalledWith({
			rooms: [mockRooms[0]],
			action: 'delete'
		});

		component.viewSettings(mockRooms[0]);
		expect(component.roomAction.emit).toHaveBeenCalledWith({
			rooms: [mockRooms[0]],
			action: 'settings'
		});
	});

	it('should handle batch delete correctly', () => {
		spyOn(component.roomAction, 'emit');

		// Select some rooms
		component.toggleRoomSelection(mockRooms[0]);
		component.bulkDeleteSelected();

		expect(component.roomAction.emit).toHaveBeenCalledWith({
			rooms: [mockRooms[0]],
			action: 'bulkDelete'
		});
	});

	it('should emit filter changes', () => {
		spyOn(component.filterChange, 'emit');

		component.nameFilterControl.setValue('test');

		// Trigger change detection to simulate the valueChanges observable
		fixture.detectChanges();

		// The filter change should be emitted through the form control subscription
		expect(component.filterChange.emit).toHaveBeenCalled();
	});

	it('should show empty state when no rooms', () => {
		component.rooms = [];
		fixture.detectChanges();

		const emptyState = fixture.nativeElement.querySelector('.no-rooms-state');
		expect(emptyState).toBeTruthy();
	});

	it('should show loading state', () => {
		component.loading = true;
		fixture.detectChanges();

		const loadingContainer = fixture.nativeElement.querySelector('.loading-container');
		expect(loadingContainer).toBeTruthy();
	});

	it('should clear selection correctly', () => {
		// Select a room first
		component.toggleRoomSelection(mockRooms[0]);
		expect(component.selectedRooms().size).toBe(1);

		// Clear selection
		component.clearSelection();
		expect(component.selectedRooms().size).toBe(0);
	});

	it('should get selected rooms correctly', () => {
		component.toggleRoomSelection(mockRooms[0]);
		const selectedRooms = component.getSelectedRooms();

		expect(selectedRooms).toEqual([mockRooms[0]]);
	});
});
