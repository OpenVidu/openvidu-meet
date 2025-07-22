const fs = require('fs');
const path = require('path');

/**
 * Generates documentation for the OpenVidu Meet WebComponent
 */
class WebComponentDocGenerator {
    constructor() {
        this.typingsPath = path.join(__dirname, '../typings/src/webcomponent');
        this.webComponentPath = path.join(__dirname, '../frontend/webcomponent/src/components/OpenViduMeet.ts');
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
                        isModerator: commentLines.some(c => c.includes('@moderator')),
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

            // Parse payload property - looking for patterns like [WebComponentEvent.JOIN]: {
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
     * Extracts WebComponent attributes from the OpenViduMeet.ts file
     */
    extractWebComponentAttributes() {
        const content = fs.readFileSync(this.webComponentPath, 'utf8');
        const attributes = [];

        // Look for @attribute JSDoc comments
        const attributeMatches = content.match(/@attribute\s+([^\s]+)\s*-\s*([^\n]+)/g);
        if (attributeMatches) {
            attributeMatches.forEach(match => {
                const parts = match.match(/@attribute\s+([^\s]+)\s*-\s*(.+)/);
                if (parts) {
                    attributes.push({
                        name: parts[1],
                        description: parts[2].trim()
                    });
                }
            });
        }

        return attributes;
    }

    /**
     * Generates markdown table for events (only public events)
     */
    generateEventsTable() {
        const enums = this.parseEnumFile(path.join(this.typingsPath, 'event.model.ts'));
        const payloads = this.extractPayloads(path.join(this.typingsPath, 'event.model.ts'));

        const eventEnum = enums.find(e => e.name === 'WebComponentEvent');
        if (!eventEnum) return '';

        let markdown = '| Event | Description | Payload |\n';
        markdown += '|-------|-------------|------------|\n';

        for (const item of eventEnum.items) {
            // Skip private events
            if (item.isPrivate) continue;

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
        const enums = this.parseEnumFile(path.join(this.typingsPath, 'command.model.ts'));
        const payloads = this.extractPayloads(path.join(this.typingsPath, 'command.model.ts'));

        const commandEnum = enums.find(e => e.name === 'WebComponentCommand');
        if (!commandEnum) return '';

        let markdown = '| Method | Description | Parameters | Access Level |\n';
        markdown += '|--------|-------------|------------|-------------|\n';

        for (const item of commandEnum.items) {
            // Skip private commands
            if (item.isPrivate) continue;

            const payload = payloads[item.name];

            // Generate method name from command name and payload
            const methodName = this.generateMethodName(item.name, item.value, payload);

            const params = payload ? this.formatMethodParameters(payload.type) : '-';

            // Determine access level based on @moderator annotation
            const accessLevel = this.getAccessLevel(item);

            markdown += `| \`${methodName}\` | ${item.description || 'No description available'} | ${params} | ${accessLevel} |\n`;
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
     * Generates markdown table for attributes/properties
     */
    generateAttributesTable() {
        const propertyEnums = this.parseEnumFile(path.join(this.typingsPath, 'properties.model.ts'));
        const propertyEnum = propertyEnums.find(e => e.name === 'WebComponentProperty');

        let markdown = '| Attribute | Description | Required |\n';
        markdown += '|-----------|-------------|----------|\n';

        // Add attributes from the properties enum only
        if (propertyEnum) {
            for (const item of propertyEnum.items) {
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
                    return `"${key}": "${value}"`;
                });

            if (properties.length > 0) {
                const tab = '&nbsp;&nbsp;&nbsp;&nbsp;';
                const jsonContent = '{ <br>' + tab + properties.join(',<br>' + tab) + '<br>}';
                return `<pre><code>${jsonContent}</code></pre>`;
            } else {
                return '<pre><code>{}</code></pre>';
            }
        }

        return `\`${type}\``;
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
                    return `• \`${key}\`: ${value}`;
                })
                .filter(param => param && !param.includes('undefined')); // Remove malformed parameters

            return properties.length > 0 ? properties.join('<br>') : 'object';
        }

        return type;
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
     * Generates separate documentation files
     */
    generateSeparateDocuments(outputDir = './docs') {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Header comment for all generated files
        const headerComment = `<!-- This file is auto-generated. Do not edit manually. -->\n<!-- Generated by openvidu-meet/scripts/generate-webcomponent-docs.js -->\n\n`;

        const eventsTable = this.generateEventsTable();
        const commandsTable = this.generateCommandsTable();
        const attributesTable = this.generateAttributesTable();

        // Write separate files with header comments
        const eventsPath = path.join(outputDir, 'webcomponent-events.md');
        const commandsPath = path.join(outputDir, 'webcomponent-commands.md');
        const attributesPath = path.join(outputDir, 'webcomponent-attributes.md');

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
        console.log('- Three separate markdown files generated');
        console.log('- Tables only, no additional content');
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
