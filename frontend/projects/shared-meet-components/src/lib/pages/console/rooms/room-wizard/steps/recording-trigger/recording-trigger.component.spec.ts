import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingTriggerComponent } from './recording-trigger.component';

describe('RecordingTriggerComponent', () => {
  let component: RecordingTriggerComponent;
  let fixture: ComponentFixture<RecordingTriggerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingTriggerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingTriggerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
