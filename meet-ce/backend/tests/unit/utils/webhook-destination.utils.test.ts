import { afterEach, describe, expect, it } from '@jest/globals';
import { MEET_ENV } from '../../../src/environment.js';
import { OpenViduMeetError } from '../../../src/models/error.model.js';
import {
	assertWebhookDestinationAllowed,
	forbiddenWebhookAddressReason
} from '../../../src/utils/webhook-destination.utils.js';

const rejection = async (url: string): Promise<OpenViduMeetError | undefined> => {
	try {
		await assertWebhookDestinationAllowed(url);
		return undefined;
	} catch (error) {
		return error as OpenViduMeetError;
	}
};

describe('webhook destination policy', () => {
	afterEach(() => {
		MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'true';
	});

	it.each([
		'169.254.169.254',
		'169.254.0.1',
		'0.0.0.0',
		'224.0.0.1',
		'255.255.255.255',
		'::',
		'fe80::1',
		'ff02::1',
		'::ffff:169.254.169.254'
	])('never lets a webhook be delivered to %s', (address) => {
		expect(forbiddenWebhookAddressReason(address)).toBeDefined();
		MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
		expect(forbiddenWebhookAddressReason(address)).toBeDefined();
	});

	it.each(['127.0.0.1', '10.0.0.1', '172.18.0.5', '192.168.1.10', '::1', 'fd00::1', '::ffff:10.0.0.1'])(
		'allows the private address %s only while private networks are allowed',
		(address) => {
			expect(forbiddenWebhookAddressReason(address)).toBeUndefined();
			MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
			expect(forbiddenWebhookAddressReason(address)).toBeDefined();
		}
	);

	it.each(['93.184.216.34', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946'])(
		'allows the public address %s regardless of the setting',
		(address) => {
			expect(forbiddenWebhookAddressReason(address)).toBeUndefined();
			MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
			expect(forbiddenWebhookAddressReason(address)).toBeUndefined();
		}
	);

	describe('assertWebhookDestinationAllowed', () => {
		it('rejects a URL whose literal host is forbidden with a 400 that names the URL', async () => {
			const error = await rejection('http://169.254.169.254/latest/meta-data/');

			expect(error).toBeInstanceOf(OpenViduMeetError);
			expect(error?.statusCode).toBe(400);
			expect(error?.message).toContain('http://169.254.169.254/latest/meta-data/');
		});

		it('rejects an IPv6 literal the same way', async () => {
			expect((await rejection('http://[fe80::1]:8080/hook'))?.statusCode).toBe(400);
		});

		it('resolves a hostname before judging where it points', async () => {
			expect(await rejection('http://localhost:5080/hook')).toBeUndefined();
			MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS = 'false';
			expect((await rejection('http://localhost:5080/hook'))?.statusCode).toBe(400);
		});

		it('lets a host it cannot resolve through, to fail at delivery as it always did', async () => {
			expect(await rejection('http://no-such-host.invalid/hook')).toBeUndefined();
		});
	});
});
