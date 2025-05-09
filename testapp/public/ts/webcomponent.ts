const socket = (window as any).io();

/**
 * Add a component event to the events log
 */
const addEventToLog = (eventType: string, eventMessage: string): void => {
	const eventsList = document.getElementById('events-list');
	if (eventsList) {
		const li = document.createElement('li');
		li.textContent = `[ ${eventType} ] : ${eventMessage}`;
		eventsList.appendChild(li);
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
const listenWebhookServerEvents = () => {
	socket.on('webhookEvent', (payload: any) => {
		console.log('Webhook received:', payload);
		const webhookLogList = document.getElementById('webhook-log-list');
		if (webhookLogList) {
			// Create unique IDs for this accordion item
			const itemId = payload.creationDate;
			const headerId = `header-${itemId}`;
			const collapseId = `collapse-${itemId}`;

			// Create accordion item container
			const accordionItem = document.createElement('div');
			accordionItem.className = 'accordion-item';

			// Create header
			const header = document.createElement('h2');
			header.className = 'accordion-header';
			header.id = headerId;

			// Create header button
			const button = document.createElement('button');
			button.className = 'accordion-button';
			button.type = 'button';
			button.setAttribute('data-bs-toggle', 'collapse');
			button.setAttribute('data-bs-target', `#${collapseId}`);
			button.setAttribute('aria-expanded', 'true');
			button.setAttribute('aria-controls', collapseId);
			button.style.padding = '10px';

			if (payload.event === 'meetingStarted') {
				button.classList.add('bg-success');
			}
			if (payload.event === 'meetingEnded') {
				button.classList.add('bg-danger');
			}
			if (payload.event.includes('recording')) {
				button.classList.add('bg-warning');
			}
			// Format the header text with event name and timestamp
			const date = new Date(payload.creationDate);

			const formattedDate = date.toLocaleString('es-ES', {
				// year: 'numeric',
				// month: '2-digit',
				// day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false,
			});
			button.innerHTML = `[${formattedDate}] <strong>${payload.event}</strong>`;

			// Create collapsible content container
			const collapseDiv = document.createElement('div');
			collapseDiv.id = collapseId;
			collapseDiv.className = 'accordion-collapse collapse';
			collapseDiv.setAttribute('aria-labelledby', headerId);
			collapseDiv.setAttribute('data-bs-parent', '#webhook-log-list');

			// Create body content
			const bodyDiv = document.createElement('div');
			bodyDiv.className = 'accordion-body';

			// Format JSON with syntax highlighting if possible
			const formattedJson = JSON.stringify(payload, null, 2);
			bodyDiv.innerHTML = `<pre class="mb-0"><code>${escapeHtml(
				formattedJson
			)}</code></pre>`;

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
	});
};

// Listen to events from openvidu-meet

const listenWebComponentEvents = () => {
	const meet = document.querySelector('openvidu-meet') as any;
	if (!meet) {
		console.error('openvidu-meet component not found');
		alert('openvidu-meet component not found in the DOM');
		return;
	}

	meet.on('JOIN', (event: CustomEvent<any>) => {
		console.log('JOIN event received:', event);
		addEventToLog('JOIN', JSON.stringify(event));
	});
	meet.on('LEFT', (event: CustomEvent<any>) => {
		console.log('LEFT event received:', event);
		addEventToLog('LEFT', JSON.stringify(event));
	});
};

const setUpWebComponentCommands = () => {
	const meet = document.querySelector('openvidu-meet') as any;

	if (!meet) {
		console.error('openvidu-meet component not found');
		alert('openvidu-meet component not found in the DOM');
		return;
	}

	// End meeting button click handler
	document
		.getElementById('end-meeting-btn')
		?.addEventListener('click', () => meet.endMeeting());

	// Leave room button click handler
	document
		.getElementById('leave-room-btn')
		?.addEventListener('click', () => meet.leaveRoom());

	// Toggle chat button click handler
	document
		.getElementById('toggle-chat-btn')
		?.addEventListener('click', () => meet.toggleChat());
};

document.addEventListener('DOMContentLoaded', () => {
	listenWebhookServerEvents();
	listenWebComponentEvents();
	setUpWebComponentCommands();
});
