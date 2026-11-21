#!/usr/bin/env node
/**
 * Compares every Meet asset changed in the openvidu.io working tree with its committed version.
 *
 *   node .claude/skills/meet-docs-sync/compare.mjs [--docs ../openvidu.io] [--sheets <dir>]
 *
 * Prints resolution and size, and for videos the length and the unique frames per second, old -> new,
 * and flags a recapture that looks worse. Writes one sheet per asset (images old | new, videos old above
 * new) for a visual check; restore a worse one with `git -C <docs> restore <path>`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { DOCS, flag, git } from './repos.mjs';

const SHEETS = flag('sheets', join(tmpdir(), 'meet-docs-compare'));
mkdirSync(SHEETS, { recursive: true });
const ffprobe = (...args) => execFileSync('ffprobe', ['-v', 'error', ...args], { encoding: 'utf8' }).trim();
const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'ignore' });

function probe(file) {
	const [width, height] = ffprobe(
		'-select_streams',
		'v:0',
		'-show_entries',
		'stream=width,height',
		'-of',
		'csv=p=0',
		file
	)
		.split(',')
		.map(Number);
	const info = { res: `${width}x${height}`, pixels: width * height, kb: Math.round(statSync(file).size / 1024) };
	if (file.endsWith('.mp4')) {
		info.seconds = Number(ffprobe('-show_entries', 'format=duration', '-of', 'csv=p=0', file));
		// mpdecimate drops each frame that repeats the previous one: what is left is how fluid the clip looks.
		const { stderr } = spawnSync(
			'ffmpeg',
			['-i', file, '-vf', 'mpdecimate=hi=200:lo=100:frac=0.001', '-f', 'null', '-'],
			{ encoding: 'utf8' }
		);
		const frames = Number([...stderr.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1] ?? 0);
		info.fps = Math.round((frames / info.seconds) * 10) / 10;
	}
	return info;
}

const changed = git(DOCS, 'status', '--porcelain', '--', 'docs/assets/images/meet', 'docs/assets/videos/meet')
	.split('\n')
	.filter(Boolean)
	.map((line) => ({ state: line.slice(0, 2).trim(), path: line.slice(3) }));
if (!changed.length) console.log(`No Meet asset changed in ${DOCS}.`);

for (const { state, path } of changed) {
	const now = join(DOCS, path);
	if (state === '??') {
		console.log(`NEW     ${path}  ${probe(now).res}`);
		continue;
	}
	const old = join(SHEETS, `old-${basename(path)}`);
	writeFileSync(old, execFileSync('git', ['-C', DOCS, 'show', `HEAD:${path}`], { maxBuffer: 256 * 1024 * 1024 }));
	const [a, b] = [probe(old), probe(now)];
	const sheet = join(
		SHEETS,
		`${path
			.replace(/^docs\/assets\//, '')
			.replace(/\.\w+$/, '')
			.replace(/\//g, '_')}.png`
	);
	const worse = b.pixels < a.pixels ? ['smaller'] : [];
	let line = `${a.res} -> ${b.res}, ${a.kb} -> ${b.kb} KB`;
	if (a.seconds) {
		line += `, ${a.seconds.toFixed(1)} -> ${b.seconds.toFixed(1)} s, ${a.fps} -> ${b.fps} unique fps`;
		if (b.fps < a.fps * 0.9) worse.push('less fluid');
		const tiles = (i, s) => `[${i}]fps=12/${s},scale=480:-2,tile=4x3[t${i}]`;
		ffmpeg([
			'-i',
			old,
			'-i',
			now,
			'-filter_complex',
			`${tiles(0, a.seconds)};${tiles(1, b.seconds)};[t0][t1]vstack`,
			'-frames:v',
			'1',
			sheet
		]);
	} else {
		ffmpeg(['-i', old, '-i', now, '-filter_complex', '[0]scale=-2:540[l];[1]scale=-2:540[r];[l][r]hstack', sheet]);
	}
	console.log(
		`${worse.length ? 'WORSE?  ' : 'ok      '}${path}  ${line}${worse.length ? ` (${worse.join(', ')})` : ''}\n        ${sheet}`
	);
}
