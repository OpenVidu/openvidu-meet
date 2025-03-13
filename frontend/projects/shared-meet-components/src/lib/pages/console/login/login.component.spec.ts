import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsoleLoginComponent } from './login.component';

describe('ConsoleLoginComponent', () => {
	let component: ConsoleLoginComponent;
	let fixture: ComponentFixture<ConsoleLoginComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ConsoleLoginComponent]
		}).compileComponents();

		fixture = TestBed.createComponent(ConsoleLoginComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
