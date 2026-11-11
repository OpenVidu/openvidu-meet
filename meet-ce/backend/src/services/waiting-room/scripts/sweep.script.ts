import { WAITING_ROOM_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Records a pass of the sweep and answers the Redis time, the previous pass, the last gap the sweep saw
 * and the waits unseen for too long, as `<roomId>:<waitId>`. ARGV: how long a wait may go unseen.
 */
export const SWEEP_SCRIPT = `${WAITING_ROOM_SCRIPT_PRELUDE}
local unseen_for = tonumber(ARGV[3])
local sweep_key = prefix .. '_sweep'
local last_run, gap_at = unpack(redis.call('HMGET', sweep_key, 'lastRun', 'gapAt'))
redis.call('HSET', sweep_key, 'lastRun', ms(now))
return cjson.encode({
	now = now,
	lastRun = tonumber(last_run),
	gapAt = tonumber(gap_at),
	due = redis.call('ZRANGEBYSCORE', seen_key, '-inf', ms(now - unseen_for))
})
`;
