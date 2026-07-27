/**
 * LEGACY STORAGE MIGRATION — DELETE ON 3.10.0 RELEASE
 */

const PREFIX = 'ovMeet-';

/** True when `raw` is already a `{ item: … }` wrapper written by the new engine. */
const isWrapped = (raw: string): boolean => {
	try {
		const parsed: unknown = JSON.parse(raw);
		return !!parsed && typeof parsed === 'object' && 'item' in parsed;
	} catch {
		return false;
	}
};

/** Wraps a raw (unwrapped) value at `key` in place as `{ item: raw }`. No-op if already wrapped. */
const wrapInPlace = (storage: Storage, key: string): void => {
	const raw = storage.getItem(key);
	if (raw === null || isWrapped(raw)) return;
	storage.setItem(key, JSON.stringify({ item: raw }));
};

/**
 * Rewraps a plain-JSON value at `key` as `{ item: parsedValue }` in place. No-op if already wrapped.
 * Falls back to treating the stored string as the raw item when it is not valid JSON.
 */
const rewrapJsonInPlace = (storage: Storage, key: string): void => {
	const raw = storage.getItem(key);
	if (raw === null || isWrapped(raw)) return;
	try {
		storage.setItem(key, JSON.stringify({ item: JSON.parse(raw) }));
	} catch {
		storage.setItem(key, JSON.stringify({ item: raw }));
	}
};

/**
 * Moves `oldKey` → `newKey` and deletes the source (self-terminating on re-run).
 *
 * @param onlyIfAbsent when true, keep an existing `newKey` (do not overwrite) but still delete the source.
 * @param transform    optional rewrite of the stored string before it lands under `newKey`.
 */
const moveKey = (
	storage: Storage,
	oldKey: string,
	newKey: string,
	{ onlyIfAbsent = false, transform }: { onlyIfAbsent?: boolean; transform?: (raw: string) => string } = {}
): void => {
	const raw = storage.getItem(oldKey);
	if (raw === null) return;

	if (!onlyIfAbsent || storage.getItem(newKey) === null) {
		storage.setItem(newKey, transform ? transform(raw) : raw);
	}
	storage.removeItem(oldKey);
};

/** Coerces a wrapped-string number (`{"item":"5"}`) to a wrapped number (`{"item":5}`). */
const coerceWrappedToNumber = (raw: string): string => {
	try {
		const parsed = JSON.parse(raw) as { item?: unknown };
		const num = Number(parsed?.item);
		return JSON.stringify({ item: Number.isFinite(num) ? num : parsed?.item });
	} catch {
		return raw;
	}
};

/**
 * Migrates every legacy browser-storage entry onto the unified `ovMeet-` prefix + `{item}` wrapper.
 *
 * Called once from the `BrowserStorageService` constructor when storage is available. Accepts the
 * storages as arguments so it is trivially testable with fakes.
 */
export const migrateLegacyStorage = (local: Storage, session: Storage): void => {
	// ── localStorage ──────────────────────────────────────────────────────────────────────────

	// Raw JWTs → wrap in place (avoids forced logout).
	wrapInPlace(local, `${PREFIX}accessToken`);
	wrapInPlace(local, `${PREFIX}refreshToken`);

	// Theme: the raw `ovMeet-theme` wins over the wrapped `ovComponents-theme` copy. Wrap the raw one
	// first, then only adopt the components copy if no theme survived, always deleting the source.
	wrapInPlace(local, `${PREFIX}theme`);
	moveKey(local, 'ovComponents-theme', `${PREFIX}theme`, { onlyIfAbsent: true });

	// Wrapped values under old prefixes → move onto `ovMeet-` as-is.
	moveKey(local, 'ovComponents-lang', `${PREFIX}lang`);
	moveKey(local, 'ovComponents-videoDevice', `${PREFIX}videoDevice`);
	moveKey(local, 'ovComponents-audioDevice', `${PREFIX}audioDevice`);
	moveKey(local, 'ovComponents-virtualBg', `${PREFIX}virtualBg`);
	moveKey(local, 'OpenViduMeet-layoutMode', `${PREFIX}layoutMode`);
	moveKey(local, 'OpenViduMeet-maxVisibleRemoteParticipants', `${PREFIX}maxVisibleRemoteParticipants`, {
		transform: coerceWrappedToNumber
	});

	// participantName was persisted raw and cross-visit; its real semantics is "last used name".
	moveKey(local, `${PREFIX}participantName`, `${PREFIX}lastParticipantName`, {
		transform: (raw) => JSON.stringify({ item: raw })
	});

	// Dead keys (zero consumers) → delete.
	local.removeItem('OpenViduMeet-maxRemoteSpeakers');
	local.removeItem('ovComponents-captionLang');

	// ── sessionStorage ────────────────────────────────────────────────────────────────────────

	// Plain-JSON values written by the old SessionStorageService → rewrap in place.
	rewrapJsonInPlace(session, `${PREFIX}roomSecret`);
	rewrapJsonInPlace(session, `${PREFIX}redirectUrl`);
	rewrapJsonInPlace(session, `${PREFIX}e2eeData`);
	rewrapJsonInPlace(session, `${PREFIX}mustChangePassword`);

	// Tab-scoped media state written under the old components prefix → move onto `ovMeet-` as-is.
	moveKey(session, 'ovComponents-participantName', `${PREFIX}participantName`);
	moveKey(session, 'ovComponents-cameraEnabled', `${PREFIX}cameraEnabled`);
	moveKey(session, 'ovComponents-microphoneEnabled', `${PREFIX}microphoneEnabled`);
};
