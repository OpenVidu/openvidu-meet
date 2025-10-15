# @openvidu-meet/typings

Shared TypeScript type definitions for the OpenVidu Meet monorepo.

## 📦 Package Structure

```
typings/
├── src/              # ✏️ Source TypeScript files (.ts only)
│   ├── index.ts      # Main export barrel
│   ├── room-config.ts
│   ├── user.ts
│   └── ...
│
├── dist/             # 📦 Compiled output (generated, DO NOT EDIT)
│   ├── index.d.ts    # Type definitions
│   ├── index.js      # Transpiled JavaScript
│   ├── index.js.map  # Source maps
│   └── ...
│
├── package.json      # Package configuration
├── tsconfig.json     # Base TypeScript config
└── tsconfig.build.json  # Build-specific config
```

## 🛠️ Development

### Build the package
```bash
pnpm run build
```
This compiles `src/*.ts` → `dist/*.{d.ts,js,js.map}`

### Watch mode (during development)
```bash
pnpm run dev
```
Auto-recompiles when you change files in `src/`

### Clean build artifacts
```bash
pnpm run clean
```
Removes the `dist/` directory

## 📝 Adding New Types

1. Create your `.ts` file in `src/`
   ```typescript
   // src/my-new-type.ts
   export interface MyNewType {
     id: string;
     name: string;
   }
   ```

2. Export it from `src/index.ts`
   ```typescript
   export * from './my-new-type.js';
   ```
   **Note**: Use `.js` extension in imports (ESM requirement)

3. Build the package
   ```bash
   pnpm run build
   ```

4. The types are now available to all workspaces:
   ```typescript
   import { MyNewType } from '@openvidu-meet/typings';
   ```


## 🔗 Usage in Workspaces

All workspaces (backend, frontend, webcomponent) depend on this package:

```json
{
  "dependencies": {
    "@openvidu-meet/typings": "workspace:*"
  }
}
```

The `workspace:*` protocol tells pnpm to use the local workspace version.

