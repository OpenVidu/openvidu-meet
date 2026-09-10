import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';
import { MEET_ENV } from '../environment.js';
import { errorWebhookDestinationNotAllowed } from '../models/error.model.js';

// No webhook receiver can live here: unspecified, link-local (the cloud metadata endpoint among them), multicast, broadcast
const undeliverable = new BlockList();
undeliverable.addSubnet('0.0.0.0', 8, 'ipv4');
undeliverable.addSubnet('169.254.0.0', 16, 'ipv4');
undeliverable.addSubnet('224.0.0.0', 4, 'ipv4');
undeliverable.addAddress('255.255.255.255', 'ipv4');
undeliverable.addAddress('::', 'ipv6');
undeliverable.addSubnet('fe80::', 10, 'ipv6');
undeliverable.addSubnet('ff00::', 8, 'ipv6');

// Loopback, RFC 1918 and unique-local: where the backend of a self-hosted deployment usually lives
const privateNetworks = new BlockList();
privateNetworks.addSubnet('127.0.0.0', 8, 'ipv4');
privateNetworks.addSubnet('10.0.0.0', 8, 'ipv4');
privateNetworks.addSubnet('172.16.0.0', 12, 'ipv4');
privateNetworks.addSubnet('192.168.0.0', 16, 'ipv4');
privateNetworks.addAddress('::1', 'ipv6');
privateNetworks.addSubnet('fc00::', 7, 'ipv6');

const IPV4_MAPPED_PREFIX = '::ffff:';

const canonical = (address: string): { ip: string; family: 'ipv4' | 'ipv6' } => {
	const lower = address.toLowerCase();

	if (lower.startsWith(IPV4_MAPPED_PREFIX) && isIP(lower.slice(IPV4_MAPPED_PREFIX.length)) === 4) {
		return { ip: lower.slice(IPV4_MAPPED_PREFIX.length), family: 'ipv4' };
	}

	return { ip: address, family: isIP(address) === 6 ? 'ipv6' : 'ipv4' };
};

/**
 * Says why a webhook may not be delivered to the given IP address, or nothing when it may.
 */
export const forbiddenWebhookAddressReason = (address: string): string | undefined => {
	const { ip, family } = canonical(address);

	if (undeliverable.check(ip, family)) {
		return 'no webhook receiver can live at that address';
	}

	if (privateNetworks.check(ip, family) && MEET_ENV.WEBHOOK_ALLOW_PRIVATE_NETWORKS !== 'true') {
		return 'private network destinations are disabled (MEET_WEBHOOK_ALLOW_PRIVATE_NETWORKS)';
	}

	return undefined;
};

/**
 * Rejects a webhook URL whose host resolves to an address webhooks may not be delivered to. Applied
 * when a webhook is registered and again right before every delivery, since a hostname can change
 * where it points. A host that does not resolve is let through, to fail at delivery as it always did.
 */
export const assertWebhookDestinationAllowed = async (url: string): Promise<void> => {
	const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
	let addresses: string[];

	if (isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host, { all: true })).map((entry) => entry.address);
		} catch {
			return;
		}
	}

	for (const address of addresses) {
		const reason = forbiddenWebhookAddressReason(address);

		if (reason) {
			throw errorWebhookDestinationNotAllowed(url, reason);
		}
	}
};
