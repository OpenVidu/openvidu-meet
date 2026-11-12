import { WAITING_ROOM_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Records that the client of a waiting participant is in touch and answers its status and place; an
 * admitted entry keeps the time of its admission. Answers the outcome of an ended wait, and nothing for
 * an unknown one. ARGV: wait id.
 */
export const PRESENCE_SCRIPT = `${WAITING_ROOM_SCRIPT_PRELUDE}
local wait_id = ARGV[3]
local room_id, entry, outcome = wait_of(wait_id)

if not room_id then
	return cjson.encode({})
end

if entry and entry.status == 'waiting' then
	redis.call('ZADD', seen_key, ms(now), seen_member(room_id, wait_id))
	local position = 0
	for index, waiting in ipairs(line_of(room_id)) do
		if waiting.waitId == wait_id then
			position = index
		end
	end
	return cjson.encode({
		roomId = room_id,
		status = 'waiting',
		queuePosition = position,
		waitedSeconds = math.floor((now - entry.knockDate) / 1000)
	})
end
return cjson.encode({ roomId = room_id, status = status_of(entry, outcome) or 'expired' })
`;
