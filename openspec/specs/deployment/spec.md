# Deployment Specification

## Purpose

Operator-facing behavior of the Meet server: how it is configured, where it serves the app and the API, how it starts, and the guarantees that let it run as one replica or as several replicas sharing MongoDB, Redis and object storage on every OpenVidu deployment type.

Surfaces: environment variables (the `meet.env` file of OpenVidu deployments), the `openvidu/openvidu-meet` Docker image, the base path, `<base path>/health` and `<base path>/info` (undocumented on purpose), the LiveKit webhook endpoint `/livekit/webhook`, the REST API reference at `<base path>/api/v1/docs`, rate limiting and server logs. Documented in openvidu.io `docs/meet/deployment/`, `docs/docs/self-hosting/configuration/reference.md` (`meet.env`) and `docs/docs/self-hosting/how-to-guides/customize-meet-base-path.md`.

## Requirements

### Requirement: Configuration from the environment
Meet SHALL read its configuration from environment variables when it starts. When `MEET_CONFIG_DIR` holds the path of an environment file (`KEY=value` lines), Meet SHALL also load it, and a variable already set in the environment SHALL win over the same variable in the file. A configuration change SHALL take effect only after a restart.

#### Scenario: Environment wins over the file
- **GIVEN** `MEET_CONFIG_DIR` points to a file setting `MEET_LOG_LEVEL=debug`
- **AND** the environment sets `MEET_LOG_LEVEL=warn`
- **WHEN** Meet starts
- **THEN** it logs at level `warn`

#### Scenario: A change needs a restart
- **GIVEN** a running Meet server
- **WHEN** the operator edits a variable in `meet.env`
- **THEN** the running server keeps the previous value until it is restarted

### Requirement: Effective configuration printed at startup
Meet SHALL print its effective configuration when it starts listening, grouped by concern (server, LiveKit, MongoDB, storage, Redis), and SHALL mask every credential (passwords, API keys, secrets, access keys) except its last three characters.

#### Scenario: Secrets are masked
- **GIVEN** `MEET_INITIAL_ADMIN_PASSWORD=supersecret`
- **WHEN** Meet starts
- **THEN** the startup output shows the admin password as `****ret`

### Requirement: Docker image requires LiveKit credentials
The `openvidu/openvidu-meet` image SHALL refuse to start the server when `LIVEKIT_URL`, `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` is unset, unless `MEET_CONFIG_DIR` is set, and SHALL print which variable is missing with an example command.

#### Scenario: Missing API secret
- **GIVEN** a container started with `LIVEKIT_URL` and `LIVEKIT_API_KEY` only
- **WHEN** the container starts
- **THEN** it exits reporting `LIVEKIT_API_SECRET is required`

### Requirement: Server variables
Meet SHALL listen on `SERVER_PORT` (default `6080`), serve under `MEET_BASE_PATH` (default `/meet`), build public URLs from `MEET_BASE_URL` (default unset), answer CORS with `SERVER_CORS_ORIGIN` (default `*`, see `embedded-distribution`), trust proxies per `SERVER_TRUST_PROXY` (default `true`), log at `MEET_LOG_LEVEL` (default `info`) and identify itself with `MEET_NAME_ID` (default `openviduMeet`).

#### Scenario: Defaults apply
- **GIVEN** none of the server variables is set
- **WHEN** Meet starts
- **THEN** it listens on port `6080` and serves the app at `/meet/`

### Requirement: Module gating
Meet SHALL exit with a success status, without serving, when `MODULES_FILE` is set and `ENABLED_MODULES` (a comma-separated list) does not contain `MODULE_NAME` (default `openviduMeet`), or when `MEET_MONGO_ENABLED` (default `true`) is not `true`.

#### Scenario: Meet module disabled in an OpenVidu deployment
- **GIVEN** `MODULES_FILE` is set and `ENABLED_MODULES=observability`
- **WHEN** the Meet container starts
- **THEN** Meet logs that the module is not enabled and exits with status 0

#### Scenario: MongoDB disabled
- **GIVEN** `MEET_MONGO_ENABLED=false`
- **WHEN** Meet starts
- **THEN** Meet logs that MongoDB integration is not enabled and exits with status 0

