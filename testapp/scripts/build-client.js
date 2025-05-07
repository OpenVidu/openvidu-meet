import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source directory for client TypeScript files
const sourceDir = path.join(__dirname, '..', 'public', 'js');
// Destination directory for compiled JavaScript
const destDir = path.join(__dirname, '..', 'dist', 'testapp', 'public', 'js');

// Create destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Get all TypeScript files in the source directory
const tsFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.ts'));

// Compile each TypeScript file individually
console.log('Compiling client-side TypeScript files...');

// Create a much simpler compilation approach
tsFiles.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const outputFile = file.replace('.ts', '.js');
  const destPath = path.join(destDir, outputFile);

  // Read the TypeScript file
  const tsContent = fs.readFileSync(sourcePath, 'utf-8');

  console.log(`Processing ${file}...`);

  // Use esbuild to quickly transpile TypeScript to JavaScript
  // For a simple application, we'll do some basic transforms ourselves
  let jsContent = tsContent;

  // Remove TypeScript type annotations and interfaces
  jsContent = jsContent.replace(/^interface\s+\w+\s*\{[\s\S]*?\}/gm, '');
  jsContent = jsContent.replace(/^type\s+\w+\s*=[\s\S]*?;/gm, '');
  jsContent = jsContent.replace(/:\s*\w+(\[\])?(\s*\|\s*null)?(\s*\|\s*undefined)?/g, '');
  jsContent = jsContent.replace(/<\w+(\[\])?>/g, '');
  jsContent = jsContent.replace(/as\s+\w+(\[\])?/g, '');

  // Save the JavaScript file
  fs.writeFileSync(destPath, jsContent);
  console.log(`Created ${outputFile}`);
});

// Copy utility files that client code might need
const commonUtilPath = path.join(__dirname, '..', 'utils', 'common.js');
const destCommonPath = path.join(destDir, 'common.js');

// Basic conversion of the common.ts file to JS
if (fs.existsSync(path.join(__dirname, '..', 'utils', 'common.ts'))) {
  const tsContent = fs.readFileSync(path.join(__dirname, '..', 'utils', 'common.ts'), 'utf-8');
  let jsContent = tsContent;

  // Remove TypeScript type annotations
  jsContent = jsContent.replace(/:\s*\w+(\[\])?(\s*\|\s*null)?(\s*\|\s*undefined)?/g, '');
  jsContent = jsContent.replace(/<\w+(\[\])?>/g, '');

  fs.writeFileSync(destCommonPath, jsContent);
  console.log('Created common.js utility file');
}

console.log('Client-side files processed successfully');