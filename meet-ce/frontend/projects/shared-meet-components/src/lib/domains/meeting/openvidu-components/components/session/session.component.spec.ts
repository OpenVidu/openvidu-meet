import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { ActionService } from '../../services/action/action.service';

import { ChatService } from '../../services/chat/chat.service';
import { ChatServiceMock } from '../../services/chat/chat.service.mock';

import { LoggerService } from '../../services/logger/logger.service';
import { LoggerServiceMock } from '../../services/logger/logger.service.mock';
// import { ParticipantService } from '../../services/participant/participant.service';
// import { ParticipantServiceMock } from '../../services/participant/participant.service.mock';
import { PlatformService } from '../../services/platform/platform.service';
import { PlatformServiceMock } from '../../services/platform/platform.service.mock';

import { TranslatePipe } from '../../pipes/translate.pipe';
import { OPENVIDU_COMPONENTS_CONFIG } from '../../config/openvidu-components-angular.config';
import { Room, RoomEvent } from '../../services/livekit-adapter';
import { TranslateService } from '../../services/translate/translate.service';
import { TranslateServiceMock } from '../../services/translate/translate.service.mock';
import { SessionComponent } from './session.component';

class ActionServiceMock {
	openConnectionDialog() {}
	closeConnectionDialog() {}
}

describe('SessionComponent', () => {
	let component: SessionComponent;
	let fixture: ComponentFixture<SessionComponent>;
	let actionService: ActionService;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [SessionComponent],
			imports: [MatProgressSpinnerModule, NoopAnimationsModule, TranslatePipe],
			providers: [
				{ provide: LoggerService, useClass: LoggerServiceMock },
				{ provide: ActionService, useClass: ActionServiceMock },
				// { provide: ParticipantService, useClass: ParticipantServiceMock },
				{ provide: ChatService, useClass: ChatServiceMock },
				{ provide: PlatformService, useClass: PlatformServiceMock },
				{ provide: TranslateService, useClass: TranslateServiceMock },
				{ provide: OPENVIDU_COMPONENTS_CONFIG, useValue: { production: false } }
			]
		}).compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(SessionComponent);
		component = fixture.componentInstance;
		actionService = TestBed.inject(ActionService);

		// Espías para verificar las llamadas a los métodos de diálogo
		spyOn(actionService, 'openConnectionDialog').and.callThrough();
		spyOn(actionService, 'closeConnectionDialog').and.callThrough();

		component.room = {
			on: jasmine.createSpy('on').and.callFake((event: RoomEvent, callback: () => void) => {
				// Guarda los callbacks para invocarlos manualmente
				const room = component.room as Room & {
					reconnectingCallback?: () => void;
					reconnectedCallback?: () => void;
				};
				if (event === RoomEvent.Reconnecting) {
					room.reconnectingCallback = callback;
				}
				if (event === RoomEvent.Reconnected) {
					room.reconnectedCallback = callback;
				}
				return component.room;
			}),
			removeAllListeners: jasmine.createSpy('removeAllListeners')
		} as unknown as Room & {
			reconnectingCallback?: () => void;
			reconnectedCallback?: () => void;
		};

		component['subscribeToReconnection']();

		fixture.detectChanges();
	});

	function emitReconnectingEvent() {
		(component.room as Room & { reconnectingCallback?: () => void }).reconnectingCallback?.();
	}

	function emitReconnectedEvent() {
		(component.room as Room & { reconnectedCallback?: () => void }).reconnectedCallback?.();
	}

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should open the connection dialog', () => {
		emitReconnectingEvent();
		// Verifica que se haya abierto el diálogo
		expect(actionService.openConnectionDialog).toHaveBeenCalledTimes(1);
	});

	it('should close the connection dialog', () => {
		emitReconnectingEvent();
		emitReconnectedEvent();
		expect(actionService.closeConnectionDialog).toHaveBeenCalledTimes(1);
	});
});