### Requirement: LiveKit connection
Meet SHALL call the LiveKit server API at `LIVEKIT_URL_PRIVATE` (defaulting to `LIVEKIT_URL`), SHALL hand `LIVEKIT_URL` to browsers as the media server address, and SHALL authenticate to LiveKit with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, the credentials that also sign every token Meet issues (see `authentication`).

#### Scenario: Private and public LiveKit URLs differ
- **GIVEN** `LIVEKIT_URL=wss://example.com/` and `LIVEKIT_URL_PRIVATE=ws://127.0.0.1:7880/`
- **WHEN** a participant joins a meeting
- **THEN** the server reaches LiveKit at `ws://127.0.0.1:7880/`
- **AND** the participant's browser connects to `wss://example.com/`

### Requirement: MongoDB connection
Meet SHALL connect to the database `MEET_MONGO_DB_NAME` (default `openvidu-meet`) using `MEET_MONGO_URI` when it is set, and otherwise a replica-set connection built from `MEET_MONGO_NODES` (comma-separated, default `localhost`), `MEET_MONGO_PORT` (`27017`), `MEET_MONGO_ADMIN_USERNAME`, `MEET_MONGO_ADMIN_PASSWORD` and `MEET_MONGO_REPLICA_SET_NAME` (`rs0`), preferring the primary for reads.

#### Scenario: Explicit URI wins
- **GIVEN** `MEET_MONGO_URI` and `MEET_MONGO_NODES` are both set
- **WHEN** Meet starts
- **THEN** it connects with `MEET_MONGO_URI` and ignores the node list

#### Scenario: Replica set of several nodes
- **GIVEN** `MEET_MONGO_NODES=node1,node2,node3` and no `MEET_MONGO_URI`
- **WHEN** the current MongoDB primary fails
- **THEN** Meet keeps working against the newly elected primary

### Requirement: MongoDB pool and timeouts
Meet SHALL size its MongoDB connection pool with `MEET_MONGO_MAX_POOL_SIZE` (default `100`) and `MEET_MONGO_MIN_POOL_SIZE` (default `0`), and SHALL apply `MEET_MONGO_SERVER_SELECTION_TIMEOUT_MS` and `MEET_MONGO_CONNECT_TIMEOUT_MS` (default `30000` each), `MEET_MONGO_SOCKET_TIMEOUT_MS` and `MEET_MONGO_MAX_IDLE_TIME_MS` (default `0`, no limit).

#### Scenario: No reachable MongoDB server at startup
- **GIVEN** the default `MEET_MONGO_SERVER_SELECTION_TIMEOUT_MS`
- **AND** no MongoDB node is reachable
- **WHEN** Meet starts
- **THEN** it gives up after 30 seconds and startup fails

### Requirement: Redis connection
Meet SHALL connect to Redis through Sentinel when `MEET_REDIS_SENTINEL_HOST_LIST` (comma-separated `host:port` entries) is set, using `MEET_REDIS_SENTINEL_PASSWORD` and the master `MEET_REDIS_SENTINEL_MASTER_NAME` (default `openvidu`), and otherwise to `MEET_REDIS_HOST:MEET_REDIS_PORT` (default `localhost:6379`), with `MEET_REDIS_USERNAME`, `MEET_REDIS_PASSWORD` and database `MEET_REDIS_DB` (default `0`).

#### Scenario: Sentinel without password
- **GIVEN** `MEET_REDIS_SENTINEL_HOST_LIST` is set and `MEET_REDIS_SENTINEL_PASSWORD` is empty
- **WHEN** Meet starts
- **THEN** startup fails reporting that the Sentinel password is required

#### Scenario: Sentinel entry without port
- **GIVEN** `MEET_REDIS_SENTINEL_HOST_LIST=sentinel1`
- **WHEN** Meet starts
- **THEN** startup fails

### Requirement: Storage provider selection
Meet SHALL use the object storage selected by `MEET_BLOB_STORAGE_MODE`: `s3` (default, any S3-compatible service), `gcs` (Google Cloud Storage) or `abs` (Azure Blob Storage). It SHALL use the bucket `MEET_S3_BUCKET` (S3 and GCS, default `openvidu-appdata`) or the container `MEET_AZURE_CONTAINER_NAME` (ABS, default `openvidu-appdata`), under the prefix `MEET_S3_SUBBUCKET` or `MEET_AZURE_SUBCONTAINER_NAME` (default `openvidu-meet`), where recordings are written and read.

