export interface ConsoleNavLink {
	label: string; // Link name
	icon?: string; // Optional icon
	iconClass?: string; // Optional icon CSS class
	route?: string; // Route for navigation (optional)
	clickHandler?: () => void; // Function to handle clicks (optional)
}
