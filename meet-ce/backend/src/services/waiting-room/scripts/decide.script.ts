import { WAITING_ROOM_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Admits or rejects the named waiting participants, all of them or none, or everyone waiting. An
 * admission fits the room's capacity, from which the admitted entries take their places; a named one that
 * does not fit answers the free places. ARGV: room
 * id, `admit` or `reject`, capacity (empty for none), then the identities, none for everyone waiting.
 */
export const DECIDE_SCRIPT = `${WAITING_ROOM_SCRIPT_PRELUDE}
local room_id, decision, capacity = ARGV[3], ARGV[4], tonumber(ARGV[5])
local named = #ARGV > 5
local before = line_of(room_id)
local chosen = {}

if named then
	local waiting = {}
	for _, entry in ipairs(before) do
		waiting[entry.participantIdentity] = entry
	end
	for index = 6, #ARGV do
		local entry = waiting[ARGV[index]]
		if not entry then
			return cjson.encode({ notWaiting = ARGV[index] })
		end
		chosen[#chosen + 1] = entry
	end
	table.sort(chosen, by_arrival)
else
	for index, entry in ipairs(before) do
		chosen[index] = entry
	end
end

if decision == 'admit' and capacity then
	local free = capacity
	for _, entry in ipairs(entries_of(room_id)) do
		if entry.status == 'admitted' then
			free = free - 1
		end
	end
	free = math.max(free, 0)
	if named and #chosen > free then
		return cjson.encode({ noPlaces = true, availablePlaces = free })
	end
	while #chosen > free do
		table.remove(chosen)
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
return cjson.encode({ decided = chosen, line = moved(before, line_of(room_id)) })
`;
