import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LogoSelectorComponent } from './logo-selector.component';

describe('LogoSelectorComponent', () => {
  let component: LogoSelectorComponent;
  let fixture: ComponentFixture<LogoSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoSelectorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LogoSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
