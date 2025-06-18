# @types/openvidu-meet

This library contains common types used by the OpenVidu Meet application. It is a shared library that is used by both the frontend and backend of the application.

## Build

To build the library, run the following command:

```bash
npm install
npm run build
```

## Serve

For developing purposes, you can serve the library for actively watching changes. To do so, run the following command:

```bash
npm run serve
```

## Sync with OpenVidu Meet

To apply changes from this library to the OpenVidu Meet application, use the `sync-types.sh` script:

### Basic Usage

```bash
# Sync to all targets (default)
./sync-types.sh

# Sync to Community Edition targets only
./sync-types.sh ce

# Sync to Professional Edition target only
./sync-types.sh pro

# Sync to a specific target
./sync-types.sh frontend
```

### Advanced Options

```bash
# Show what would be done without actually doing it
./sync-types.sh --dry-run ce

# Verbose output
./sync-types.sh --verbose frontend

# Add headers to source files and sync
./sync-types.sh --add-headers

# List all available targets
./sync-types.sh --list-targets

# Show help
./sync-types.sh --help
```

### Available Targets

- `frontend`: Frontend shared components
- `backend`: Backend types
- `webcomponent`: Web component types
- `pro`: Professional edition types

### Legacy NPM Commands

For compatibility, you can still use:

```bash
npm run sync-ce
```
