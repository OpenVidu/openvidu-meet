const fs = require('fs');
const path = require('path');

/**
 * Generates documentation for the OpenVidu Meet WebComponent
 */
class WebComponentDocGenerator {
    constructor() {
        // Single source of truth for the embedding API: the documented enums in the
        // shared typings package (attributes.ts / commands.ts / events.ts).
        this.typingsPath = path.join(__dirname, '../meet-ce/typings/src/embedded');
        // Where payload type names (interfaces, enums) are resolved from.
        this.typingsRoot = path.join(__dirname, '../meet-ce/typings/src');
        this.typeIndex = null;
        // Identifiers left out of the tables (private or deprecated), reported at the end.
        this.excluded = [];
    }

    /**
     * Indexes the flat exported interfaces and the string enums of the typings package by name,
     * rendered inline ("{ a?: false; b: string }" / "'x' | 'y'"). An interface whose body still
     * contains braces after comment stripping is not indexed: a reference to it must fail the
     * generation rather than render truncated.
     */
    getTypeIndex() {
        if (this.typeIndex) return this.typeIndex;

        this.typeIndex = new Map();

        for (const file of this.collectTypingsFiles(this.typingsRoot)) {
            const content = fs.readFileSync(file, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/.*$/gm, '');

            for (const match of content.matchAll(/export interface (\w+)(?:\s+extends\s+[^{]+)?\s*{([^{}]*)}/g)) {
                const [, name, body] = match;
                const props = [...body.matchAll(/(\w+\??)\s*:\s*([^;\n]+)/g)]
                    .map(([, key, type]) => `${key}: ${type.trim()}`);

                if (props.length > 0) this.typeIndex.set(name, `{ ${props.join('; ')} }`);
            }

            for (const match of content.matchAll(/export enum (\w+)\s*{([^}]*)}/g)) {
                const [, name, body] = match;
                const values = [...body.matchAll(/=\s*'([^']+)'/g)].map(([, value]) => `'${value}'`);

                if (values.length > 0) this.typeIndex.set(name, values.join(' | '));
            }
        }

        return this.typeIndex;
    }

