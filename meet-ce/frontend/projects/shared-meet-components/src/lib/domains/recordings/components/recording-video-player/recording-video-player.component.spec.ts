import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingVideoPlayerComponent } from './recording-video-player.component';

describe('RecordingVideoPlayerComponent', () => {
  let component: RecordingVideoPlayerComponent;
  let fixture: ComponentFixture<RecordingVideoPlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingVideoPlayerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingVideoPlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
