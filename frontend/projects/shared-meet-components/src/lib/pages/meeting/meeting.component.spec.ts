import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MeetingComponent } from './meeting.component';

describe('CallComponent', () => {
	let component: MeetingComponent;
	let fixture: ComponentFixture<MeetingComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
    imports: [MeetingComponent]
}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(MeetingComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
