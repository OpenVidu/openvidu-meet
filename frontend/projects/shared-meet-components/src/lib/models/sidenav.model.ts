export interface ConsoleNavLink {
	label: string;     // Link name
	icon?: string;     // Optional icon
	route?: string;    // Route for navigation (optional)
	clickHandler?: () => void; // Function to handle clicks (optional)
  }
