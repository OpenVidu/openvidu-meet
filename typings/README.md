# @types/openvidu-meet

This library contains common TypeScript declaration files (types) used by the OpenVidu Meet application. It is a shared library that provides type definitions used by both the frontend and backend of the application.

## Build

Since this library contains only TypeScript declaration files (.d.ts), no compilation is needed. To validate the type definitions, run:

```bash
npm install
npm run validate
```

## Development

For development purposes, the declaration files can be edited directly. To validate changes:

```bash
npm run validate
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
