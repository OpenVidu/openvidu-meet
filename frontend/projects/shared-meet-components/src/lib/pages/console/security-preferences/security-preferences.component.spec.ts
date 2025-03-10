import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SecurityPreferencesComponent } from './security-preferences.component';

describe('SecurityPreferencesComponent', () => {
  let component: SecurityPreferencesComponent;
  let fixture: ComponentFixture<SecurityPreferencesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SecurityPreferencesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SecurityPreferencesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
