import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetingSettingsPanelComponent } from './meeting-settings-panel.component';

describe('MeetingSettingsPanelComponent', () => {
  let component: MeetingSettingsPanelComponent;
  let fixture: ComponentFixture<MeetingSettingsPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetingSettingsPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetingSettingsPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
