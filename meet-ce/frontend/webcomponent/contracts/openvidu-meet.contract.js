/**
 * Single source of truth for the public API of the `openvidu-meet` web component.
 *
 * Every generated integration artifact (TypeScript declarations, CEM and wrappers)
 * is derived from this file to avoid duplicated maintenance across frameworks.
 *
 * IMPORTANT: When updating this contract, regenerate all artifacts by running:
 *   npm run build:api
 */

/**
 * @typedef {Object} ContractProperty
 * @property {string} name Public property name exposed by the custom element instance.
 * @property {string} type TypeScript type literal used in generated declarations.
 * @property {string} [attribute] HTML attribute alias when applicable.
 * @property {boolean} [required] Whether the property is required.
 * @property {string} description Human-readable description for docs and JSDoc.
 */

/**
 * @typedef {Object} ContractMethod
 * @property {string} name Public method name exposed by the custom element instance.
 * @property {string} [returnType] TypeScript return type literal (used when rawSignature is not set).
 * @property {{ name: string, type: string, description: string }[]} [params] Method parameters.
 * @property {string} [rawSignature] When present, used verbatim as the TypeScript method signature
 *   instead of generating one from name/params/returnType. Useful for generic methods.
 * @property {string} description Human-readable description for docs and JSDoc.
 */

/**
 * @typedef {Object} ContractEventField
 * @property {string} name Field name inside `CustomEvent.detail`.
 * @property {string} type TypeScript type literal.
 * @property {boolean} [optional] Whether the field is optional.
 * @property {string} description Human-readable description.
 */

/**
 * @typedef {Object} ContractEvent
 * @property {string} name Native DOM event name.
 * @property {string} reactName React callback prop name (for generated wrappers).
 * @property {string} detailTypeName Exported TypeScript interface name for event detail.
 * @property {string} description Human-readable description for docs and JSDoc.
 * @property {ContractEventField[]} fields Event detail fields.
 */

/**
 * @typedef {Object} WebComponentContract
 * @property {string} tagName Custom element tag name.
 * @property {string} packageName Suggested package name for generated adapters.
 * @property {string} elementInterfaceName Exported interface name for the DOM element.
 * @property {string} propsInterfaceName Exported interface name for props.
 * @property {ContractProperty[]} properties Public properties.
 * @property {ContractMethod[]} methods Public methods.
 * @property {ContractEvent[]} events Public DOM events.
 */

