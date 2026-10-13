/**
 * Whether a key press may act as a meeting shortcut: once per press, never with a modifier and never
 * while the participant is typing somewhere. The typing check reads the element the key went to, which
 * inside a shadow root (the webcomponent's, or one of the host page's) is not the event's target.
 */
export const isShortcut = (event: Event): boolean => {
	const { repeat, ctrlKey, metaKey, altKey } = event as KeyboardEvent;
	const origin = event.composedPath()[0] as HTMLElement | undefined;
	const typing = origin?.isContentEditable || origin?.matches?.('input, textarea, select');

	return !repeat && !ctrlKey && !metaKey && !altKey && !typing;
};
