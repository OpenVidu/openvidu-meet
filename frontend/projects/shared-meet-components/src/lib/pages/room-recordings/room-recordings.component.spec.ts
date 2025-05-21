import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RoomRecordingsComponent } from './room-recordings.component';

describe('RoomRecordingsComponent', () => {
	let component: RoomRecordingsComponent;
	let fixture: ComponentFixture<RoomRecordingsComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [RoomRecordingsComponent]
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(RoomRecordingsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