#### Scenario: Google Cloud Storage reuses the S3 bucket variables
- **GIVEN** `MEET_BLOB_STORAGE_MODE=gcs` and `MEET_S3_BUCKET=my-bucket`
- **WHEN** Meet reads a recording file
- **THEN** it reads it from the GCS bucket `my-bucket` under the `openvidu-meet` prefix

#### Scenario: Azure recordings under the Azure prefix
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs`, `MEET_AZURE_SUBCONTAINER_NAME=meet-recordings` and `MEET_S3_SUBBUCKET` left at its default
- **WHEN** a recording completes
- **THEN** its file is written under the `meet-recordings` prefix of the container
- **AND** `getRecordingMedia` serves it

### Requirement: S3 credentials and endpoint
In `s3` mode Meet SHALL reach `MEET_S3_SERVICE_ENDPOINT` (default `http://localhost:9000`) in region `MEET_AWS_REGION` (default `us-east-1`), with path-style addressing while `MEET_S3_WITH_PATH_STYLE_ACCESS` is `true` (default). It SHALL authenticate with `MEET_S3_ACCESS_KEY` and `MEET_S3_SECRET_KEY` when both are non-empty, and otherwise with the standard AWS credential sources (environment, shared configuration, instance or task role).

#### Scenario: IAM role instead of static keys
- **GIVEN** `MEET_S3_ACCESS_KEY` and `MEET_S3_SECRET_KEY` are set to empty values
- **AND** the host has an instance role granting access to the bucket
- **WHEN** Meet starts
- **THEN** it accesses the bucket with the instance role credentials

#### Scenario: Static keys
- **GIVEN** both `MEET_S3_ACCESS_KEY` and `MEET_S3_SECRET_KEY` are non-empty
- **WHEN** Meet accesses the bucket
- **THEN** it signs its requests with those keys

### Requirement: S3 server-side encryption settings
Meet SHALL validate `MEET_S3_SSE_TYPE`, `MEET_S3_SSE_KMS_KEY_ID` and `MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT` at startup and SHALL abort startup when the type is neither `SSE-S3` nor `SSE-KMS`, when `SSE-KMS` has no key id, when a key id or context accompanies `SSE-S3`, when a key id or context is set without a type, or when the context is not a JSON object.

#### Scenario: KMS without a key id
- **GIVEN** `MEET_S3_SSE_TYPE=SSE-KMS` and no `MEET_S3_SSE_KMS_KEY_ID`
- **WHEN** Meet starts
- **THEN** startup fails naming `MEET_S3_SSE_KMS_KEY_ID`

#### Scenario: Context that is not an object
- **GIVEN** `MEET_S3_SSE_TYPE=SSE-KMS`, a key id and `MEET_S3_SSE_KMS_ENCRYPTION_CONTEXT=[1,2]`
- **WHEN** Meet starts
- **THEN** startup fails reporting that the context must be a JSON object

### Requirement: Google Cloud Storage credentials
In `gcs` mode Meet SHALL authenticate with Google Application Default Credentials: the service account key file named by `GOOGLE_APPLICATION_CREDENTIALS`, or the service account attached to the machine.

#### Scenario: Attached service account
- **GIVEN** `MEET_BLOB_STORAGE_MODE=gcs` on a VM whose service account can read the bucket
- **AND** no key file is configured
- **WHEN** Meet starts
- **THEN** it accesses the bucket as that service account

### Requirement: Azure Blob Storage credentials
In `abs` mode Meet SHALL authenticate over HTTPS to the account `MEET_AZURE_ACCOUNT_NAME` with the shared key `MEET_AZURE_ACCOUNT_KEY` when it is set, and with the managed identity of the VM or pod it runs on when it is empty. It SHALL abort startup when the account name or the container name is empty, and SHALL report at startup a credential that cannot read the container.

#### Scenario: Shared key
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs` and a valid `MEET_AZURE_ACCOUNT_KEY`
- **WHEN** Meet starts
- **THEN** it reads and deletes recordings with the shared key

#### Scenario: Missing account key
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs`, an empty `MEET_AZURE_ACCOUNT_KEY` and a VM whose managed identity holds the Storage Blob Data Contributor role on the account
- **WHEN** Meet starts
- **THEN** it accesses the container with that identity and no static credential

