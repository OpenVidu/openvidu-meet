import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomCreatorDisabledComponent } from './room-creator-disabled.component';

describe('RoomCreatorDisabledComponent', () => {
	let component: RoomCreatorDisabledComponent;
	let fixture: ComponentFixture<RoomCreatorDisabledComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [RoomCreatorDisabledComponent]
		}).compileComponents();

		fixture = TestBed.createComponent(RoomCreatorDisabledComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
