import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoggerService } from '../../../../../shared/services/logger.service';
import { DialogService } from '../../../../../shared/services/dialog.service';
import { MeetingUiConfigService } from '../../services/config/meeting-ui-config.service';
import { DeviceService } from '../../services/device/device.service';
import { SmartLayoutService } from '../../services/layout/smart-layout.service';
import { LocalMediaIntentService } from '../../services/local-media-intent/local-media-intent.service';
import { LocalTrackService } from '../../services/local-track/local-track.service';
import { MeetingEndingSoonService } from '../../services/meeting-ending-soon/meeting-ending-soon.service';
import { MeetingEventsService } from '../../services/meeting-events/meeting-events.service';
import { MeetingLiveKitService } from '../../services/meeting-livekit/meeting-livekit.service';
import { PanelService } from '../../services/panel/panel.service';
import { ParticipantService } from '../../services/participant/participant.service';
import { RecordingService } from '../../services/recording/recording.service';
import { MediaStorageService } from '../../services/storage/storage.service';
import { MeetingTranslateService } from '../../services/translate/meeting-translate.service';
import { ViewportService } from '../../services/viewport/viewport.service';
import { VirtualBackgroundService } from '../../services/virtual-background/virtual-background.service';
import { MeetingViewComponent } from './meeting-view.component';

class LoggerServiceStub {
	get() {
		return { d: () => {}, v: () => {}, w: () => {}, e: () => {} };
	}
}

/** Lets every continuation chained onto a settled promise run before the expectations read it. */
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

/** A token the participant has committed to but that has not been minted yet. */
class DeferredToken {
	private settle!: (token: string) => void;
	private fail!: (error: unknown) => void;
	readonly promise = new Promise<string>((resolve, reject) => {
		this.settle = resolve;
		this.fail = reject;
	});

	resolve(token = 'minted-token'): Promise<void> {
		this.settle(token);
		return flush();
	}

	reject(error: unknown = new Error('mint failed')): Promise<void> {
		this.fail(error);
		return flush();
	}
}

/**
 * The phase machine of the meeting view, which owns when the join token is minted. Minting reserves
 * the participant name, checks the meeting's capacity and creates the LiveKit room, so it must
 * happen exactly once and only for a join the participant is still around to complete.
 */