#### Scenario: Managed identity without data access
- **GIVEN** an empty `MEET_AZURE_ACCOUNT_KEY` and a managed identity with no role on the container's data
- **WHEN** Meet starts
- **THEN** the storage check reports the container as not accessible

#### Scenario: Missing account name
- **GIVEN** `MEET_BLOB_STORAGE_MODE=abs` and an empty `MEET_AZURE_ACCOUNT_NAME`
- **WHEN** Meet starts
- **THEN** startup fails reporting that the Azure Blob Storage configuration is incomplete

### Requirement: Startup order
Meet SHALL start accepting requests only after it has connected to MongoDB, verified the object storage, run the schema migrations and seeded the initial data, in that order, and SHALL then start its scheduled tasks.

#### Scenario: Health answers only after startup
- **GIVEN** a replica that is running its migrations
- **WHEN** a load balancer probes `<base path>/health`
- **THEN** the connection is refused until migrations and seeding have finished

### Requirement: Startup fails on unavailable dependencies
Meet SHALL exit with a non-zero status, instead of serving, when it cannot connect to MongoDB, cannot connect to Redis, cannot access the object storage, or finds that the configured bucket or container does not exist.

#### Scenario: Bucket does not exist
- **GIVEN** `MEET_S3_BUCKET` names a bucket that does not exist
- **WHEN** Meet starts
- **THEN** it logs that the bucket does not exist and exits with a non-zero status

#### Scenario: Redis unreachable at startup
- **GIVEN** Redis is not reachable
- **WHEN** Meet starts
- **THEN** it logs that it failed to connect to Redis and exits with a non-zero status

### Requirement: Schema migrations at startup under a lock
Meet SHALL migrate stored documents to the schema of its version at startup, forward only, before seeding. Migrations SHALL run under a deployment-wide lock: a replica that finds it taken SHALL wait, retrying for about six minutes, and then run the migrations itself, finding nothing left to do; if it cannot take the lock in that time it SHALL abort startup.

#### Scenario: Two replicas start at once
- **GIVEN** two replicas of a new version start against the same database
- **WHEN** replica A takes the migration lock first
- **THEN** replica B waits until A releases it
- **AND** B then finds every document already migrated and continues its startup

#### Scenario: Lock never released
- **GIVEN** the migration lock stays taken for more than six minutes
- **WHEN** a replica is waiting for it
- **THEN** that replica aborts its startup instead of serving possibly unmigrated data

### Requirement: Failed or backward migrations abort startup
Meet SHALL abort startup when a document fails to migrate, when a migration step between two schema versions is missing, or when the database holds documents at a newer schema version than the running version knows, so an older version never serves data written by a newer one. Meet SHALL record each migration run, with its outcome, in the database.

#### Scenario: One document cannot be migrated
- **GIVEN** a stored document that a migration step cannot transform
- **WHEN** Meet starts
- **THEN** the migration is recorded as failed and startup aborts

#### Scenario: Rolling back after an upgrade
- **GIVEN** a deployment upgraded to a version that migrated rooms to a newer schema
- **WHEN** the operator starts the previous version against the same database
- **THEN** it aborts startup reporting the newer schema version

### Requirement: Initial data seeded on every start
On every start, under a deployment-wide lock that a replica waits about one minute for before aborting startup, Meet SHALL create each missing initial item: the default global configuration, the root admin (see `users`), the initial API key (see `authentication`) and the initial webhook (see `webhooks`). It SHALL never modify an item that exists.

#### Scenario: Two replicas seed once
- **GIVEN** an empty database, `MEET_INITIAL_API_KEY` set and two replicas starting at the same time
- **WHEN** both reach the seeding step
- **THEN** exactly one root admin, one API key and one global configuration exist afterwards

### Requirement: Supported topologies
Meet SHALL behave the same as a single replica (OpenVidu Local, Single Node and Elastic, where it runs on the only master node) and as several replicas behind a load balancer sharing MongoDB, Redis and object storage (OpenVidu High Availability, one replica per master node, with a MongoDB replica set and Redis Sentinel).

#### Scenario: High Availability deployment
- **GIVEN** an OpenVidu High Availability deployment with four master nodes
- **WHEN** Meet is enabled
- **THEN** four replicas serve the same rooms, users and recordings through the load balancer

### Requirement: Any replica serves any request
Meet SHALL keep no state that a later request depends on in the memory of one replica: every request SHALL be served the same whichever replica receives it. Tokens issued by one replica are accepted by every other as `authentication` specifies.

