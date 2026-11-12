/**
 * Helpers every waiting room script starts with. `ARGV[1]` is the key prefix and `ARGV[2]` how long
 * an ended wait is kept, in milliseconds; each script's own arguments follow from `ARGV[3]`. Time is
 * read once from Redis, never from a replica's clock.
 */
export const WAITING_ROOM_SCRIPT_PRELUDE = `
local prefix = ARGV[1]
local ended_wait_ttl = ARGV[2]
local seen_key = prefix .. '_seen'
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)

local function room_key(room_id)
	return prefix .. ':' .. room_id
end

local function wait_key(wait_id)
	return prefix .. '_wait:' .. wait_id
end

local function line_key(room_id)
	return prefix .. '_line:' .. room_id
end

local function seen_member(room_id, wait_id)
	return room_id .. ':' .. wait_id
end

local function ms(value)
	return string.format('%.0f', value)
end

local function by_arrival(a, b)
	if a.knockDate ~= b.knockDate then
		return a.knockDate < b.knockDate
	end
	return a.participantIdentity < b.participantIdentity
end

local function entries_of(room_id)
	local entries = {}
	for _, value in ipairs(redis.call('HVALS', room_key(room_id))) do
		entries[#entries + 1] = cjson.decode(value)
	end
	return entries
end

local function line_of(room_id)
	local line = {}
	local identities = redis.call('ZRANGE', line_key(room_id), 0, -1)
	if #identities > 0 then
		for index, value in ipairs(redis.call('HMGET', room_key(room_id), unpack(identities))) do
			line[index] = cjson.decode(value)
		end
	end
	return line
end

local function moved(before, after)
	local from = 1
	while after[from] and before[from] and before[from].waitId == after[from].waitId do
		from = from + 1
	end
	local waiting = {}
	for position = from, #after do
		waiting[#waiting + 1] = { after[position].waitId, after[position].knockDate }
	end
	return { now = now, from = from, waiting = waiting }
end

local function save(room_id, entry)
	redis.call('HSET', room_key(room_id), entry.participantIdentity, cjson.encode(entry))
	if entry.status == 'waiting' then
		redis.call('ZADD', line_key(room_id), ms(entry.knockDate), entry.participantIdentity)
	else
		redis.call('ZREM', line_key(room_id), entry.participantIdentity)
	end
end

-- An admission already used keeps the outcome it recorded and is not told again.
local function finish(room_id, entry, outcome)
	redis.call('HDEL', room_key(room_id), entry.participantIdentity)
	redis.call('ZREM', line_key(room_id), entry.participantIdentity)
	redis.call('ZREM', seen_key, seen_member(room_id, entry.waitId))
	if not entry.used then
		redis.call('HSET', wait_key(entry.waitId), 'outcome', outcome)
	end
	redis.call('PEXPIRE', wait_key(entry.waitId), ended_wait_ttl)
	return not entry.used
end

local function wait_of(wait_id)
	local room_id, identity, outcome = unpack(redis.call('HMGET', wait_key(wait_id), 'roomId', 'identity', 'outcome'))
	if not room_id then
		return nil, nil, nil
	end
	local value = redis.call('HGET', room_key(room_id), identity)
	local entry = value and cjson.decode(value) or nil
	if entry and entry.waitId ~= wait_id then
		entry = nil
	end
	return room_id, entry, outcome or nil
end

local function status_of(entry, outcome)
	if entry and not entry.used then
		return entry.status
	end
	return outcome
end
`;
