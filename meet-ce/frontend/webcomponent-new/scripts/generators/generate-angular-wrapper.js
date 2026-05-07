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
 * Renders a typed standalone Angular wrapper around the custom element.
 *
 * The generated component exposes:
 * - input() properties mirroring WC properties
 * - output() events mirroring WC CustomEvents
 * - imperative methods to match the DOM API
 *
 * @returns {string}
 */
function createOpenViduMeetAngularWrapperSource() {
  const c = openViduMeetContract;
  const wrapperName = `${toPascalCase(c.tagName)}Component`;

  const eventDetailImports = c.events.map((eventDef) => eventDef.detailTypeName).join(', ');

  // Extra types needed when any method uses rawSignature (e.g. generic on/once/off)
  const hasRawMethods = c.methods.some((m) => m.rawSignature);
  const extraTypeImports = hasRawMethods
    ? `, ${c.elementInterfaceName}PayloadMap, ${c.elementInterfaceName}EventName`
    : '';

  const inputSignals = c.properties
    .map((prop) => {
      return [
        `  /** ${prop.description} */`,
        `  readonly ${prop.name} = input<${prop.type}>();`,
      ].join('\n');
    })
    .join('\n\n');

  const outputSignals = c.events
    .map((eventDef) => {
      return [
        `  /** Emits the native \`${eventDef.name}\` CustomEvent. */`,
        `  readonly ${eventDef.name} = output<CustomEvent<${eventDef.detailTypeName}>>();`,
      ].join('\n');
    })
    .join('\n\n');

  const propertyAssignments = c.properties
    .map((prop) => {
      return [
        `      const ${prop.name}Val = this.${prop.name}();`,
        `      if (${prop.name}Val !== undefined) {`,
        `        el.${prop.name} = ${prop.name}Val;`,
        '      }',
      ].join('\n');
    })
    .join('\n\n');

  const eventListeners = c.events
    .map((eventDef) => {
      return [
        `      const on${toPascalCase(eventDef.name)} = (event: Event) => {`,
        `        this.${eventDef.name}.emit(event as CustomEvent<${eventDef.detailTypeName}>);`,
        '      };',
        `      el.addEventListener('${eventDef.name}', on${toPascalCase(eventDef.name)});`,
        `      disposers.push(() => el.removeEventListener('${eventDef.name}', on${toPascalCase(eventDef.name)}));`,
      ].join('\n');
    })
    .join('\n\n');

  // Alias map: contract-level type names → generated file type names
  const elementBase = c.elementInterfaceName; // e.g. 'OpenViduMeetElement'
  const contractAliases = {
    OpenViduMeetEventPayloadMap: `${elementBase}PayloadMap`,
    OpenViduMeetEventName: `${elementBase}EventName`,
  };

  /**
   * Resolves contract-level type aliases in rawSignature strings to their
   * generated counterparts so the emitted TypeScript file is self-consistent.
   * @param {string} sig
   * @returns {string}
   */
  function resolveAliases(sig) {
    return Object.entries(contractAliases).reduce(
      (acc, [from, to]) => acc.replace(new RegExp(from, 'g'), to),
      sig
    );
  }

  const imperativeMethods = c.methods
    .map((method) => {
      // Methods with rawSignature use generics — emit with the resolved signature
      // and forward all arguments to the native element.
      if (method.rawSignature) {
        const resolved = resolveAliases(method.rawSignature);
        // Extract just the parameter names from the signature for the call.
        // rawSignature format: "methodName<...>(p1: T1, p2?: T2): ReturnType"
        const paramSection = resolved.match(/\(([^)]*)\)/)?.[1] ?? '';
        const paramNames = paramSection
          .split(',')
          .map((p) => p.trim().split(/[:\s]/)[0].replace(/\?$/, ''))
          .filter(Boolean)
          .join(', ');
        return [
          `  /** ${method.description} */`,
          `  ${resolved} {`,
          `    return this.host()?.nativeElement?.${method.name}(${paramNames}) as any;`,
          '  }',
        ].join('\n');
      }

      const paramSignature = (method.params || []).map((p) => `${p.name}: ${p.type}`).join(', ');
      const paramNames = (method.params || []).map((p) => p.name).join(', ');
      return [
        `  /** ${method.description} */`,
        `  ${method.name}(${paramSignature}): ${method.returnType} {`,
        `    this.host()?.nativeElement?.${method.name}(${paramNames});`,
        '  }',
      ].join('\n');
    })
    .join('\n\n');

  // Attribute bindings for string properties: Angular sets these BEFORE appending
  // the element to the DOM, so they are readable in connectedCallback via getAttribute().
  // This is essential for configuration properties (e.g. server-url) that services
  // read during DI bootstrap — before afterNextRender or effect() callbacks fire.
  const eagerAttrBindings = c.properties
    .filter((p) => p.attribute && p.type === 'string')
    .map((p) => `[attr.${p.attribute}]="${p.name}() ?? null"`)
    .join(' ');

  return [
    '/**',
    ' * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.',
    ' * Source: contracts/openvidu-meet.contract.js',
    ' */',
    '',
    "import { ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, OnDestroy, afterNextRender, effect, input, output, viewChild } from '@angular/core';",
    `import type { ${c.elementInterfaceName}, ${eventDetailImports}${extraTypeImports} } from '../../types/openvidu-meet';`,
    '',
    '/**',
    ` * Typed Angular adapter for \`<${c.tagName}>\` with an ergonomic input/output API.`,
    ' */',
    '@Component({',
    `  selector: '${c.tagName}-angular',`,
    `  template: \`<${c.tagName} ${eagerAttrBindings} #host><ng-content /></${c.tagName}>\`,`,
    '  changeDetection: ChangeDetectionStrategy.OnPush,',
    '  schemas: [CUSTOM_ELEMENTS_SCHEMA],',
    '})',
    `export class ${wrapperName} implements OnDestroy {`,
    `  private readonly host = viewChild<ElementRef<${c.elementInterfaceName}>>('host');`,
    '  private readonly eventDisposers: Array<() => void> = [];',
    '',
    inputSignals,
    '',
    outputSignals,
    '',
    '  constructor() {',
    '    afterNextRender(() => {',
    '      const el = this.host()?.nativeElement;',
    '      if (!el) return;',
    '',
    '      // Assign initial property values',
    propertyAssignments,
    '',
    '      // Bind native events',
    '      const disposers = this.eventDisposers;',
    eventListeners,
    '    });',
    '',
    '    // Keep properties in sync when inputs change',
    '    effect(() => {',
    '      const el = this.host()?.nativeElement;',
    '      if (!el) return;',
    propertyAssignments,
    '    });',
    '  }',
    '',
    imperativeMethods,
    '',
    `  /** Returns the raw \`<${c.tagName}>\` custom element instance for advanced access. */`,
    `  element(): ${c.elementInterfaceName} | null {`,
    `    return this.host()?.nativeElement ?? null;`,
    `  }`,
    '',
    '  ngOnDestroy(): void {',
    '    this.eventDisposers.forEach((fn) => fn());',
    '    this.eventDisposers.length = 0;',
    '  }',
    '}',
    '',
    `export type * from '../../types/openvidu-meet';`,
    '',
  ].join('\n');
}

