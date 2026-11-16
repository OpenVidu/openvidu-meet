import { WAITING_PARTICIPANT_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Rejects one waiting participant, or admits one or everyone waiting, all of them or nobody. An admission
 * fits the room's capacity, from which the admitted entries not joined yet take their places. ARGV: room
 * id, `admit` or `reject`, capacity (empty for none), then the identity, none to admit everyone waiting.
 */
export const DECIDE_SCRIPT = `${WAITING_PARTICIPANT_SCRIPT_PRELUDE}
local room_id, decision, capacity, identity = ARGV[3], ARGV[4], tonumber(ARGV[5]), ARGV[6]
local entries = entries_of(room_id)
local chosen = {}

for _, entry in ipairs(entries) do
	if entry.status == 'waiting' and (not identity or entry.participantIdentity == identity) then
		chosen[#chosen + 1] = entry
	end
end

if identity and #chosen == 0 then
	return cjson.encode({ notWaiting = identity })
end

if decision == 'admit' and capacity then
	local free = capacity
	for _, entry in ipairs(entries) do
		if entry.status == 'admitted' then
			free = free - 1
		end
	end
	if #chosen > math.max(free, 0) then
		return cjson.encode({ noPlaces = true })
	end
end

for _, entry in ipairs(chosen) do
	if decision == 'admit' then
		entry.status = 'admitted'
		save(room_id, entry)
		redis.call('ZADD', seen_key, ms(now), seen_member(room_id, entry.waitId))
	else
		finish(room_id, entry, 'rejected')
	end
end
return cjson.encode({ decided = chosen })
`;
