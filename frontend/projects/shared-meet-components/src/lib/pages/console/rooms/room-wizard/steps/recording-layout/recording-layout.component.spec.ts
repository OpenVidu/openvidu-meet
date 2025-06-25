import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingLayoutComponent } from './recording-layout.component';

describe('RecordingLayoutComponent', () => {
  let component: RecordingLayoutComponent;
  let fixture: ComponentFixture<RecordingLayoutComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingLayoutComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
