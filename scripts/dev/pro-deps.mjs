#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lists the dependencies meet-pro declares at another version than meet-ce. One lockfile and a hoisted
// node_modules serve both editions, so a mismatch installs two copies side by side.
//   --fix    writes CE's version into the meet-pro manifests (same major only)
//   --major  with --fix, also crosses a major version

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

const workspacePackages = (root) =>
	[...readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').matchAll(/^ {2}- (\S+)$/gm)]
		.map(([, path]) => path)
		.filter((path) => existsSync(join(root, path, 'package.json')));

const declared = (manifestPath) => {
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

	return DEPENDENCY_FIELDS.flatMap((field) => Object.entries(manifest[field] ?? {})).filter(
		([, version]) => !version.startsWith('workspace:')
	);
};

const major = (version) => version.replace(/^[^\d]*/, '').split('.')[0];

export const findProDependencyDrift = (root) => {
	const packages = workspacePackages(root);
	const ceVersions = new Map();

	for (const path of ['.', ...packages.filter((path) => !path.startsWith('meet-pro/'))]) {
		for (const [name, version] of declared(join(root, path, 'package.json'))) {
			ceVersions.set(name, (ceVersions.get(name) ?? new Set()).add(version));
		}
	}

	return packages
		.filter((path) => path.startsWith('meet-pro/'))
		.flatMap((path) =>
			declared(join(root, path, 'package.json'))
				.filter(([name, version]) => ceVersions.has(name) && !ceVersions.get(name).has(version))
				.map(([name, version]) => {
					const candidates = [...ceVersions.get(name)];
					const ce = candidates.length === 1 ? candidates[0] : undefined;

					return {
						manifest: join(path, 'package.json'),
						name,
						pro: version,
						ce: ce ?? candidates.join(' | '),
						fixable: ce !== undefined,
						crossesMajor: ce !== undefined && major(ce) !== major(version)
					};
				})
		);
};

const applyFixes = (root, drift) => {
	for (const manifest of new Set(drift.map((entry) => entry.manifest))) {
		const manifestPath = join(root, manifest);
		let text = readFileSync(manifestPath, 'utf8');

		for (const { name, pro, ce } of drift.filter((entry) => entry.manifest === manifest)) {
			text = text.replaceAll(`"${name}": "${pro}"`, `"${name}": "${ce}"`);
		}

		writeFileSync(manifestPath, text);
	}
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const fix = process.argv.includes('--fix');
	const crossMajor = process.argv.includes('--major');
	const drift = findProDependencyDrift(root);
	const toFix = fix ? drift.filter((entry) => entry.fixable && (crossMajor || !entry.crossesMajor)) : [];

	applyFixes(root, toFix);

	const left = drift.filter((entry) => !toFix.includes(entry));

	for (const entry of toFix) {
		console.log(`fixed  ${entry.manifest}  ${entry.name}  ${entry.pro} -> ${entry.ce}`);
	}

	for (const entry of left) {
		const note = !entry.fixable ? '  (CE uses several versions)' : entry.crossesMajor ? '  (major)' : '';
		console.log(`drift  ${entry.manifest}  ${entry.name}  ${entry.pro}  CE ${entry.ce}${note}`);
	}

	if (toFix.length > 0) {
		console.log('Run ./meet.sh install to apply the new versions.');
	}

	if (drift.length === 0) {
		console.log('meet-pro declares every shared dependency at the version of meet-ce.');
	}

	process.exit(left.length > 0 ? 1 : 0);
}
