const fs = require('fs');
const path = require('path');
const { openViduMeetContract } = require('../../contracts/openvidu-meet.contract');

/**
 * Renders optional marker for TypeScript properties.
 * @param {boolean | undefined} optional
 * @returns {string}
 */
function asOptional(optional) {
  return optional ? '?' : '';
}

/**
 * Builds a TypeScript interface body from event fields.
 * @param {import('../../contracts/openvidu-meet.contract').ContractEventField[]} fields
 * @returns {string}
 */
function renderEventFields(fields) {
  if (fields.length === 0) return '';
  return fields
    .map((field) => {
      return [
        `  /** ${field.description} */`,
        `  ${field.name}${asOptional(field.optional)}: ${field.type};`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Renders TypeScript method signature including optional parameters.
 * When the method defines a `rawSignature`, it is used verbatim.
 * @param {import('../../contracts/openvidu-meet.contract').ContractMethod} method
 * @returns {string}
 */
function renderMethodSignature(method) {
  if (method.rawSignature) {
    return `  ${method.rawSignature};`;
  }
  const params = (method.params || [])
    .map((p) => `${p.name}: ${p.type}`)
    .join(', ');
  return `  ${method.name}(${params}): ${method.returnType};`;
}

/**
 * Builds the event payload map and event name union type from contract events.
 * These are used to type the on/once/off convenience methods.
 *
 * @param {import('../../contracts/openvidu-meet.contract').WebComponentContract} contract
 * @returns {string}
 */
function renderEventPayloadMap(contract) {
  const entries = contract.events
    .map((e) => `  '${e.name}': ${e.detailTypeName};`)
    .join('\n');

  return [
    `/** Maps every public event name to its \`CustomEvent.detail\` type. */`,
    `export interface ${contract.elementInterfaceName}PayloadMap {`,
    entries,
    `}`,
    '',
    `/** Union of all public event names emitted by \`<${contract.tagName}>\`. */`,
    `export type ${contract.elementInterfaceName}EventName = keyof ${contract.elementInterfaceName}PayloadMap;`,
  ].join('\n');
}

/**
 * Creates framework-agnostic TypeScript declarations from the contract.
 *
 * Output includes:
 * - Event detail interfaces
 * - Public props interface
 * - Public element interface
 * - Global HTMLElementTagNameMap augmentation
 *
 * @returns {string}
 */
function createGlobalTypes() {
  const contract = openViduMeetContract;

  // Alias names used in rawSignature fields of on/once/off
  const payloadMapAlias = `${contract.elementInterfaceName}PayloadMap`;
  const eventNameAlias = `${contract.elementInterfaceName}EventName`;

  const eventInterfaces = contract.events
    .map((eventDef) => {
      const body = renderEventFields(eventDef.fields);
      return [
        `/** ${eventDef.description} */`,
        `export interface ${eventDef.detailTypeName} {`,
        body,
        `}`,
      ].join('\n');
    })
    .join('\n\n');

  const methods = contract.methods
    .map((method) => {
      // For rawSignature methods, substitute the generic alias names from the contract
      // so they resolve within the same file. No JSDoc params for generic methods.
      if (method.rawSignature) {
        const resolvedSig = method.rawSignature
          .replace(/OpenViduMeetEventPayloadMap/g, payloadMapAlias)
          .replace(/OpenViduMeetEventName/g, eventNameAlias);
        return `  /** ${method.description} */\n  ${resolvedSig};`;
      }
      const jsDocParams = (method.params || [])
        .map((p) => `   * @param ${p.name} ${p.description}`)
        .join('\n');
      const jsDoc = jsDocParams
        ? `  /**\n   * ${method.description}\n${jsDocParams}\n   */`
        : `  /** ${method.description} */`;
      return `${jsDoc}\n${renderMethodSignature(method)}`;
    })
    .join('\n\n');

  const typedListeners = contract.events
    .map((eventDef) => {
      return `  addEventListener(type: '${eventDef.name}', listener: (ev: CustomEvent<${eventDef.detailTypeName}>) => void, options?: boolean | AddEventListenerOptions): void;`;
    })
    .join('\n');

  return [
    '/**',
    ` * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.`,
    ` * Source: contracts/openvidu-meet.contract.js`,
    ' */',
    '',
    // Public property shape is sourced from the shared typings package instead of
    // re-declaring it here, so the element interface stays in sync with @openvidu-meet/typings.
    `import type { EmbeddedPropertyValues } from '@openvidu-meet/typings';`,
    '',
    eventInterfaces,
    '',
    renderEventPayloadMap(contract),
    '',
    `/** Public DOM interface for \`<${contract.tagName}>\`. */`,
    `export interface ${contract.elementInterfaceName} extends HTMLElement, EmbeddedPropertyValues {`,
    methods,
    '',
    '  /** Standard DOM listener overloads */',
    '  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;',
    typedListeners,
    '  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;',
    '}',
    '',
    'declare global {',
    '  interface HTMLElementTagNameMap {',
    `    '${contract.tagName}': ${contract.elementInterfaceName};`,
    '  }',
    '}',
    '',
    `export type ${contract.elementInterfaceName}TagName = '${contract.tagName}';`,
    '',
  ].join('\n');
}

/**
 * Creates a React JSX augmentation declaration from the same base contract.
 *
 * @returns {string}
 */
function createReactJsxTypes() {
  const contract = openViduMeetContract;

  const events = contract.events
    .map((eventDef) => {
      return `        ${eventDef.reactName}?: (event: CustomEvent<${eventDef.detailTypeName}>) => void;`;
    })
    .join('\n');

  const props = contract.properties
    .flatMap((prop) => {
      const lines = [`        ${prop.name}?: ${prop.type};`];
      if (prop.attribute && prop.attribute !== prop.name) {
        lines.push(`        '${prop.attribute}'?: ${prop.type};`);
      }
      return lines;
    })
    .join('\n');

  const eventTypeImports = contract.events.map((e) => e.detailTypeName);

  return [
    '/**',
    ` * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.`,
    ` * Source: contracts/openvidu-meet.contract.js`,
    ' */',
    '',
    "import * as React from 'react';",
    `import type { ${contract.elementInterfaceName}, ${eventTypeImports.join(', ')} } from './openvidu-meet';`,
    '',
    `type ${contract.elementInterfaceName}HostProps = React.DOMAttributes<${contract.elementInterfaceName}> & React.AriaAttributes & {`,
    '  class?: string;',
    '  className?: string;',
    '  style?: React.CSSProperties;',
    '  id?: string;',
    '  title?: string;',
    '  role?: React.AriaRole;',
    '  tabIndex?: number;',
    '  slot?: string;',
    '  part?: string;',
    '  hidden?: boolean;',
    '  lang?: string;',
    '  dir?: string;',
    '  children?: React.ReactNode;',
    `  ref?: React.Ref<${contract.elementInterfaceName}>;`,
    '  key?: React.Key;',
    '  [dataAttr: `data-${string}`]: string | number | boolean | undefined;',
    '};',
    '',
    'declare global {',
    '  namespace JSX {',
    '    interface IntrinsicElements {',
    `      '${contract.tagName}': ${contract.elementInterfaceName}HostProps & {`,
    props,
    events,
    '      };',
    '    }',
    '  }',
    '}',
    '',
    'export {};',
    '',
  ].join('\n');
}

/**
 * Writes generated declaration files to both `dist/` and source-consumption paths.
 */
function generateTypes() {
  const root = path.resolve(__dirname, '..', '..');
  const distTypesDir = path.join(root, 'dist', 'types');
  const sourceTypesDir = path.join(root, 'src', 'webcomponents-types');

  fs.mkdirSync(distTypesDir, { recursive: true });
  fs.mkdirSync(sourceTypesDir, { recursive: true });

  const globalTypes = createGlobalTypes();
  const reactJsxTypes = createReactJsxTypes();

  const globalTypesPath = path.join(distTypesDir, 'openvidu-meet.d.ts');
  const reactJsxTypesPath = path.join(distTypesDir, 'openvidu-meet-react-jsx.d.ts');
  const sourceGlobalTypesPath = path.join(sourceTypesDir, 'openvidu-meet.d.ts');

  fs.writeFileSync(globalTypesPath, globalTypes, 'utf8');
  fs.writeFileSync(reactJsxTypesPath, reactJsxTypes, 'utf8');
  fs.writeFileSync(sourceGlobalTypesPath, globalTypes, 'utf8');

  console.log(`[types] wrote ${path.relative(root, globalTypesPath)}`);
  console.log(`[types] wrote ${path.relative(root, reactJsxTypesPath)}`);
  console.log(`[types] wrote (mirror) ${path.relative(root, sourceGlobalTypesPath)}`);
}

if (require.main === module) {
  generateTypes();
}

module.exports = { generateTypes };
