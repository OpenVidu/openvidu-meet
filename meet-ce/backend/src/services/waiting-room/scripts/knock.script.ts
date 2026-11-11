import { WAITING_ROOM_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Starts a wait at the end of the line, unless the room already holds the most entries it may; an
 * earlier wait of the same identity ends as `left`. ARGV: room id, wait id, most entries, how long
 * before the knock its presence is dated, the participant as JSON, the principal (empty for none).
 */
export const KNOCK_SCRIPT = `${WAITING_ROOM_SCRIPT_PRELUDE}
local room_id, wait_id = ARGV[3], ARGV[4]
local max_entries, presence_offset = tonumber(ARGV[5]), tonumber(ARGV[6])
local principal = ARGV[8]
local before = line_of(room_id)
local previous = redis.call('HGET', room_key(room_id), cjson.decode(ARGV[7]).participantIdentity)
previous = previous and cjson.decode(previous) or nil

if redis.call('HLEN', room_key(room_id)) - (previous and 1 or 0) >= max_entries then
	return cjson.encode({ full = true })
end

local replaced = nil
if previous and finish(room_id, previous, 'left') then
	replaced = previous
end

local participant = cjson.decode(ARGV[7])
participant.knockDate = now
redis.call('HSET', wait_key(wait_id), 'roomId', room_id, 'identity', participant.participantIdentity, 'participant', cjson.encode(participant))
if principal ~= '' then
	redis.call('HSET', wait_key(wait_id), 'principal', principal)
end

local entry = participant
entry.waitId = wait_id
entry.status = 'waiting'
save(room_id, entry)
redis.call('ZADD', seen_key, ms(now - presence_offset), seen_member(room_id, wait_id))
return cjson.encode({ entry = entry, replaced = replaced, line = moved(before, line_of(room_id)) })
`;
