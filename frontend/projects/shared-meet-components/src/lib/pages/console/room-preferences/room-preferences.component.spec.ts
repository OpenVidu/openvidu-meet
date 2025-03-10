import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomPreferencesComponent } from './room-preferences.component';

describe('RoomConfigComponent', () => {
  let component: RoomPreferencesComponent;
  let fixture: ComponentFixture<RoomPreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPreferencesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
