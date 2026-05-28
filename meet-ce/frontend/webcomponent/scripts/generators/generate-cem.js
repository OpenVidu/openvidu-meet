const fs = require('fs');
const path = require('path');
const { openViduMeetContract } = require('../../contracts/openvidu-meet.contract');

/**
 * Converts contract events to CEM event schema.
 * @param {import('../../contracts/openvidu-meet.contract').ContractEvent[]} events
 * @returns {Array<object>}
 */
function toCemEvents(events) {
  return events.map((eventDef) => ({
    name: eventDef.name,
    description: eventDef.description,
    type: {
      text: `CustomEvent<${eventDef.detailTypeName}>`,
    },
  }));
}

/**
 * Converts contract methods to CEM method schema.
 * @param {import('../../contracts/openvidu-meet.contract').ContractMethod[]} methods
 * @returns {Array<object>}
 */
function toCemMethods(methods) {
  return methods.map((method) => ({
    name: method.name,
    description: method.description,
    return: { type: method.returnType },
    parameters: (method.params || []).map((p) => ({
      name: p.name,
      type: { text: p.type },
      description: p.description,
    })),
    privacy: 'public',
  }));
}

/**
 * Converts contract properties to CEM members and attributes.
 * @param {import('../../contracts/openvidu-meet.contract').ContractProperty[]} properties
 * @returns {{ members: Array<object>, attributes: Array<object> }}
 */
function toCemProperties(properties) {
  const members = properties.map((prop) => ({
    name: prop.name,
    type: { text: prop.type },
    description: prop.description,
    privacy: 'public',
    kind: 'field',
  }));

  const attributes = properties
    .filter((prop) => Boolean(prop.attribute))
    .map((prop) => ({
      name: prop.attribute,
      fieldName: prop.name,
      description: prop.description,
    }));

  return { members, attributes };
}

/**
 * Builds a Custom Elements Manifest (CEM) from the contract.
 * @returns {object}
 */
function createCem() {
  const contract = openViduMeetContract;
  const { members, attributes } = toCemProperties(contract.properties);

  return {
    schemaVersion: '1.0.0',
    readme: 'README-webcomponent.md',
    modules: [
      {
        kind: 'javascript-module',
        path: 'dist/openvidu-meet-wc.js',
        declarations: [
          {
            kind: 'class',
            name: contract.elementInterfaceName,
            description: `Public custom element class contract for <${contract.tagName}>.`,
            tagName: contract.tagName,
            customElement: true,
            members,
            methods: toCemMethods(contract.methods),
            attributes,
            events: toCemEvents(contract.events),
            slots: [
              {
                name: 'toolbar',
                description: 'Replaces the default toolbar with custom content.',
              },
              {
                name: 'main',
                description: 'Replaces the main meeting area content.',
              },
            ],
          },
        ],
        exports: [
          {
            kind: 'custom-element-definition',
            name: contract.tagName,
            declaration: {
              name: contract.elementInterfaceName,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Writes the CEM JSON to dist/.
 */
function generateCem() {
  const root = path.resolve(__dirname, '..', '..');
  const distDir = path.join(root, 'dist');
  fs.mkdirSync(distDir, { recursive: true });

  const cemPath = path.join(distDir, 'custom-elements.json');
  const cem = createCem();
  fs.writeFileSync(cemPath, JSON.stringify(cem, null, 2) + '\n', 'utf8');
  console.log(`[cem] wrote ${path.relative(root, cemPath)}`);
}

if (require.main === module) {
  generateCem();
}

module.exports = { generateCem };