    collectTypingsFiles(dir) {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return this.collectTypingsFiles(fullPath);
            return entry.name.endsWith('.ts') ? [fullPath] : [];
        });
    }

    /**
     * Replaces every type name in `type` with its inline shape from the typings, recursively
     * (an interface may reference an enum). A name that is neither a primitive nor resolvable
     * aborts the generation: the published reference must never show a type it does not define.
     * Union pipes are escaped because every rendering lands in a markdown table cell.
     */
    resolveTypeNames(type, context) {
        const PRIMITIVES = new Set([
            'string', 'number', 'boolean', 'true', 'false', 'void', 'null', 'undefined', 'any', 'unknown', 'object'
        ]);
        const index = this.getTypeIndex();
        const seen = new Set();
        let resolved = type;
        let changed = true;

        while (changed) {
            changed = false;
            resolved = resolved.replace(/\b[A-Za-z_]\w*\b/g, (name) => {
                if (PRIMITIVES.has(name) || seen.has(name) || !index.has(name)) return name;

                seen.add(name);
                changed = true;
                return index.get(name);
            });
        }

        const unquoted = resolved.replace(/'[^']*'/g, '');
        const unresolved = [...new Set(
            [...unquoted.matchAll(/\b([A-Z]\w*)\b/g)].map((match) => match[1]).filter((name) => !PRIMITIVES.has(name))
        )];

        if (unresolved.length > 0) {
            throw new Error(
                `Cannot render '${context}': type name(s) ${unresolved.join(', ')} are not defined in the ` +
                'generated reference and could not be resolved from the typings sources'
            );
        }

        return resolved.replace(/\|/g, '\\|');
    }

    /**
     * Reads and parses a TypeScript file to extract enum documentation
     */
    parseEnumFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        const enums = [];
        let currentEnum = null;
        let currentItem = null;
        let inEnum = false;
        let inComment = false;
        let commentLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Detect start of enum
            if (line.startsWith('export enum')) {
                inEnum = true;
                currentEnum = {
                    name: line.match(/export enum (\w+)/)[1],
                    items: []
                };
                continue;
            }

            // Detect end of enum
            if (inEnum && line === '}') {
                if (currentItem) {
                    currentEnum.items.push(currentItem);
                }
                enums.push(currentEnum);
                inEnum = false;
                currentEnum = null;
                currentItem = null;
                continue;
            }

            if (!inEnum) continue;

            // Handle multi-line comments
            if (line.startsWith('/**')) {
                inComment = true;
                commentLines = [];
                continue;
            }

            if (inComment) {
                if (line.endsWith('*/')) {
                    inComment = false;
                    continue;
                }

                // Extract comment content
                const commentContent = line.replace(/^\*\s?/, '').trim();
                if (commentContent) {
                    commentLines.push(commentContent);
                }
                continue;
            }

            // Parse enum item
            if (line.includes('=') && !line.startsWith('//')) {
                // Save previous item if exists
                if (currentItem) {
                    currentEnum.items.push(currentItem);
                }

                const match = line.match(/(\w+)\s*=\s*'([^']+)'/);
                if (match) {
                    // Extract @required text if present
                    const requiredComment = commentLines.find(c => c.includes('@required'));
                    let requiredText = '';
                    if (requiredComment) {
                        const requiredMatch = requiredComment.match(/@required\s*(.*)/);
                        requiredText = requiredMatch ? requiredMatch[1].trim() : '';
                    }

                    currentItem = {
                        name: match[1],
                        value: match[2],
                        description: commentLines.filter(line => !line.includes('@')).join(' '),
                        isPrivate: commentLines.some(c => c.includes('@private')),
                        isDeprecated: commentLines.some(c => c.includes('@deprecated')),
                        isModerator: commentLines.some(c => c.includes('@moderator')),
                        isPrejoin: commentLines.some(c => c.includes('@prejoin')),
                        isRequired: commentLines.some(c => c.includes('@required')),
                        requiredText: requiredText
                    };
                    commentLines = [];
                }
            }
        }

        return enums;
    }

    /**
     * Extracts payload information from interface definitions
     */
    extractPayloads(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        const payloads = {};

        // Find the payload interface
        const interfaceMatch = content.match(/export interface \w+Payloads\s*{([\s\S]*?)^}/m);
        if (!interfaceMatch) return payloads;

        const interfaceContent = interfaceMatch[1];
        const lines = interfaceContent.split('\n');

        let currentKey = null;
        let inComment = false;
        let commentLines = [];

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('/**')) {
                inComment = true;
                commentLines = [];
                continue;
            }

            if (inComment) {
                if (trimmed.endsWith('*/')) {
                    inComment = false;
                    continue;
                }

                const commentContent = trimmed.replace(/^\*\s?/, '').trim();
                if (commentContent && !commentContent.includes('@')) {
                    commentLines.push(commentContent);
                }
                continue;
            }

            // Parse payload property - looking for patterns like [EmbeddedEvent.JOIN]: {
            const propMatch = trimmed.match(/\[\w+\.(\w+)\]:\s*({[\s\S]*?}|[^,;]+)[,;]?/);
            if (propMatch) {
                const enumValue = propMatch[1];
                let type = propMatch[2].trim();

                // If it's a multi-line object, we need to collect the full definition
                if (type.startsWith('{') && !type.endsWith('}')) {
                    // Find the closing brace
                    let braceCount = 1;
                    let i = lines.indexOf(line) + 1;
                    while (i < lines.length && braceCount > 0) {
                        const nextLine = lines[i].trim();
                        type += '\n' + nextLine;
                        for (const char of nextLine) {
                            if (char === '{') braceCount++;
                            if (char === '}') braceCount--;
                        }
                        i++;
                    }
                }

                payloads[enumValue] = {
                    type: type.replace(/[,;]$/, ''), // Remove trailing comma or semicolon
                    description: commentLines.join(' ')
                };
                commentLines = [];
            }
        }

        return payloads;
    }

    /**
     * Generates markdown table for events (only public events)
     */
    generateEventsTable() {
        const enums = this.parseEnumFile(path.join(this.typingsPath, 'events.ts'));
        const payloads = this.extractPayloads(path.join(this.typingsPath, 'events.ts'));

        const eventEnum = enums.find(e => e.name === 'EmbeddedEventName');
        if (!eventEnum) return '';

        let markdown = '| Event | Description | Payload |\n';
        markdown += '|-------|-------------|------------|\n';

        for (const item of eventEnum.items) {
            // Skip private events and deprecated aliases (see isDocumented)
            if (!this.isDocumented(item, 'event')) continue;

            const payload = payloads[item.name];
            const payloadInfo = payload ? this.formatPayload(payload.type) : '-';

            markdown += `| \`${item.value}\` | ${item.description || 'No description available'} | ${payloadInfo} |\n`;
        }

        return markdown;
    }

    /**
     * Generates markdown table for commands/methods (only public methods)
     */
    generateCommandsTable() {
        const enums = this.parseEnumFile(path.join(this.typingsPath, 'commands.ts'));
        const payloads = this.extractPayloads(path.join(this.typingsPath, 'commands.ts'));

        const commandEnum = enums.find(e => e.name === 'EmbeddedCommandName');
        if (!commandEnum) return '';

        let markdown = '| Method | Command | Description | Parameters | Access Level | Restriction |\n';
        markdown += '|--------|---------|-------------|------------|--------------|-------------|\n';

        for (const item of commandEnum.items) {
            // Skip private commands and deprecated aliases (see isDocumented)
            if (!this.isDocumented(item, 'command')) continue;

            const payload = payloads[item.name];

            // Generate method name from command name and payload
            const methodName = this.generateMethodName(item.name, item.value, payload);

            const params = payload ? this.formatMethodParameters(payload.type) : '-';

            // Determine access level based on @moderator annotation
            const accessLevel = this.getAccessLevel(item);

            const restriction = this.getRestriction(item);

            markdown += `| \`${methodName}\` | \`${item.value}\` | ${item.description || 'No description available'} | ${params} | ${accessLevel} | ${restriction} |\n`;
        }

        return markdown;
    }

    /**
     * Generates method name and signature from command enum
     */
    generateMethodName(commandName, commandValue, payload) {
        // Convert COMMAND_NAME to camelCase method name
        const methodName = commandName
            .toLowerCase()
            .split('_')
            .map((word, index) => index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

        // If there's no payload or payload is void, no parameters needed
        if (!payload || payload.type === 'void') {
            return `${methodName}()`;
        }

        // Extract parameter names from payload type
        if (payload.type.includes('{') && payload.type.includes('}')) {
            // Remove comments (both single-line // and multi-line /* */)
            const cleanedType = payload.type
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
                .replace(/\/\/.*$/gm, ''); // Remove // comments

            const properties = cleanedType
                .replace(/[{}]/g, '')
                .split(';')
                .map(prop => prop.trim())
                .filter(prop => prop && !prop.startsWith('//') && !prop.startsWith('/*'))
                .map(prop => {
                    const [key] = prop.split(':').map(s => s.trim());
                    return key;
                })
                .filter(key => key); // Remove empty keys

            if (properties.length > 0) {
                return `${methodName}(${properties.join(', ')})`;
            }
        }

        // Fallback: no parameters
        return `${methodName}()`;
    }

    /**
     * Determines the access level of a command based on its @moderator annotation
     */
    getAccessLevel(item) {
        return item.isModerator ? 'Moderator' : 'All';
    }

    /**
     * When a command may be sent, from its `@prejoin` annotation.
     */
    getRestriction(item) {
        return item.isPrejoin ? '-' : 'Requires having joined the meeting';
    }

    /**
     * Decides whether an enum member reaches the public documentation.
     *
     * `@private` members are internal. `@deprecated` members are the legacy aliases kept alive for the
     * deprecation window: they keep working, but the docs must show only the canonical name so nobody
     * writes new integrations against a name that is already scheduled for removal. Exclusions are
     * reported on stdout so a rename that accidentally deprecates the wrong member is visible.
     */
    isDocumented(item, kind) {
        if (item.isPrivate) {
            return false;
        }

        if (item.isDeprecated) {
            this.excluded.push(`${kind} \`${item.value}\` (deprecated)`);
            return false;
        }

        return true;
    }

    /**
     * Generates markdown table for attributes/properties
     */
    generateAttributesTable() {
        const propertyEnums = this.parseEnumFile(path.join(this.typingsPath, 'attributes.ts'));
        const propertyEnum = propertyEnums.find(e => e.name === 'EmbeddedAttribute');

        let markdown = '| Attribute | Description | Required |\n';
        markdown += '|-----------|-------------|----------|\n';

        // Add attributes from the properties enum only
        if (propertyEnum) {
            for (const item of propertyEnum.items) {
                // Skip private attributes and deprecated aliases (see isDocumented)
                if (!this.isDocumented(item, 'attribute')) continue;

                // Format required column with additional text if present
                let requiredColumn = 'No';
                if (item.isRequired) {
                    requiredColumn = item.requiredText ? `Yes (${item.requiredText})` : 'Yes';
                }

                // Use description from JSDoc comments, fallback to hardcoded if not available
                const description = item.description || this.getDescriptionForAttribute(item.value);

                markdown += `| \`${item.value}\` | ${description} | ${requiredColumn} |\n`;
            }
        }

        return markdown;
    }

    /**
     * Formats payload type information for display in events table
     */
    formatPayload(type) {
        if (type === 'void' || type === '{}') {
            return 'None';
        }

        // Handle object types
        if (type.includes('{') && type.includes('}')) {
            const properties = type
                .replace(/[{}]/g, '')
                .split(';')
                .map(prop => prop.trim())
                .filter(prop => prop)
                .map(prop => {
                    const [key, value] = prop.split(':').map(s => s.trim());
                    return `"${key}": "${this.resolveTypeNames(value, key)}"`;
                });

            if (properties.length > 0) {
                const tab = '&nbsp;&nbsp;&nbsp;&nbsp;';
                const jsonContent = '{ <br>' + tab + properties.join(',<br>' + tab) + '<br>}';
                return `<pre><code>${jsonContent}</code></pre>`;
            } else {
                return '<pre><code>{}</code></pre>';
            }
        }

        return `\`${this.resolveTypeNames(type, type)}\``;
    }

    /**
     * Formats method parameters for display
     */
    formatMethodParameters(type) {
        if (type === 'void') {
            return '-';
        }

        // Handle object types
        if (type.includes('{') && type.includes('}')) {
            // Remove comments (both single-line // and multi-line /* */)
            const cleanedType = type
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
                .replace(/\/\/.*$/gm, ''); // Remove // comments

            const properties = cleanedType
                .replace(/[{}]/g, '')
                .split(';')
                .map(prop => prop.trim())
                .filter(prop => prop && !prop.startsWith('//') && !prop.startsWith('/*'))
                .map(prop => {
                    const [key, value] = prop.split(':').map(s => s.trim());
                    return value ? `• \`${key}\`: \`${this.resolveTypeNames(value, key)}\`` : undefined;
                })
                .filter(param => param); // Remove malformed parameters

            return properties.length > 0 ? properties.join('<br>') : 'object';
        }

        return `\`${this.resolveTypeNames(type, type)}\``;
    }

    /**
     * Gets description for an attribute
     */
    getDescriptionForAttribute(attributeName) {
        const descriptions = {
            'room-id': 'Unique identifier for the meeting room',
            'participant-name': 'Display name for the local participant',
            'leave-redirect-url': 'URL to redirect to when leaving the meeting'
        };
        return descriptions[attributeName] || 'No description available';
    }

    /**
     * Generates separate documentation files following the openvidu.io shared snippets
     * convention: a "webcomponent" folder containing events.md, commands.md and attributes.md
     * (matching openvidu.io's shared/meet/webcomponent/)
     */
    generateSeparateDocuments(outputDir = './docs') {
        // Ensure output directory exists
        const webcomponentDir = path.join(outputDir, 'webcomponent');
        if (!fs.existsSync(webcomponentDir)) {
            fs.mkdirSync(webcomponentDir, { recursive: true });
        }

        // Header comment for all generated files
        const headerComment = `<!-- This file is auto-generated. Do not edit manually. -->\n<!-- Generated by openvidu-meet/scripts/generate-webcomponent-docs.js -->\n\n`;

        const eventsTable = this.generateEventsTable();
        const commandsTable = this.generateCommandsTable();
        const attributesTable = this.generateAttributesTable();

        // Write separate files with header comments
        const eventsPath = path.join(webcomponentDir, 'events.md');
        const commandsPath = path.join(webcomponentDir, 'commands.md');
        const attributesPath = path.join(webcomponentDir, 'attributes.md');

        fs.writeFileSync(eventsPath, headerComment + eventsTable, 'utf8');
        fs.writeFileSync(commandsPath, headerComment + commandsTable, 'utf8');
        fs.writeFileSync(attributesPath, headerComment + attributesTable, 'utf8');

        return {
            events: eventsPath,
            commands: commandsPath,
            attributes: attributesPath
        };
    }

    /**
     * Saves the generated documentation to separate files
     */
    saveDocumentation(outputDir = './docs') {
        const files = this.generateSeparateDocuments(outputDir);

        console.log('✅ Documentation generated successfully:');
        console.log(`📄 Events: ${files.events}`);
        console.log(`🔧 Commands: ${files.commands}`);
        console.log(`⚙️ Attributes: ${files.attributes}`);

        // Display summary
        console.log('\n📊 Documentation Summary:');
        console.log('- Only public/non-private elements included');
        console.log('- Deprecated aliases excluded (they keep working until their removal release)');
        console.log('- Three separate markdown files generated');
        console.log('- Tables only, no additional content');

        if (this.excluded.length > 0) {
            console.log(`\n🚫 Excluded from the tables (${this.excluded.length}):`);
            for (const entry of this.excluded) {
                console.log(`   - ${entry}`);
            }
        }
    }
}

// Main execution
if (require.main === module) {
    const generator = new WebComponentDocGenerator();

    // Parse command line arguments
    const args = process.argv.slice(2);
    const outputDir = args[0] || './docs';

    try {
        generator.saveDocumentation(outputDir);
    } catch (error) {
        console.error('❌ Error generating documentation:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

module.exports = WebComponentDocGenerator;
