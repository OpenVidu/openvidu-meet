import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RecordingVideoPlayerComponent } from './recording-video-player.component';

describe('RecordingVideoPlayerComponent', () => {
  let component: RecordingVideoPlayerComponent;
  let fixture: ComponentFixture<RecordingVideoPlayerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordingVideoPlayerComponent],
      providers: [provideZonelessChangeDetection()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RecordingVideoPlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('opens no context menu on the video', () => {
    fixture.componentRef.setInput('recordingUrl', 'recording.mp4');
    fixture.detectChanges();

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('video').dispatchEvent(event);

    expect(event.defaultPrevented).toBeTrue();
  });
});