describe('MeetingViewComponent', () => {
	let fixture: ComponentFixture<MeetingViewComponent>;
	let component: MeetingViewComponent;
	let showPrejoin: ReturnType<typeof signal<boolean>>;
	let meetingLiveKitService: jasmine.SpyObj<MeetingLiveKitService>;
	let participantService: jasmine.SpyObj<ParticipantService>;
	let dialogService: jasmine.SpyObj<DialogService>;
	let tokenProvider: jasmine.Spy<() => Promise<string>>;

	/** Runs the device initialization the view waits on before it decides its first phase. */
	async function startView(): Promise<void> {
		fixture.detectChanges();
		await flush();
	}

	beforeEach(async () => {
		showPrejoin = signal(true);
		tokenProvider = jasmine.createSpy('tokenProvider').and.resolveTo('minted-token');

		meetingLiveKitService = jasmine.createSpyObj<MeetingLiveKitService>('MeetingLiveKitService', [
			'init',
			'initializeAndSetToken',
			'getRoom',
			'getRoomName',
			'teardown',
			'disconnect'
		]);
		meetingLiveKitService.getRoom.and.returnValue({} as never);
		meetingLiveKitService.getRoomName.and.returnValue('room-1');
		meetingLiveKitService.teardown.and.resolveTo();
		meetingLiveKitService.disconnect.and.resolveTo();

		participantService = jasmine.createSpyObj<ParticipantService>('ParticipantService', [
			'connect',
			'clear',
			'localParticipant',
			'getMyName',
			'getMyIdentity'
		]);
		participantService.connect.and.resolveTo();
		participantService.localParticipant.and.returnValue(undefined);

		dialogService = jasmine.createSpyObj<DialogService>('DialogService', ['showDialog', 'showBlockingDialog']);

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: MeetingLiveKitService, useValue: meetingLiveKitService },
				{ provide: ParticipantService, useValue: participantService },
				{ provide: DialogService, useValue: dialogService },
				{
					provide: MeetingUiConfigService,
					useValue: {
						showPrejoin: () => showPrejoin(),
						getLivekitUrl: () => 'wss://lk.test',
						getCurrentParticipantName: () => 'Alice',
						tokenErrorSignal: signal(undefined),
						activitiesPanelButtonSignal: signal(true),
						participantsPanelButtonSignal: signal(true),
						backgroundEffectsButtonSignal: signal(true),
						showBackgroundEffectsButton: signal(true)
					} as unknown as MeetingUiConfigService
				},
				{
					provide: DeviceService,
					useValue: {
						initializeDevices: () => Promise.resolve(),
						clear: () => {}
					} as unknown as DeviceService
				},
				{
					provide: MediaStorageService,
					useValue: {
						getParticipantName: () => 'Alice',
						setParticipantName: () => {}
					} as unknown as MediaStorageService
				},
				{
					provide: LocalMediaIntentService,
					useValue: { reset: () => {} } as unknown as LocalMediaIntentService
				},
				{
					provide: LocalTrackService,
					useValue: { removeLocalTracks: () => {} } as unknown as LocalTrackService
				},
				{ provide: MeetingEventsService, useValue: { bindRoom: () => {} } as unknown as MeetingEventsService },
				{
					provide: MeetingTranslateService,
					useValue: { translate: (key: string) => key } as unknown as MeetingTranslateService
				},
				{
					provide: PanelService,
					useValue: {
						closePanel: () => {},
						togglePanel: () => {},
						isActivitiesPanelOpened: () => false,
						isBackgroundEffectsPanelOpened: () => false
					} as unknown as PanelService
				},
				{
					provide: VirtualBackgroundService,
					useValue: {
						isBackgroundApplied: () => false,
						applyBackgroundFromStorage: () => Promise.resolve(),
						removeBackground: () => Promise.resolve()
					} as unknown as VirtualBackgroundService
				},
				{
					provide: MeetingEndingSoonService,
					useValue: { remainingMs: signal(undefined) } as unknown as MeetingEndingSoonService
				},
				{
					provide: SmartLayoutService,
					useValue: { railHiddenParticipants: signal(undefined) } as unknown as SmartLayoutService
				},
				{
					provide: RecordingService,
					useValue: { recordingStatus: signal({ status: 'stopped' }) } as unknown as RecordingService
				},
				{
					provide: ViewportService,
					useValue: { shouldShowLandscapeWarning: () => false } as unknown as ViewportService
				}
			]
		});

		// The live stage is not what is under test here, and rendering it would pull in the whole
		// component tree (toolbar, panels, layout, LiveKit-backed streams).
		TestBed.overrideComponent(MeetingViewComponent, { set: { template: '', imports: [], styles: [] } });

		fixture = TestBed.createComponent(MeetingViewComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('tokenProvider', tokenProvider);
	});

	describe('reaching the join', () => {
		it('waits in the prejoin without minting anything', async () => {
			await startView();

			expect(component.phase()).toBe('prejoin');
			expect(tokenProvider).not.toHaveBeenCalled();
		});

		it('joins straight away when the consumer asks for no prejoin', async () => {
			showPrejoin.set(false);

			await startView();

			expect(tokenProvider).toHaveBeenCalledTimes(1);
			expect(component.phase()).toBe('live');
		});

		it('mints the token when the participant clicks join', async () => {
			await startView();

			component._onReadyToJoin();
			await flush();

			expect(tokenProvider).toHaveBeenCalledTimes(1);
			expect(meetingLiveKitService.initializeAndSetToken).toHaveBeenCalledWith('minted-token', 'wss://lk.test');
			expect(component.phase()).toBe('live');
		});
	});

	describe('a join committed to twice', () => {
		it('mints once when the join button is clicked again before the view catches up', async () => {
			const mint = new DeferredToken();
			tokenProvider.and.returnValue(mint.promise);
			await startView();

			component._onReadyToJoin();
			component._onReadyToJoin();
			await mint.resolve();

			expect(tokenProvider).toHaveBeenCalledTimes(1);
			expect(participantService.connect).toHaveBeenCalledTimes(1);
		});

		it('mints once when the join is repeated after it went live', async () => {
			await startView();
			component._onReadyToJoin();
			await flush();
			expect(component.phase()).toBe('live');

			component._onReadyToJoin();
			await flush();

			expect(tokenProvider).toHaveBeenCalledTimes(1);
		});
	});

	describe('a participant who leaves while the token is in flight', () => {
		it('does not connect the meeting they walked out of', async () => {
			const mint = new DeferredToken();
			tokenProvider.and.returnValue(mint.promise);
			await startView();
			component._onReadyToJoin();

			fixture.destroy();
			await mint.resolve();

			expect(meetingLiveKitService.initializeAndSetToken).not.toHaveBeenCalled();
			expect(participantService.connect).not.toHaveBeenCalled();
		});

		it('does not report a failed mint to a view that is already gone', async () => {
			const mint = new DeferredToken();
			tokenProvider.and.returnValue(mint.promise);
			await startView();
			component._onReadyToJoin();

			fixture.destroy();
			await mint.reject();

			expect(dialogService.showDialog).not.toHaveBeenCalled();
		});
	});

	describe('a mint that fails', () => {
		it('reports it and joins nothing', async () => {
			const mint = new DeferredToken();
			tokenProvider.and.returnValue(mint.promise);
			await startView();

			component._onReadyToJoin();
			await mint.reject();

			expect(dialogService.showDialog).toHaveBeenCalled();
			expect(participantService.connect).not.toHaveBeenCalled();
		});
	});
});
