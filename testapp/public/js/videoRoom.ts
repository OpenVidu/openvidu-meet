/**
 * Event types that can be emitted by the OpenVidu-Meet web component
 */
type MeetEvent = 'JOIN' | 'LEFT' | 'ERROR';

/**
 * Interface for OpenVidu-Meet component events
 */
interface MeetEventDetail {
  participantId?: string;
  participantName?: string;
  roomId?: string;
  timestamp: number;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Interface for OpenVidu-Meet web component
 */
interface OpenViduMeetElement extends HTMLElement {
  endMeeting(): void;
  leaveRoom(): void;
  toggleChat(): void;
}

/**
 * Interface for webhook events
 */
interface WebhookEvent {
  event: string;
  [key: string]: any;
}

// Set up event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Set up button click handlers
  setupButtonHandlers();

  // Initialize socket.io connection
  const socket = io();

  // Get API key from the data attribute
  const apiKey = document.getElementById('meeting-container')?.dataset.apiKey || '';

  // Store API key in a variable that can be used for fetch requests
  window.meetApiKey = apiKey;

  // Listen for webhook events from the server
  socket.on('webhookEvent', (payload: WebhookEvent) => {
    console.log('Webhook event received:', payload);
    addWebhookToLog(payload);
  });

  console.log('DOM loaded');
  const meet = document.querySelector('openvidu-meet') as OpenViduMeetElement;

  if (meet) {
    // Event listener for when the local participant joined the room
    meet.addEventListener('JOIN', ((event: CustomEvent<MeetEventDetail>) => {
      addEventToLog('JOIN', JSON.stringify(event.detail));
    }) as EventListener);

    // Event listener for when the local participant left the room
    meet.addEventListener('LEFT', ((event: CustomEvent<MeetEventDetail>) => {
      addEventToLog('LEFT', JSON.stringify(event.detail));
    }) as EventListener);

    // Error event listener
    meet.addEventListener('ERROR', ((event: CustomEvent<MeetEventDetail>) => {
      addEventToLog('ERROR', JSON.stringify(event.detail));
    }) as EventListener);
  }
});

/**
 * Set up button click handlers
 */
function setupButtonHandlers(): void {
  const meet = document.querySelector('openvidu-meet') as OpenViduMeetElement;

  // End meeting button click handler
  document.getElementById('end-meeting-btn')?.addEventListener('click', () => {
    if (meet) {
      meet.endMeeting();
    }
  });

  // Leave room button click handler
  document.getElementById('leave-room-btn')?.addEventListener('click', () => {
    if (meet) {
      meet.leaveRoom();
    }
  });

  // Toggle chat button click handler
  document.getElementById('toggle-chat-btn')?.addEventListener('click', () => {
    if (meet) {
      meet.toggleChat();
    }
  });
}

/**
 * Add a component event to the events log
 */
function addEventToLog(eventType: MeetEvent, eventMessage: string): void {
  const eventsList = document.getElementById('events-list');
  if (eventsList) {
    const li = document.createElement('li');
    li.textContent = `[ ${eventType} ] : ${eventMessage}`;
    eventsList.appendChild(li);
  }
}

/**
 * Add a webhook event to the webhooks log
 */
function addWebhookToLog(payload: WebhookEvent): void {
  const webhookLogList = document.getElementById('webhook-log-list');
  if (webhookLogList) {
    const li = document.createElement('li');
    li.textContent = `[ ${payload.event} ] : ${JSON.stringify(payload)}`;
    webhookLogList.appendChild(li);
  }
}

/**
 * Utility function to make API requests with the API key
 */
function fetchWithApiKey(url: string, options: RequestInit = {}): Promise<Response> {
  // Ensure headers object exists
  const headers = new Headers(options.headers || {});

  // Add API key to headers
  headers.append('X-API-KEY', window.meetApiKey);
  headers.append('Accept', 'application/json');

  // Handle JSON request body
  if (options.body && typeof options.body !== 'string') {
    headers.append('Content-Type', 'application/json');
    options.body = JSON.stringify(options.body);
  }

  // Create new options object with merged headers
  const fetchOptions: RequestInit = {
    ...options,
    headers
  };

  return fetch(url, fetchOptions);
}

// Add meetApiKey to window interface
declare global {
  interface Window {
    meetApiKey: string;
  }
}