#### Scenario: Room created on one replica, read on another
- **GIVEN** two replicas behind a load balancer
- **WHEN** a room is created through replica A
- **THEN** `getRoom` for that room through replica B returns it

### Requirement: Scheduled tasks run once per cluster
Each run of a scheduled task (clean-up and consistency sweeps owned by `rooms`, `meetings` and `recordings`) SHALL be executed by one replica only; the other replicas SHALL skip that run. Every replica SHALL attempt one run when it starts. A replica SHALL pause its scheduled tasks while Redis is unreachable and resume them when Redis is back.

#### Scenario: Two replicas share a schedule
- **GIVEN** two replicas running the same hourly task
- **WHEN** the hour comes
- **THEN** exactly one replica executes the task and the other skips it

#### Scenario: Redis outage
- **GIVEN** a replica loses its Redis connection
- **WHEN** a scheduled run comes due during the outage
- **THEN** the replica does not run it
- **AND** it resumes its schedule once Redis reconnects

### Requirement: Replicas run one version
A deployment SHALL run every replica on the same Meet version. An upgrade SHALL replace all replicas of the previous version; Meet does not support replicas of two versions serving the same deployment at once.

#### Scenario: Upgrading a High Availability deployment
- **GIVEN** four replicas on one version
- **WHEN** the operator upgrades the deployment
- **THEN** no replica of the previous version serves requests once a replica of the new version does

### Requirement: Deployment identity in LiveKit
Meet SHALL mark the LiveKit rooms it creates with `MEET_NAME_ID` and SHALL ignore LiveKit events about rooms that are not Meet rooms of this deployment, so a LiveKit server can be shared with other applications. Every replica of a deployment SHALL use the same `MEET_NAME_ID`, so each replica recognizes the rooms the others created.

#### Scenario: Room created by another application
- **GIVEN** a LiveKit room created by another application on the same LiveKit server
- **WHEN** LiveKit sends `participant_joined` for that room to Meet
- **THEN** Meet answers `200` and changes nothing

#### Scenario: Rooms created by another replica
- **GIVEN** two replicas with the same `MEET_NAME_ID`
- **WHEN** replica B receives a LiveKit event for a meeting started through replica A
- **THEN** replica B processes it as an event of its own deployment

### Requirement: Base path
Meet SHALL serve the app, the REST API (`<base path>/api/v1`), the internal API, the REST API reference, the embedded bundles (`<base path>/v1/openvidu-meet.js` and `<base path>/v1/openvidu-meet.esm.js`, see `embedded-distribution`), `/health` and `/info` under `MEET_BASE_PATH`, normalized to start and end with `/`; `/` serves Meet at the root of the host.

#### Scenario: Custom base path
- **GIVEN** `MEET_BASE_PATH=/video`
- **WHEN** a REST client calls `GET /video/api/v1/rooms` with a valid API key
- **THEN** the server answers the room list
- **AND** the app loads at `/video/`

#### Scenario: Path without slashes
- **GIVEN** `MEET_BASE_PATH=video`
- **WHEN** Meet starts
- **THEN** it serves under `/video/`

### Requirement: App routing under the base path
The server SHALL deliver the app's HTML with the configured base path applied, so one build works under any `MEET_BASE_PATH`, and SHALL answer every `GET` under the base path outside `api/` and `internal-api/` with the app, which shows the matching page. An unknown path under `<base path>/api/` or `<base path>/internal-api/` SHALL get `404` with a JSON body whose `error` is `Path Not Found`.

#### Scenario: Deep link
- **GIVEN** `MEET_BASE_PATH=/meet`
- **WHEN** a browser opens `/meet/rooms` directly
- **THEN** the server answers the app's HTML and the app shows the rooms page

#### Scenario: Unknown public API path
- **WHEN** a client calls `GET /meet/api/v1/unknown`
- **THEN** the server answers `404` with `{ "error": "Path Not Found", "message": "API path not implemented" }`

### Requirement: REST API reference served by the server
Meet SHALL serve the public REST API reference at `<base path>/api/v1/docs` without credentials, with its request examples pointing at `<base path>/api/v1`. The internal API reference SHALL be served at `<base path>/internal-api/v1/docs` only when `NODE_ENV` is `development`.

