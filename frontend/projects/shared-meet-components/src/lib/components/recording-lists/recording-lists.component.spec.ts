import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingListsComponent } from './recording-lists.component';

describe('RecordingListsComponent', () => {
  let component: RecordingListsComponent;
  let fixture: ComponentFixture<RecordingListsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingListsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingListsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
