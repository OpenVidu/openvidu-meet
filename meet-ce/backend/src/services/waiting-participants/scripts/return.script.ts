import { WAITING_PARTICIPANT_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Makes an admission not used yet wait again, keeping its knock, and answers the seconds waited since it;
 * otherwise answers the current status of the wait, none when it is unknown. ARGV: wait id.
 */
export const RETURN_SCRIPT = `${WAITING_PARTICIPANT_SCRIPT_PRELUDE}
local wait_id = ARGV[3]
local room_id, entry, outcome = wait_of(wait_id)

if entry and entry.status == 'admitted' and not entry.used then
	entry.status = 'waiting'
	save(room_id, entry)
	redis.call('ZADD', seen_key, ms(now), seen_member(room_id, wait_id))
	return cjson.encode({ entry = entry, waitedSeconds = math.floor((now - entry.knockDate) / 1000) })
end
return cjson.encode({ status = status_of(entry, outcome) })
`;
