import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MeetingToolbarMoreOptionsMenuComponent } from './meeting-toolbar-more-options-menu.component';

describe('MeetingToolbarMoreOptionsButtonsComponent', () => {
  let component: MeetingToolbarMoreOptionsMenuComponent;
  let fixture: ComponentFixture<MeetingToolbarMoreOptionsMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MeetingToolbarMoreOptionsMenuComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MeetingToolbarMoreOptionsMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
