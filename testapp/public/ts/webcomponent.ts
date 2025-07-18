const socket = (window as any).io();

let meet: {
    endMeeting: () => void;
    leaveRoom: () => void;
    kickParticipant: (participantIdentity: string) => void;
    on: (event: string, callback: (event: CustomEvent<any>) => void) => void;
};
let roomId: string | undefined;
let showAllWebhooksCheckbox: HTMLInputElement | null;

/**
 * Add a component event to the events log
 */
const addEventToLog = (eventType: string, eventMessage: string): void => {
    const eventsList = document.getElementById('events-list');
    if (eventsList) {
        const li = document.createElement('li');
        li.className = `event-${eventType}`;
        li.textContent = `[ ${eventType} ] : ${eventMessage}`;
        eventsList.insertBefore(li, eventsList.firstChild);
    }
};
const escapeHtml = (unsafe: string): string => {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const getWebhookEventsFromStorage = (roomId: string): any[] => {
    const data = localStorage.getItem('webhookEventsByRoom');
    if (!data) {
        return [];
    }

    const map = JSON.parse(data);
    return map[roomId] || [];
};

const saveWebhookEventToStorage = (roomId: string, event: any): void => {
    const data = localStorage.getItem('webhookEventsByRoom');
    const map = data ? JSON.parse(data) : {};
    if (!map[roomId]) {
        map[roomId] = [];
    }

    map[roomId].push(event);
    localStorage.setItem('webhookEventsByRoom', JSON.stringify(map));
};

const clearWebhookEventsByRoom = (roomId: string): void => {
    const data = localStorage.getItem('webhookEventsByRoom');
    if (!data) return;

    const map = JSON.parse(data);
    if (map[roomId]) {
        map[roomId] = [];
        localStorage.setItem('webhookEventsByRoom', JSON.stringify(map));
    }
};

const shouldShowWebhook = (event: any): boolean => {
    return showAllWebhooksCheckbox?.checked || event.data.roomId === roomId;
};

const listenWebhookServerEvents = () => {
    socket.on('webhookEvent', (event: any) => {
        console.log('Webhook received:', event);
        const webhookRoomId = event.data.roomId;

        if (webhookRoomId) {
            saveWebhookEventToStorage(webhookRoomId, event);
        }

        if (!shouldShowWebhook(event)) {
            console.log('Ignoring webhook event:', event);
            return;
        }

        addWebhookEventElement(event);

        // Clean up the previous events
        const isMeetingEnded = event.event === 'meetingEnded';
        if (isMeetingEnded) clearWebhookEventsByRoom(webhookRoomId);
    });
};

const renderStoredWebhookEvents = (roomId: string) => {
    const webhookLogList = document.getElementById('webhook-log-list');
    if (webhookLogList) {
        while (webhookLogList.firstChild) {
            webhookLogList.removeChild(webhookLogList.firstChild);
        }
    }

    const events = getWebhookEventsFromStorage(roomId);
    events.forEach((event) => addWebhookEventElement(event));
};

const addWebhookEventElement = (event: any) => {
    const webhookLogList = document.getElementById('webhook-log-list');
    if (webhookLogList) {
        // Create unique IDs for this accordion item
        const itemId = event.creationDate;
        const headerClassName = `webhook-${event.event}`;
        const collapseId = `collapse-${itemId}`;

        // Create accordion item container
        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item';

        // Create header
        const header = document.createElement('h2');
        header.classList.add(headerClassName, 'accordion-header');

        // Create header button
        const button = document.createElement('button');
        button.className = 'accordion-button';
        button.type = 'button';
        button.setAttribute('data-bs-toggle', 'collapse');
        button.setAttribute('data-bs-target', `#${collapseId}`);
        button.setAttribute('aria-expanded', 'true');
        button.setAttribute('aria-controls', collapseId);
        button.style.padding = '10px';

        if (event.event === 'meetingStarted') {
            button.classList.add('bg-success');
        }
        if (event.event === 'meetingEnded') {
            button.classList.add('bg-danger');
        }
        if (event.event.includes('recording')) {
            button.classList.add('bg-warning');
        }

        // Format the header text with event name and timestamp
        const date = new Date(event.creationDate);
        const formattedDate = date.toLocaleString('es-ES', {
            // year: 'numeric',
            // month: '2-digit',
            // day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        button.innerHTML = `[${formattedDate}] <strong>${event.event}</strong>`;

        // Create collapsible content container
        const collapseDiv = document.createElement('div');
        collapseDiv.id = collapseId;
        collapseDiv.className = 'accordion-collapse collapse';
        collapseDiv.setAttribute('aria-labelledby', headerClassName);
        collapseDiv.setAttribute('data-bs-parent', '#webhook-log-list');

        // Create body content
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'accordion-body';

        // Format JSON with syntax highlighting if possible
        const formattedJson = JSON.stringify(event, null, 2);
        bodyDiv.innerHTML = `<pre class="mb-0"><code>${escapeHtml(formattedJson)}</code></pre>`;

        // Assemble the components
        header.appendChild(button);
        collapseDiv.appendChild(bodyDiv);
        accordionItem.appendChild(header);
        accordionItem.appendChild(collapseDiv);

        // Insert at the top of the list (latest events first)
        if (webhookLogList.firstChild) {
            webhookLogList.insertBefore(accordionItem, webhookLogList.firstChild);
        } else {
            webhookLogList.appendChild(accordionItem);
        }

        // Limit the number of items to prevent performance issues
        const maxItems = 50;
        while (webhookLogList.children.length > maxItems) {
            webhookLogList.removeChild(webhookLogList.lastChild!);
        }
    }
};

// Listen to events from openvidu-meet
const listenWebComponentEvents = () => {
    const meet = document.querySelector('openvidu-meet') as any;
    if (!meet) {
        console.error('openvidu-meet component not found');
        alert('openvidu-meet component not found in the DOM');
        return;
    }

    meet.on('JOINED', (event: CustomEvent<any>) => {
        console.log('JOINED event received:', event);
        addEventToLog('JOINED', JSON.stringify(event));
    });
    meet.on('LEFT', (event: CustomEvent<any>) => {
        console.log('LEFT event received:', event);
        addEventToLog('LEFT', JSON.stringify(event));
    });
    meet.on('MEETING_ENDED', (event: CustomEvent<any>) => {
        console.log('MEETING_ENDED event received:', event);
        addEventToLog('MEETING_ENDED', JSON.stringify(event));
    });
    meet.on('CLOSED', (event: CustomEvent<any>) => {
        console.log('CLOSED event received:', event);
        addEventToLog('CLOSED', JSON.stringify(event));

        // Redirect to home page
        // window.location.href = '/';
    });
};

// Set up commands for the web component
const setUpWebComponentCommands = () => {
    if (!meet) {
        console.error('openvidu-meet component not found');
        alert('openvidu-meet component not found in the DOM');
        return;
    }

    // End meeting button click handler
    document.getElementById('end-meeting-btn')?.addEventListener('click', () => meet.endMeeting());

    // Leave room button click handler
    document.getElementById('leave-room-btn')?.addEventListener('click', () => meet.leaveRoom());

    // Kick participant button click handler
    document.getElementById('kick-participant-btn')?.addEventListener('click', () => {
        const participantIdentity = (
            document.getElementById('participant-identity-input') as HTMLInputElement
        ).value.trim();
        if (participantIdentity) {
            meet.kickParticipant(participantIdentity);
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    roomId = document.getElementById('room-id')?.textContent?.trim();
    showAllWebhooksCheckbox = document.getElementById('show-all-webhooks') as HTMLInputElement;
    meet = document.querySelector('openvidu-meet') as any;

    if (!roomId) {
        console.error('Room ID not found in the DOM');
        alert('Room ID not found in the DOM');
        return;
    }

    renderStoredWebhookEvents(roomId);
    listenWebhookServerEvents();
    listenWebComponentEvents();
    setUpWebComponentCommands();

    showAllWebhooksCheckbox?.addEventListener('change', () => {
        if (roomId) renderStoredWebhookEvents(roomId);
    });
});
