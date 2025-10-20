// Get references to HTML elements
const form = document.getElementById('create-room-form');
const input = document.getElementById('roomName');
const button = document.getElementById('createRoomBtn');
const errorMessage = document.getElementById('error-message');

// Handle form changes to enable/disable button
input.addEventListener('input', () => {
    const hasValue = input.value.trim() !== '';
    button.disabled = !hasValue;

    if (hasValue) {
        errorMessage.textContent = '';
        errorMessage.hidden = true;
    } else {
        errorMessage.textContent = 'Room name is required.';
        errorMessage.hidden = false;
    }
});

// Handle form submission
form.addEventListener('submit', (event) => {
    event.preventDefault();
    createRoom();
});

// Function to create a new room by calling the backend API
async function createRoom() {
    // Clear previous error message
    errorMessage.textContent = '';
    errorMessage.hidden = true;

    try {
        const roomName = input.value;
        const { room } = await httpRequest('POST', '/rooms', {
            roomName
        });

        // Redirect to the newly created room
        window.location.href = room.moderatorUrl;
    } catch (error) {
        console.error('Error creating room:', error.message);
        errorMessage.textContent = 'Error creating room';
        errorMessage.hidden = false;
    }
}

// Function to make HTTP requests to the backend
async function httpRequest(method, path, body) {
    const response = await fetch(path, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const responseBody = await response.json();

    if (!response.ok) {
        throw new Error(responseBody.message || 'Failed to perform request to backend');
    }

    return responseBody;
}
