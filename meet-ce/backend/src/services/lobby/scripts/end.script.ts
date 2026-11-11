import { LOBBY_SCRIPT_PRELUDE } from './prelude.script.js';

/**
 * Ends waits of a room with an outcome: the given ones or all of them. ARGV: room id, outcome, `1` to
 * remove admissions already used too, how long a wait must have been unseen to end (empty for any),
 * then the wait ids, none for every wait of the room.
 */
export const END_SCRIPT = `${LOBBY_SCRIPT_PRELUDE}
local room_id, outcome = ARGV[3], ARGV[4]
local include_used, unseen_for = ARGV[5] == '1', tonumber(ARGV[6])
local everyone = #ARGV < 7
local targets = {}
for index = 7, #ARGV do
	targets[ARGV[index]] = true
end

local function still_seen(entry)
	if not unseen_for then
		return false
	end
	local seen = tonumber(redis.call('ZSCORE', seen_key, seen_member(room_id, entry.waitId)))
	return seen ~= nil and seen > now - unseen_for
end

local before = line_of(room_id)
local ended, silent = {}, {}
for _, entry in ipairs(entries_of(room_id)) do
	if (everyone or targets[entry.waitId]) and (include_used or not entry.used) and not still_seen(entry) then
		if finish(room_id, entry, outcome) then
			ended[#ended + 1] = entry
		else
			silent[#silent + 1] = entry
		end
	end
end
table.sort(ended, by_arrival)
return cjson.encode({ ended = ended, silent = silent, line = moved(before, line_of(room_id)) })
`;
