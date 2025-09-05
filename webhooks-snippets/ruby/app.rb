require 'sinatra'
require 'json'
require 'openssl'

SERVER_PORT = 5080
MAX_WEBHOOK_AGE = 120 * 1000 # 2 minutes in milliseconds
OPENVIDU_MEET_API_KEY = 'meet-api-key'

set :port, SERVER_PORT
set :bind, '0.0.0.0'
set :environment, :production
disable :protection

post '/webhook' do
  body_content = request.body.read
  
  begin
    body = JSON.parse(body_content)
  rescue JSON::ParserError
    status 400
    return 'Invalid JSON'
  end
  
  headers = {}
  request.env.each do |key, value|
    if key.start_with?('HTTP_')
      header_name = key[5..-1].downcase.gsub('_', '-')
      headers[header_name] = value
    end
  end
  
  unless webhook_event_valid?(body, headers)
    puts 'Invalid webhook signature'
    status 401
    return 'Invalid webhook signature'
  end
  
  puts "Webhook received: #{body_content}"
  status 200
  ''
end

def webhook_event_valid?(body, headers)
  signature = headers['x-signature'] 
  timestamp_str = headers['x-timestamp']
  return false if signature.nil? || timestamp_str.nil?

  begin
    timestamp = Integer(timestamp_str)
  rescue ArgumentError
    return false
  end

  current = (Time.now.to_f * 1000).to_i
  diff_time = current - timestamp
  return false if diff_time >= MAX_WEBHOOK_AGE 

  signed_payload = "#{timestamp}.#{body.to_json}" 

  expected = OpenSSL::HMAC.hexdigest('SHA256', OPENVIDU_MEET_API_KEY, signed_payload) 

  OpenSSL.fixed_length_secure_compare(expected, signature) 
end

puts "Webhook server listening on port #{SERVER_PORT}"
