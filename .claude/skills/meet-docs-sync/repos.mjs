import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const flag = (name, def) => {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? def : process.argv[i + 1];
};
export const git = (cwd, ...args) =>
	execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = git(SKILLS, 'rev-parse', '--show-toplevel').trim();
// openvidu.io sits next to the main checkout, also when this runs from a worktree.
const MAIN_CHECKOUT = dirname(resolve(REPO, git(REPO, 'rev-parse', '--git-common-dir').trim()));
export const DOCS = resolve(flag('docs', join(MAIN_CHECKOUT, '..', 'openvidu.io')));
