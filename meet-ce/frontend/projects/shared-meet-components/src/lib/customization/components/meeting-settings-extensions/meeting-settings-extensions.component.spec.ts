import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetingSettingsExtensionsComponent } from './meeting-settings-extensions.component';

describe('MeetingSettingsPanelComponent', () => {
  let component: MeetingSettingsExtensionsComponent;
  let fixture: ComponentFixture<MeetingSettingsExtensionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetingSettingsExtensionsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetingSettingsExtensionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
