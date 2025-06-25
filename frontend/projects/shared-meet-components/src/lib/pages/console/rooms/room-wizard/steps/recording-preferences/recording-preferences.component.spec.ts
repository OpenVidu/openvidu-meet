import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingPreferencesComponent } from './recording-preferences.component';

describe('RecordingPreferencesComponent', () => {
  let component: RecordingPreferencesComponent;
  let fixture: ComponentFixture<RecordingPreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingPreferencesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