/** @type {WebComponentContract} */
const openViduMeetContract = {
  tagName: 'openvidu-meet',
  packageName: 'openvidu-meet-webcomponent',
  elementInterfaceName: 'OpenViduMeetElement',
  propsInterfaceName: 'OpenViduMeetProps',
  properties: [
    {
      name: 'roomUrl',
      type: 'string',
      attribute: 'room-url',
      description: 'The OpenVidu Meet room URL to connect to. Required unless recordingUrl is provided.',
    },
    {
      name: 'recordingUrl',
      type: 'string',
      attribute: 'recording-url',
      description: 'URL of a recording to view. When provided, roomUrl is not required.',
    },
    {
      name: 'participantName',
      type: 'string',
      attribute: 'participant-name',
      description: 'Display name for the local participant.',
    },
    {
      name: 'e2eeKey',
      type: 'string',
      attribute: 'e2ee-key',
      description: 'Secret key for end-to-end encryption (E2EE). When provided the participant joins using E2EE.',
    },
    {
      name: 'leaveRedirectUrl',
      type: 'string',
      attribute: 'leave-redirect-url',
      description: 'URL to redirect to after the CLOSED event fires when leaving the meeting.',
    },
    {
      name: 'showOnlyRecordings',
      type: 'boolean',
      attribute: 'show-only-recordings',
      description: 'When true, shows only recordings instead of live meetings.',
    },
    {
      name: 'showRecording',
      type: 'string',
      attribute: 'show-recording',
      description: 'Recording identifier to open directly. Redirects the app to /recording/:recordingId.',
    },
  ],
  methods: [
    {
      name: 'on',
      rawSignature: 'on<K extends OpenViduMeetEventName>(eventName: K, callback: (detail: OpenViduMeetEventPayloadMap[K]) => void): this',
      description:
        'Subscribe to a meeting event with a type-safe payload callback. Returns the element for chaining.',
    },
    {
      name: 'once',
      rawSignature: 'once<K extends OpenViduMeetEventName>(eventName: K, callback: (detail: OpenViduMeetEventPayloadMap[K]) => void): this',
      description:
        'Subscribe to a meeting event once. The handler is automatically removed after the first invocation. Returns the element for chaining.',
    },
    {
      name: 'off',
      rawSignature: 'off<K extends OpenViduMeetEventName>(eventName: K, callback?: (detail: OpenViduMeetEventPayloadMap[K]) => void): this',
      description:
        'Unsubscribe from a meeting event. If no callback is provided, all handlers for that event are removed. Returns the element for chaining.',
    },
    {
      name: 'endMeeting',
      returnType: 'void',
      description: 'Ends the current meeting for all participants. Requires moderator privileges.',
    },
    {
      name: 'leaveRoom',
      returnType: 'void',
      description: 'Disconnects the local participant from the current room without ending the meeting.',
    },
    {
      name: 'kickParticipant',
      returnType: 'void',
      params: [
        {
          name: 'participantIdentity',
          type: 'string',
          description: 'The unique identity of the participant to kick from the meeting.',
        },
      ],
      description: 'Kicks a participant from the meeting. Requires moderator privileges.',
    },
  ],
  events: [
    {
      name: 'joined',
      reactName: 'onJoined',
      detailTypeName: 'OpenViduMeetJoinedDetail',
      description: 'Emitted when the local participant successfully joins the room.',
      fields: [
        {
          name: 'roomId',
          type: 'string',
          description: 'Unique identifier of the room that was joined.',
        },
        {
          name: 'participantIdentity',
          type: 'string',
          description: 'Unique identity of the local participant.',
        },
      ],
    },
    {
      name: 'left',
      reactName: 'onLeft',
      detailTypeName: 'OpenViduMeetLeftDetail',
      description: 'Emitted when the local participant leaves the room.',
      fields: [
        {
          name: 'roomId',
          type: 'string',
          description: 'Unique identifier of the room that was left.',
        },
        {
          name: 'participantIdentity',
          type: 'string',
          description: 'Unique identity of the local participant.',
        },
        {
          name: 'reason',
          type: 'string',
          description:
            'Reason for leaving. One of: voluntary_leave, network_disconnect, server_shutdown, participant_kicked, meeting_ended, meeting_ended_by_self, duplicate_identity, unknown.',
        },
      ],
    },
    {
      name: 'closed',
      reactName: 'onClosed',
      detailTypeName: 'OpenViduMeetClosedDetail',
      description: 'Emitted when the application is fully closed after leaving or ending the meeting.',
      fields: [],
    },
    {
      name: 'error',
      reactName: 'onError',
      detailTypeName: 'OpenViduMeetErrorDetail',
      description:
        "Emitted when the component cannot proceed with the requested mode. Includes pre-flight errors (invalid inputs, access denied) and the auth-required signal for recording playback. Hosts may use `reason` to drive their own recovery flow (e.g. show a login modal on `'auth-required'`).",
      fields: [
        {
          name: 'reason',
          type: "'invalid-config' | 'invalid-room-url' | 'invalid-recording-id' | 'access-denied' | 'auth-required' | 'unknown'",
          description: 'Discriminator describing the kind of failure.',
        },
        {
          name: 'message',
          type: 'string',
          description: 'Human-readable message that mirrors the in-component error display.',
        },
        {
          name: 'accessReason',
          type: 'string',
          optional: true,
          description:
            "When reason='access-denied', the underlying typed reason from the use case (a `NavigationErrorReason` value).",
        },
      ],
    },
  ],
};

module.exports = {
  openViduMeetContract,
};
