import { LOBBY_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Releases the place of an admitted participant who joined the meeting, used or not; a waiting entry
 * stays. ARGV: room id, participant identity.
 */
export const JOINED_SCRIPT = `${LOBBY_SCRIPT_PRELUDE}
local room_id, identity = ARGV[3], ARGV[4]
local value = redis.call('HGET', room_key(room_id), identity)
local entry = value and cjson.decode(value) or nil

if not entry or entry.status ~= 'admitted' then
	return cjson.encode({})
end
finish(room_id, entry, 'admitted')
return cjson.encode({ entry = entry })
`;