/**
 * Creates the barrel index.ts for the Angular wrapper package.
 * @returns {string}
 */
function createAngularWrapperIndex() {
  const c = openViduMeetContract;
  const wrapperName = `${toPascalCase(c.tagName)}Component`;
  return [
    '/**',
    ' * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.',
    ' * Source: contracts/openvidu-meet.contract.js',
    ' */',
    '',
    `export { ${wrapperName} } from './${c.tagName}-angular';`,
    `export type * from '../../types/openvidu-meet';`,
    '',
  ].join('\n');
}

/**
 * Writes the Angular wrapper to dist/wrappers/angular/.
 */
function generateAngularWrapper() {
  const root = path.resolve(__dirname, '..', '..');
  const outDir = path.join(root, 'dist', 'wrappers', 'angular');
  fs.mkdirSync(outDir, { recursive: true });

  const c = openViduMeetContract;
  const wrapperPath = path.join(outDir, `${c.tagName}-angular.ts`);
  const indexPath = path.join(outDir, 'index.ts');

  fs.writeFileSync(wrapperPath, createOpenViduMeetAngularWrapperSource(), 'utf8');
  fs.writeFileSync(indexPath, createAngularWrapperIndex(), 'utf8');

  console.log(`[angular-wrapper] wrote ${path.relative(root, wrapperPath)}`);
  console.log(`[angular-wrapper] wrote ${path.relative(root, indexPath)}`);
}

if (require.main === module) {
  generateAngularWrapper();
}

module.exports = { generateAngularWrapper };
