import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareRecordingDialogComponent } from './share-recording-dialog.component';

describe('ShareRecordingDialogComponent', () => {
	let component: ShareRecordingDialogComponent;
	let fixture: ComponentFixture<ShareRecordingDialogComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [ShareRecordingDialogComponent]
		}).compileComponents();

		fixture = TestBed.createComponent(ShareRecordingDialogComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