#### Scenario: Production server
- **GIVEN** `NODE_ENV=production`
- **WHEN** a browser opens `/meet/internal-api/v1/docs`
- **THEN** the server does not serve the internal API reference

### Requirement: Public URLs from MEET_BASE_URL
When `MEET_BASE_URL` is set, every absolute URL Meet returns (`Location` headers, access URLs, recording URLs, webhook payloads) SHALL start with it, without a trailing slash or a default port (`443` for `https`, `80` for `http`), followed by the base path. Meet SHALL warn at startup when `MEET_BASE_URL` is not a valid URL or contains a path.

#### Scenario: Default port dropped
- **GIVEN** `MEET_BASE_URL=https://example.com:443/` and `MEET_BASE_PATH=/meet`
- **WHEN** a client creates a room with `createRoom`
- **THEN** the `Location` header starts with `https://example.com/meet/api/v1/rooms/`

#### Scenario: Path in the base URL
- **GIVEN** `MEET_BASE_URL=https://example.com/meet`
- **WHEN** Meet starts
- **THEN** it warns that `MEET_BASE_URL` contains a path and that `MEET_BASE_PATH` is meant for it

### Requirement: Public URLs without MEET_BASE_URL
When `MEET_BASE_URL` is unset, a URL Meet builds while answering a request SHALL use the scheme and host that request was addressed to, and a URL built outside any request (webhook payloads, scheduled tasks) SHALL use `http://localhost:<SERVER_PORT>`, both followed by the base path.

#### Scenario: URL follows the requested host
- **GIVEN** `MEET_BASE_URL` is unset
- **WHEN** a client calls `getRoom` on `https://meet.example.com/meet/api/v1/rooms/{roomId}` through a trusted proxy
- **THEN** the room's access URLs start with `https://meet.example.com/meet/`

#### Scenario: Concurrent requests to different hosts
- **GIVEN** `MEET_BASE_URL` is unset
- **WHEN** concurrent requests for rooms arrive addressed to the hosts `h1.test` and `h2.test`
- **THEN** each response carries access URLs on the host its own request was addressed to

