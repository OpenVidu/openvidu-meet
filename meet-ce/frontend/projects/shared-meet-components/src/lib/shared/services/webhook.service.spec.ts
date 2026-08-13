import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MeetWebhook, MeetWebhookEventType } from '@openvidu-meet/typings';
import { HttpService } from './http.service';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
	let service: WebhookService;
	let httpService: {
		getRequest: jasmine.Spy;
		postRequest: jasmine.Spy;
		putRequest: jasmine.Spy;
		deleteRequest: jasmine.Spy;
	};

	const webhook: MeetWebhook = {
		webhookId: 'wh-123',
		url: 'https://example.com/hook',
		enabled: true,
		creationDate: 1700000000000
	};

	beforeEach(() => {
		httpService = {
			getRequest: jasmine.createSpy('getRequest'),
			postRequest: jasmine.createSpy('postRequest'),
			putRequest: jasmine.createSpy('putRequest'),
			deleteRequest: jasmine.createSpy('deleteRequest')
		};

		TestBed.configureTestingModule({
			providers: [
				provideZonelessChangeDetection(),
				WebhookService,
				{ provide: HttpService, useValue: httpService as unknown as HttpService }
			]
		});

		service = TestBed.inject(WebhookService);
	});

	it('should list webhooks from the public resource and unwrap the collection envelope', async () => {
		httpService.getRequest.and.resolveTo({ webhooks: [webhook] });

		const webhooks = await service.getWebhooks();

		expect(httpService.getRequest).toHaveBeenCalledWith('api/v1/webhooks');
		expect(webhooks).toEqual([webhook]);
	});

	it('should create a webhook posting its options untouched', async () => {
		httpService.postRequest.and.resolveTo(webhook);
		const options = {
			url: 'https://example.com/hook',
			events: [MeetWebhookEventType.MEETING_STARTED],
			roomId: 'room-1',
			enabled: false
		};

		const created = await service.createWebhook(options);

		expect(httpService.postRequest).toHaveBeenCalledWith('api/v1/webhooks', options);
		expect(created).toEqual(webhook);
	});

	it('should update a webhook through its id', async () => {
		httpService.putRequest.and.resolveTo(webhook);

		await service.updateWebhook('wh-123', { url: 'https://example.com/hook', enabled: true });

		expect(httpService.putRequest).toHaveBeenCalledWith('api/v1/webhooks/wh-123', {
			url: 'https://example.com/hook',
			enabled: true
		});
	});

	it('should delete a webhook through its id', async () => {
		httpService.deleteRequest.and.resolveTo(undefined);

		await service.deleteWebhook('wh-123');

		expect(httpService.deleteRequest).toHaveBeenCalledWith('api/v1/webhooks/wh-123');
	});

	it('should trigger the stored-URL test of a webhook', async () => {
		httpService.postRequest.and.resolveTo(undefined);

		await service.testWebhook('wh-123');

		expect(httpService.postRequest).toHaveBeenCalledWith('api/v1/webhooks/wh-123/test');
	});
});
