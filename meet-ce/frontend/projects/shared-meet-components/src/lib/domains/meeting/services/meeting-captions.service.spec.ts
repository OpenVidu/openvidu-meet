import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AiAssistantService } from '../../../shared/services/ai-assistant.service';
import { LoggerService } from '../../../shared/services/logger.service';
import { ParticipantService, type Room, type TextStreamReader } from '../openvidu-components';
import { MeetingCaptionsService } from './meeting-captions.service';

class LoggerServiceStub {
	get() {
		return { d: () => {}, w: () => {}, e: () => {} };
	}
}

type TranscriptionHandler = (reader: TextStreamReader, sender: { identity: string }) => Promise<void>;

const ASSISTANT_ID = 'AD_1';
const BOB = { identity: 'bob', name: 'Bob', colorProfile: 'rgb(255, 0, 0)' };

describe('MeetingCaptionsService', () => {
	let service: MeetingCaptionsService;
	let aiAssistantService: jasmine.SpyObj<AiAssistantService>;
	let room: jasmine.SpyObj<Room>;
	let handler: TranscriptionHandler | undefined;

	const transcribe = (text: string, { final = true, trackId = 'TR_bob', identity = BOB.identity } = {}) =>
		handler!(
			{
				readAll: async () => text,
				info: { attributes: { 'lk.transcription_final': String(final), 'lk.transcribed_track_id': trackId } }
			} as unknown as TextStreamReader,
			{ identity }
		);

	const texts = () => service.captions().map((caption) => caption.text);

	beforeEach(async () => {
		aiAssistantService = jasmine.createSpyObj<AiAssistantService>('AiAssistantService', [
			'createLiveCaptionsAssistant',
			'cancelAssistant'
		]);
		aiAssistantService.createLiveCaptionsAssistant.and.resolveTo({ id: ASSISTANT_ID, status: 'active' } as never);
		aiAssistantService.cancelAssistant.and.resolveTo();

		handler = undefined;
		room = jasmine.createSpyObj<Room>('Room', ['registerTextStreamHandler', 'unregisterTextStreamHandler']);
		room.registerTextStreamHandler.and.callFake((_topic, callback) => {
			handler = callback as TranscriptionHandler;
		});

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				MeetingCaptionsService,
				{ provide: LoggerService, useClass: LoggerServiceStub },
				{ provide: AiAssistantService, useValue: aiAssistantService },
				{
					provide: ParticipantService,
					useValue: {
						getParticipantByIdentity: (identity: string) => (identity === BOB.identity ? BOB : undefined)
					}
				}
			]
		});

		service = TestBed.inject(MeetingCaptionsService);
		service.initialize(room);
	});

	afterEach(() => service.destroy());

	it('starts the room assistant before listening for transcriptions', async () => {
		await service.enable();

		expect(aiAssistantService.createLiveCaptionsAssistant).toHaveBeenCalledTimes(1);
		expect(room.registerTextStreamHandler).toHaveBeenCalledOnceWith('lk.transcription', jasmine.any(Function));
		expect(service.areCaptionsEnabledByUser()).toBeTrue();
	});

	it('stays off when the server refuses to start the assistant', async () => {
		aiAssistantService.createLiveCaptionsAssistant.and.rejectWith(new Error('403'));

		await service.enable();

		expect(service.areCaptionsEnabledByUser()).toBeFalse();
		expect(room.registerTextStreamHandler).not.toHaveBeenCalled();
	});

	it('turns off and drops every caption before the server stops the assistant', async () => {
		let stopAssistant!: () => void;
		aiAssistantService.cancelAssistant.and.returnValue(new Promise<void>((resolve) => (stopAssistant = resolve)));
		await service.enable();
		await transcribe('hello');

		const disabled = service.disable();

		expect(service.areCaptionsEnabledByUser()).toBeFalse();
		expect(service.captions()).toEqual([]);
		expect(room.unregisterTextStreamHandler).toHaveBeenCalledOnceWith('lk.transcription');

		stopAssistant();
		await disabled;
		expect(aiAssistantService.cancelAssistant).toHaveBeenCalledOnceWith(ASSISTANT_ID);
	});

	it('shows what a participant says with their name and colour', async () => {
		await service.enable();

		await transcribe('hello everyone');

		expect(service.captions()).toEqual([
			jasmine.objectContaining({
				participantIdentity: 'bob',
				participantName: 'Bob',
				participantColor: 'rgb(255, 0, 0)',
				text: 'hello everyone',
				isFinal: true
			})
		]);
	});

	it('updates a caption being transcribed in place until its final text arrives', async () => {
		await service.enable();

		await transcribe('hel', { final: false });
		const [interim] = service.captions();
		await transcribe('hello wor', { final: false });
		await transcribe('hello world');

		expect(service.captions()).toEqual([
			jasmine.objectContaining({ id: interim.id, text: 'hello world', isFinal: true })
		]);
	});

	it('keeps a separate caption per transcribed track', async () => {
		await service.enable();

		await transcribe('from the microphone', { final: false, trackId: 'TR_mic' });
		await transcribe('from the shared tab', { final: false, trackId: 'TR_screen' });

		expect(texts()).toEqual(['from the microphone', 'from the shared tab']);
	});

	it('keeps only the three most recent captions', async () => {
		await service.enable();

		for (const text of ['one', 'two', 'three', 'four']) {
			await transcribe(text);
		}

		expect(texts()).toEqual(['two', 'three', 'four']);
	});

	it('ignores blank transcriptions and speakers the meeting does not know', async () => {
		await service.enable();

		await transcribe('   ');
		await transcribe('who is this', { identity: 'ghost' });

		expect(service.captions()).toEqual([]);
	});

	describe('lifetime', () => {
		beforeEach(() => jasmine.clock().install());
		afterEach(() => jasmine.clock().uninstall());

		it('removes a final caption 5 seconds after it arrives', async () => {
			await service.enable();
			await transcribe('final');

			jasmine.clock().tick(4999);
			expect(texts()).toEqual(['final']);

			jasmine.clock().tick(1);
			expect(texts()).toEqual([]);
		});

		it('removes an unfinished caption 3 seconds after its last update', async () => {
			await service.enable();
			await transcribe('still', { final: false });

			jasmine.clock().tick(2000);
			await transcribe('still talking', { final: false });
			jasmine.clock().tick(2999);
			expect(texts()).toEqual(['still talking']);

			jasmine.clock().tick(1);
			expect(texts()).toEqual([]);
		});

		it('gives a caption the final lifetime once its final text arrives', async () => {
			await service.enable();
			await transcribe('almost', { final: false });

			jasmine.clock().tick(2000);
			await transcribe('almost done');
			jasmine.clock().tick(4999);
			expect(texts()).toEqual(['almost done']);

			jasmine.clock().tick(1);
			expect(texts()).toEqual([]);
		});
	});
});
