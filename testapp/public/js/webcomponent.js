"use strict";
const socket = window.io();
let meet;
let roomId;
let showAllWebhooksCheckbox;
/**
 * Add a component event to the events log
 */
const addEventToLog = (eventType, eventMessage) => {
    const eventsList = document.getElementById('events-list');
    if (eventsList) {
        const li = document.createElement('li');
        li.className = `event-${eventType}`;
        li.textContent = `[ ${eventType} ] : ${eventMessage}`;
        eventsList.insertBefore(li, eventsList.firstChild);
    }
};
const escapeHtml = (unsafe) => {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};
const getWebhookEventsFromStorage = (roomId) => {
    const data = localStorage.getItem('webhookEventsByRoom');
    if (!data) {
        return [];
    }
    const map = JSON.parse(data);
    return map[roomId] || [];
};
const saveWebhookEventToStorage = (roomId, event) => {
    const data = localStorage.getItem('webhookEventsByRoom');
    const map = data ? JSON.parse(data) : {};
    if (!map[roomId]) {
        map[roomId] = [];
    }
    map[roomId].push(event);
    localStorage.setItem('webhookEventsByRoom', JSON.stringify(map));
};
const clearWebhookEventsByRoom = (roomId) => {
    const data = localStorage.getItem('webhookEventsByRoom');
    if (!data)
        return;
    const map = JSON.parse(data);
    if (map[roomId]) {
        map[roomId] = [];
        localStorage.setItem('webhookEventsByRoom', JSON.stringify(map));
    }
};
const shouldShowWebhook = (event) => {
    return (showAllWebhooksCheckbox === null || showAllWebhooksCheckbox === void 0 ? void 0 : showAllWebhooksCheckbox.checked) || event.data.roomId === roomId;
};
const listenWebhookServerEvents = () => {
    socket.on('webhookEvent', (event) => {
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
        if (isMeetingEnded)
            clearWebhookEventsByRoom(webhookRoomId);
    });
};
const renderStoredWebhookEvents = (roomId) => {
    const webhookLogList = document.getElementById('webhook-log-list');
    if (webhookLogList) {
        while (webhookLogList.firstChild) {
            webhookLogList.removeChild(webhookLogList.firstChild);
        }
    }
    const events = getWebhookEventsFromStorage(roomId);
    events.forEach((event) => addWebhookEventElement(event));
};
const addWebhookEventElement = (event) => {
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
        }
        else {
            webhookLogList.appendChild(accordionItem);
        }
        // Limit the number of items to prevent performance issues
        const maxItems = 50;
        while (webhookLogList.children.length > maxItems) {
            webhookLogList.removeChild(webhookLogList.lastChild);
        }
    }
};
// Listen to events from openvidu-meet
const listenWebComponentEvents = () => {
    const meet = document.querySelector('openvidu-meet');
    if (!meet) {
        console.error('openvidu-meet component not found');
        alert('openvidu-meet component not found in the DOM');
        return;
    }
    meet.on('joined', (event) => {
        console.log('"joined" event received:', event);
        addEventToLog('joined', JSON.stringify(event));
    });
    meet.on('left', (event) => {
        console.log('"left" event received:', event);
        addEventToLog('left', JSON.stringify(event));
    });
    meet.on('closed', (event) => {
        console.log('"closed" event received:', event);
        addEventToLog('closed', JSON.stringify(event));
        // Redirect to home page
        // window.location.href = '/';
    });
};
// Set up commands for the web component
const setUpWebComponentCommands = () => {
    var _a, _b, _c;
    if (!meet) {
        console.error('openvidu-meet component not found');
        alert('openvidu-meet component not found in the DOM');
        return;
    }
    // End meeting button click handler
    (_a = document.getElementById('end-meeting-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', () => meet.endMeeting());
    // Leave room button click handler
    (_b = document.getElementById('leave-room-btn')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', () => meet.leaveRoom());
    // Kick participant button click handler
    (_c = document.getElementById('kick-participant-btn')) === null || _c === void 0 ? void 0 : _c.addEventListener('click', () => {
        const participantIdentity = document.getElementById('participant-identity-input').value.trim();
        if (participantIdentity) {
            meet.kickParticipant(participantIdentity);
        }
    });
};
document.addEventListener('DOMContentLoaded', () => {
    var _a, _b;
    roomId = (_b = (_a = document.getElementById('room-id')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
    showAllWebhooksCheckbox = document.getElementById('show-all-webhooks');
    meet = document.querySelector('openvidu-meet');
    if (!roomId) {
        console.error('Room ID not found in the DOM');
        alert('Room ID not found in the DOM');
        return;
    }
    renderStoredWebhookEvents(roomId);
    listenWebhookServerEvents();
    listenWebComponentEvents();
    setUpWebComponentCommands();
    showAllWebhooksCheckbox === null || showAllWebhooksCheckbox === void 0 ? void 0 : showAllWebhooksCheckbox.addEventListener('change', () => {
        if (roomId)
            renderStoredWebhookEvents(roomId);
    });
});
