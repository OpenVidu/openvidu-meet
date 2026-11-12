import { WAITING_ROOM_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Dates the presence of a waiting participant whose page closed back in time, so that the wait expires
 * soon unless its client connects again, which records its presence anew. A presence newer than the closed
 * connection's last answer belongs to another connection of the wait and is left alone, and so is one
 * dated further back already. ARGV: wait id, how long before now to date the presence, how long ago a
 * presence is another connection's.
 */
export const CLOSED_SCRIPT = `${WAITING_ROOM_SCRIPT_PRELUDE}
local wait_id = ARGV[3]
local dated_back, other_connections_ago = tonumber(ARGV[4]), tonumber(ARGV[5])
local room_id, entry = wait_of(wait_id)
if not room_id or not entry or entry.status ~= 'waiting' then
	return cjson.encode({})
end
local member = seen_member(room_id, wait_id)
local seen = tonumber(redis.call('ZSCORE', seen_key, member))
if not seen or seen > now - other_connections_ago then
	return cjson.encode({})
end
redis.call('ZADD', seen_key, 'LT', ms(now - dated_back), member)
return cjson.encode({ dated = true })
`;
