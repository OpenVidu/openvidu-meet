import { LOBBY_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Puts an admission not used yet back in line, in the place its knock gave it; otherwise answers the
 * current status of the wait, none when it is unknown. ARGV: wait id.
 */
export const RETURN_SCRIPT = `${LOBBY_SCRIPT_PRELUDE}
local wait_id = ARGV[3]
local room_id, entry, outcome = wait_of(wait_id)

if entry and entry.status == 'admitted' and not entry.used then
	local before = line_of(room_id)
	entry.status = 'waiting'
	save(room_id, entry)
	redis.call('ZADD', seen_key, ms(now), seen_member(room_id, wait_id))
	return cjson.encode({ entry = entry, line = moved(before, line_of(room_id)) })
end
return cjson.encode({ status = status_of(entry, outcome) })
`;