### Requirement: LiveKit webhook endpoint
Meet SHALL receive LiveKit webhooks at `/livekit/webhook`, outside the base path, SHALL verify each one against `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, and SHALL answer `200` to every delivery whose body is within the size limit, including ones it ignores or fails to process, so LiveKit never retries or accumulates connections.

#### Scenario: Forged webhook
- **WHEN** a request with an invalid signature reaches `/livekit/webhook`
- **THEN** the server answers `200` and does not act on it

#### Scenario: Base path does not move the endpoint
- **GIVEN** `MEET_BASE_PATH=/video`
- **WHEN** LiveKit posts an event to `/livekit/webhook`
- **THEN** Meet processes it

### Requirement: Concurrent duplicate LiveKit events processed once
When the same LiveKit event reaches two replicas at the same time, Meet SHALL process it on one replica only.

#### Scenario: Duplicate delivery across replicas
- **GIVEN** two replicas
- **WHEN** the same `room_finished` event reaches both while the first is still processing it
- **THEN** only one replica processes it and both answer `200`

### Requirement: Request body limit
The server SHALL reject a request body larger than 100 kB, on any endpoint and on `/livekit/webhook`, with `413` and a JSON body naming the limit, and SHALL reject a malformed JSON body with `400`.

#### Scenario: Oversized body
- **WHEN** a client sends a 200 kB JSON body to `createRoom`
- **THEN** the server answers `413` with `error` `Payload Too Large`

#### Scenario: Malformed JSON
- **WHEN** a client sends `{"roomName":` to `createRoom`
- **THEN** the server answers `400` with `error` `Bad Request`

### Requirement: Unexpected errors are masked
The server SHALL answer an unexpected failure with `500` and a generic JSON message, logging the cause with its stack. Every error response SHALL have the JSON shape `{ "error", "message" }`. An uncaught exception outside any request SHALL be logged and SHALL end the process with a non-zero status so the orchestrator restarts it.

#### Scenario: Internal failure
- **GIVEN** a request that hits an unexpected internal error
- **WHEN** the server answers it
- **THEN** the response is `500` with `error` `Internal Server Error` and no internal detail
- **AND** the log holds the error and its stack

### Requirement: Rate limiting per client address
The server SHALL limit requests per client IP address, per minute: 1000 for the REST API reference and the embedded bundles, 200 for room member token issuance and 500 for the other API routes, not counting requests with an `X-API-KEY` header. The limits on login, token refresh, logout, password changes and API key management are specified in `authentication`. No limit SHALL apply when `NODE_ENV` is `development`, `test` or `ci`.

#### Scenario: Server-to-server traffic is not throttled
- **GIVEN** an integrator backend calling the REST API with its API key from one IP address
- **WHEN** it sends 600 requests within a minute
- **THEN** none is rejected for rate limiting

#### Scenario: Browser traffic over the limit
- **GIVEN** a browser calling API routes with an access token
- **WHEN** it sends a 501st request within a minute
- **THEN** the server answers `429`

### Requirement: Rate limits count across the cluster
Every rate limit of Meet, those above and those in `authentication`, SHALL count the requests of a client address across all Meet replicas, so a client gets the same allowance whatever the number of replicas and whichever replica the load balancer picks.

#### Scenario: Requests spread over two replicas
- **GIVEN** two Meet replicas behind a load balancer
- **WHEN** a browser sends 300 API requests to each replica within a minute
- **THEN** the requests beyond the 500th of that minute are answered `429`, whichever replica receives them

### Requirement: Rate-limited response
A request over its limit SHALL get `429` with a JSON body `{ "error": "Too Many Requests", "message" }` and standard `RateLimit` and `RateLimit-Policy` headers, and SHALL be logged as a warning with its method, its path without the query string, and the client address.

#### Scenario: Secrets stay out of the log
- **GIVEN** a throttled request to a URL carrying `?secret=...`
- **WHEN** the server logs it
- **THEN** the log line has the path without the query string

### Requirement: Trusted proxies
Meet SHALL take the client address and scheme from `X-Forwarded-For` and `X-Forwarded-Proto` only from proxies trusted by `SERVER_TRUST_PROXY`: `true` trusts every hop, `false` none, a number that many hops, and any other value is read as a comma-separated list of addresses and subnets. An IPv4-mapped IPv6 subnet SHALL match only the IPv4 addresses inside it.

#### Scenario: Behind the OpenVidu proxy
- **GIVEN** `SERVER_TRUST_PROXY=true` and Meet behind a reverse proxy
- **WHEN** two browsers with different public addresses call the API
- **THEN** each is rate limited in its own bucket

#### Scenario: IPv4-mapped subnet
- **GIVEN** `SERVER_TRUST_PROXY=::ffff:10.0.0.0/8`
- **WHEN** a client at `203.0.113.5` sends `X-Forwarded-For: 198.51.100.7`
- **THEN** Meet takes `203.0.113.5` as the client address

### Requirement: Request correlation in logs
Meet SHALL write one log line per event as `<date time> | <edition> | <request id> | [<level>] <message>`, at or above `MEET_LOG_LEVEL` (`error`, `warn`, `info`, `verbose`, `debug`, `silly`). Every line written while handling an HTTP request SHALL carry an id generated for that request and shared by no other; lines written outside a request SHALL carry none.

#### Scenario: Two concurrent requests
- **WHEN** two requests are handled at the same time
- **THEN** every log line of the first carries one id, every line of the second carries another

#### Scenario: Scheduled task
- **WHEN** a scheduled task writes a log line
- **THEN** the line has no request id

### Requirement: Health endpoint
Meet SHALL answer `<base path>/health` with `200` and the text `OK`, without credentials. The endpoint SHALL stay out of the OpenAPI documents on purpose.

#### Scenario: Load balancer probe
- **WHEN** a load balancer requests `GET /meet/health`
- **THEN** the server answers `200` with `OK`

### Requirement: Info endpoint
Meet SHALL answer `GET <base path>/info`, only to requests authenticated with the API key, with the service name (`MEET_NAME_ID`), the version, the git commit and build date (`unknown` when the build did not record them), the edition and the API version. Any other credential or none SHALL get `401`. The endpoint SHALL stay out of the OpenAPI documents on purpose.

#### Scenario: Valid API key
- **WHEN** a client calls `GET /meet/info` with the API key in `X-API-KEY`
- **THEN** the server answers `200` with the version, edition `ce` and API version `v1`

#### Scenario: Access token instead of API key
- **WHEN** an admin calls `GET /meet/info` with an access token
- **THEN** the server answers `401`
