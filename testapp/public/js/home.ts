import { formatDate as formatDateUtil, getRelativeTimeString as getRelativeTimeStringUtil } from '../../utils/common.js';

/**
 * Interface for room data
 */
interface Room {
  roomId: string;
  roomIdPrefix: string;
  moderatorRoomUrl: string;
  publisherRoomUrl: string;
  viewerRoomUrl: string;
  createdAt: number;
  autoDeletionDate: number;
}

document.addEventListener('DOMContentLoaded', () => {
  setupRoomElements();
  setupFormValidation();
});

/**
 * Set up dynamic room elements and event handlers
 */
function setupRoomElements(): void {
  // Format dates in the room cards
  document.querySelectorAll('[data-timestamp]').forEach((element) => {
    const timestamp = parseInt(element.getAttribute('data-timestamp') || '0', 10);
    if (timestamp > 0) {
      element.textContent = formatDateUtil(timestamp);
    }
  });

  // Set relative time for room creation
  document.querySelectorAll('[data-created-at]').forEach((element) => {
    const timestamp = parseInt(element.getAttribute('data-created-at') || '0', 10);
    if (timestamp > 0) {
      element.textContent = getRelativeTimeStringUtil(timestamp);
    }
  });

  // Initialize copy URL buttons
  document.querySelectorAll('.copy-url-btn').forEach((button) => {
    button.addEventListener('click', (event) => handleCopyUrl(event as MouseEvent));
  });
}

/**
 * Handle click event for copying URLs
 */
function handleCopyUrl(event: MouseEvent): void {
  const button = event.currentTarget as HTMLButtonElement;
  const url = button.getAttribute('data-url');

  if (url) {
    navigator.clipboard.writeText(url).then(
      () => {
        // Show success feedback
        const originalText = button.textContent || '';
        button.textContent = 'Copied!';
        button.classList.add('copied');

        // Reset button text after 2 seconds
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('copied');
        }, 2000);
      },
      (err) => {
        console.error('Failed to copy text: ', err);
      }
    );
  }
}

/**
 * Set up form validation for the create room form
 */
function setupFormValidation(): void {
  const createRoomForm = document.getElementById('create-room-form') as HTMLFormElement | null;

  if (createRoomForm) {
    createRoomForm.addEventListener('submit', (event) => {
      const roomIdPrefixInput = document.getElementById('roomIdPrefix') as HTMLInputElement;
      const autoDeletionDateInput = document.getElementById('autoDeletionDate') as HTMLInputElement;

      // Basic validation
      if (!roomIdPrefixInput.value.trim()) {
        event.preventDefault();
        alert('Please enter a room prefix');
        return;
      }

      if (!autoDeletionDateInput.value) {
        event.preventDefault();
        alert('Please select an auto deletion date');
        return;
      }

      // Set minimum date to today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(autoDeletionDateInput.value);

      if (selectedDate < today) {
        event.preventDefault();
        alert('Auto deletion date must be today or in the future');
      }
    });
  }

  // Set minimum date for the date picker to today
  const autoDeletionDateInput = document.getElementById('autoDeletionDate') as HTMLInputElement;
  if (autoDeletionDateInput) {
    const today = new Date().toISOString().split('T')[0];
    autoDeletionDateInput.min = today;
  }
}