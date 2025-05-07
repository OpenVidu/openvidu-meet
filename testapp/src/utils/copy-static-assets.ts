import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define paths
const projectRoot = path.join(__dirname, '..', '..');
const viewsDir = path.join(projectRoot, 'views');
const distViewsDir = path.join(projectRoot, 'dist', 'views');
const cssDir = path.join(projectRoot, 'public', 'css');
const distCssDir = path.join(projectRoot, 'dist', 'public', 'css');

// Create dist directories if they don't exist
function ensureDirectoryExists(directory: string): void {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`Created directory: ${directory}`);
  }
}

// Copy files from source to destination
function copyFiles(sourceDir: string, destDir: string, extension: string): void {
  ensureDirectoryExists(destDir);

  const files = fs.readdirSync(sourceDir).filter(file => file.endsWith(extension));

  files.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(destDir, file);

    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied ${sourcePath} to ${destPath}`);
  });

  console.log(`Copied ${files.length} ${extension} files`);
}

// Copy view templates
console.log('Copying Mustache templates...');
copyFiles(viewsDir, distViewsDir, '.mustache');

// Copy CSS files
console.log('Copying CSS files...');
copyFiles(cssDir, distCssDir, '.css');

console.log('All static assets have been copied to dist.');