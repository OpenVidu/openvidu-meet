import { LOBBY_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Uses an admission to issue the join token: the entry stays, counting as a taken place, and the wait
 * records `admitted` as its outcome; otherwise answers the current status of the wait, none when it is
 * unknown. ARGV: wait id.
 */
export const CONSUME_SCRIPT = `${LOBBY_SCRIPT_PRELUDE}
local wait_id = ARGV[3]
local room_id, entry, outcome = wait_of(wait_id)

if entry and entry.status == 'admitted' and not entry.used then
	entry.used = true
	save(room_id, entry)
	redis.call('HSET', wait_key(wait_id), 'outcome', 'admitted')
	return cjson.encode({ entry = entry })
end
return cjson.encode({ status = status_of(entry, outcome) })
`;
