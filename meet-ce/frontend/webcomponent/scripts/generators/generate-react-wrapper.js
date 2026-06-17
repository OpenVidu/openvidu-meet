const fs = require('fs');
const path = require('path');
const { openViduMeetContract } = require('../../contracts/openvidu-meet.contract');

/**
 * Converts kebab-case or dash separated names to PascalCase.
 * @param {string} text
 * @returns {string}
 */
function toPascalCase(text) {
  return text
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Generates a reusable runtime helper to adapt Custom Events and properties
 * to React idiomatic props.
 * @returns {string}
 */
function createReactRuntimeSource() {
  return [
    '/**',
    ' * AUTO-GENERATED RUNTIME FILE. DO NOT EDIT MANUALLY.',
    ' *',
    ' * Generic React adapter for Web Components:',
    ' * - Assigns incoming props as DOM properties when possible.',
    ' * - Binds native CustomEvent listeners via addEventListener.',
    ' * - Exposes the underlying element through forwardRef.',
    ' */',
    "import * as React from 'react';",
    '',
    'export type WcEventMap = Record<string, string>;',
    '',
    'export interface CreateWcWrapperConfig<TElement extends HTMLElement, TProps extends object> {',
    '  tagName: string;',
    '  displayName: string;',
    '  eventMap?: WcEventMap;',
    '  propertyKeys?: Array<keyof TProps>;',
    '}',
    '',
    'function isEventHandlerProp(name: string): boolean {',
    "  return name.startsWith('on') && name.length > 2;",
    '}',
    '',
    'function isPrimitive(value: unknown): boolean {',
    "  return value === null || ['string', 'number', 'boolean'].includes(typeof value);",
    '}',
    '',
    'export function createWcWrapper<TElement extends HTMLElement, TProps extends object>(',
    '  config: CreateWcWrapperConfig<TElement, TProps>',
    '): React.ForwardRefExoticComponent<React.PropsWithoutRef<TProps> & React.RefAttributes<TElement>> {',
    '  const { tagName, displayName, eventMap = {}, propertyKeys = [] } = config;',
    '  const eventPropNames = Object.keys(eventMap);',
    '',
    '  const Component = React.forwardRef<TElement, TProps & React.HTMLAttributes<TElement>>((props, ref) => {',
    '    const elementRef = React.useRef<TElement | null>(null);',
    '    React.useImperativeHandle(ref, () => elementRef.current as TElement, []);',
    '',
    '    const eventHandlerDeps = eventPropNames.map((propName) => (props as Record<string, unknown>)[propName]);',
    '',
    '    React.useEffect(() => {',
    '      const el = elementRef.current;',
    '      if (!el) return;',
    '      const cleanupFns: Array<() => void> = [];',
    '      for (const [propName, eventName] of Object.entries(eventMap)) {',
    '        const maybeHandler = (props as Record<string, unknown>)[propName];',
    '        if (typeof maybeHandler !== "function") continue;',
    '        const listener = (evt: Event) => { (maybeHandler as (e: Event) => void)(evt); };',
    '        el.addEventListener(eventName, listener);',
    '        cleanupFns.push(() => el.removeEventListener(eventName, listener));',
    '      }',
    '      return () => { cleanupFns.forEach((fn) => fn()); };',
    '    }, eventHandlerDeps); // eslint-disable-line react-hooks/exhaustive-deps',
    '',
    '    const propertyDeps = propertyKeys.map((key) => (props as Record<string, unknown>)[String(key)]);',
    '    React.useEffect(() => {',
    '      const el = elementRef.current;',
    '      if (!el) return;',
    '      for (const key of propertyKeys) {',
    '        const value = (props as Record<string, unknown>)[String(key)];',
    '        if (value === undefined) continue;',
    '        (el as Record<string, unknown>)[String(key)] = value;',
    '      }',
    '    }, propertyDeps); // eslint-disable-line react-hooks/exhaustive-deps',
    '',
    '    const nativeProps: Record<string, unknown> = {};',
    '    for (const [key, value] of Object.entries(props)) {',
    '      if (eventMap[key]) continue;',
    '      if (propertyKeys.includes(key as keyof TProps)) {',
    '        if (isPrimitive(value)) nativeProps[key] = value;',
    '        continue;',
    '      }',
    '      if (isEventHandlerProp(key)) continue;',
    '      nativeProps[key] = value;',
    '    }',
    '    return React.createElement(tagName, { ...nativeProps, ref: elementRef });',
    '  });',
    '',
    '  Component.displayName = displayName;',
    '  return Component as unknown as React.ForwardRefExoticComponent<React.PropsWithoutRef<TProps> & React.RefAttributes<TElement>>;',
    '}',
    '',
  ].join('\n');
}

/**
 * Generates the typed React wrapper component.
 * @returns {string}
 */
function createOpenViduMeetReactWrapperSource() {
  const c = openViduMeetContract;
  const componentName = toPascalCase(c.tagName);
  const eventDetailImports = c.events.map((e) => e.detailTypeName).join(', ');

  const props = c.properties
    .map((prop) =>
      [`  /** ${prop.description} */`, `  ${prop.name}?: ${prop.type};`].join('\n')
    )
    .join('\n\n');

  const eventProps = c.events
    .map((eventDef) =>
      [
        `  /** React callback alias for the native \`${eventDef.name}\` event. */`,
        `  ${eventDef.reactName}?: (event: CustomEvent<${eventDef.detailTypeName}>) => void;`,
      ].join('\n')
    )
    .join('\n\n');

  const eventMapEntries = c.events
    .map((eventDef) => `  ${eventDef.reactName}: '${eventDef.name}',`)
    .join('\n');

  const propKeys = c.properties.map((prop) => `  '${prop.name}',`).join('\n');

  const imperativeMethodsInterface = c.methods
    .map((method) => {
      const paramSignature = (method.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
      return `  /** ${method.description} */\n  ${method.name}(${paramSignature}): ${method.returnType};`;
    })
    .join('\n');

  const imperativeMethodsImpl = c.methods
    .map((method) => {
      const paramSignature = (method.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
      const paramNames = (method.params || []).map((p) => p.name).join(', ');
      return [
        `  /** ${method.description} */`,
        `  const ${method.name} = React.useCallback((${paramSignature}) => {`,
        `    ref.current?.${method.name}(${paramNames});`,
        '  }, []);',
      ].join('\n');
    })
    .join('\n\n');

  const imperativeMethodsReturn = c.methods.map((m) => `    ${m.name},`).join('\n');

  return [
    '/**',
    ` * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.`,
    ` * Source: contracts/openvidu-meet.contract.js`,
    ' */',
    '/// <reference path="../../types/openvidu-meet-react-jsx.d.ts" />',
    '',
    "import * as React from 'react';",
    "import { createWcWrapper } from './runtime';",
    `import type { ${c.elementInterfaceName}, ${eventDetailImports} } from '../../types/openvidu-meet';`,
    '',
    `/** Typed props for the React adapter of <${c.tagName}>. */`,
    `export interface ${componentName}Props {`,
    props,
    '',
    eventProps,
    '',
    '  /** Optional host css class. */',
    '  className?: string;',
    '  /** Optional host inline style. */',
    '  style?: React.CSSProperties;',
    '  /** Optional host id. */',
    '  id?: string;',
    '  /** Optional projected content rendered inside the web component. */',
    '  children?: React.ReactNode;',
    '}',
    '',
    'const eventMap = {',
    eventMapEntries,
    '} as const;',
    '',
    'const propertyKeys = [',
    propKeys,
    '] as const;',
    '',
    `export const ${componentName} = createWcWrapper<${c.elementInterfaceName}, ${componentName}Props>({`,
    `  tagName: '${c.tagName}',`,
    `  displayName: '${componentName}',`,
    '  eventMap,',
    `  propertyKeys: propertyKeys as unknown as Array<keyof ${componentName}Props>,`,
    '});',
    '',
    `/** Imperative controller interface for <${c.tagName}>. */`,
    `export interface ${componentName}Controller {`,
    `  ref: React.RefObject<${c.elementInterfaceName}>;`,
    `  element: () => ${c.elementInterfaceName} | null;`,
    imperativeMethodsInterface,
    '}',
    '',
    `/** React hook that creates a typed controller for \`<${c.tagName}>\`. */`,
    `export function use${componentName}Controller(): ${componentName}Controller {`,
    `  const ref = React.useRef<${c.elementInterfaceName}>(null);`,
    '  const element = React.useCallback(() => ref.current, []);',
    '',
    imperativeMethodsImpl,
    '',
    `  return { ref, element, ${c.methods.map((m) => m.name).join(', ')} };`,
    '}',
    '',
    `export default ${componentName};`,
    '',
  ].join('\n');
}

/**
 * Creates the barrel index for the React wrapper package.
 * @returns {string}
 */
function createReactIndexSource() {
  const c = openViduMeetContract;
  const name = toPascalCase(c.tagName);
  return [
    '/** AUTO-GENERATED FILE. DO NOT EDIT MANUALLY. */',
    `export { ${name}, use${name}Controller } from './${c.tagName}-react';`,
    `export type { ${name}Props, ${name}Controller } from './${c.tagName}-react';`,
    '',
  ].join('\n');
}

/**
 * Writes generated React wrapper sources to `dist/wrappers/react`.
 */
function generateReactWrapper() {
  const root = path.resolve(__dirname, '..', '..');
  const outDir = path.join(root, 'dist', 'wrappers', 'react');
  fs.mkdirSync(outDir, { recursive: true });

  const c = openViduMeetContract;
  const files = [
    { path: path.join(outDir, 'runtime.tsx'), content: createReactRuntimeSource() },
    { path: path.join(outDir, `${c.tagName}-react.tsx`), content: createOpenViduMeetReactWrapperSource() },
    { path: path.join(outDir, 'index.ts'), content: createReactIndexSource() },
  ];

  files.forEach((file) => {
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`[react-wrapper] wrote ${path.relative(root, file.path)}`);
  });
}

if (require.main === module) {
  generateReactWrapper();
}

module.exports = { generateReactWrapper };
