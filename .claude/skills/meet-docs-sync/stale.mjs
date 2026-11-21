#!/usr/bin/env node
/**
 * Lists the openvidu.io Meet screenshots and videos whose screen changed after they were last committed.
 *
 *   node .claude/skills/meet-docs-sync/stale.mjs [--since v3.9.0] [--docs ../openvidu.io] [--commits] [--all]
 *
 * An asset is stale when a commit of this repository, after --since and after the asset's last commit in
 * openvidu.io, changed a template or a stylesheet of the frontend paths its screen is built from (AREAS).
 * Each stale asset comes with the record.mjs flow or capture.mjs scene that produces it, read from their
 * --list, and the commands to run them. Wording-only changes (translation files) are not detected.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS, REPO, SKILLS, flag, git } from './repos.mjs';

const SINCE = flag('since', git(REPO, 'describe', '--tags', '--abbrev=0', '--match', 'v*').trim());
const SHOW_ALL = process.argv.includes('--all');
const SHOW_COMMITS = process.argv.includes('--commits');

// ---------- The frontend paths each asset's screen is built from (first match wins) ----------
// A third element names where an asset without a flow or scene comes from.
const L = 'meet-ce/frontend/projects/shared-meet-components/src/lib';
const OC = `${L}/domains/meeting/openvidu-components/components`;
const GLOBAL = ['meet-ce/frontend/src/styles.scss'];
const MEETING_VIEW = [
	`${OC}/meeting-view`,
	`${OC}/toolbar`,
	`${OC}/status-rail`,
	`${OC}/stream`,
	`${OC}/layout`,
	`${L}/domains/meeting/customization`,
	`${L}/domains/meeting/pages/meeting`,
	`${L}/shared/components/notifications`
];
const DEVICE_VIEW = [`${OC}/meeting-media-setup`, `${OC}/settings`];
const JOIN_VIEW = [
	`${L}/domains/meeting/components/meeting-join`,
	`${L}/domains/meeting/components/share-room-access-link`
];
const WIZARD = [
	`${L}/domains/rooms/pages/room-wizard`,
	`${L}/domains/rooms/components/step-indicator`,
	`${L}/domains/rooms/components/wizard-nav`,
	`${L}/domains/rooms/components/layout-picker`,
	`${L}/domains/rooms/components/e2ee-exclusion-warning`
];
const FIGURES = `${L}/shared/components/list-figures`;
const ROOM_LIST = [`${L}/domains/rooms/components/rooms-lists`, `${L}/domains/rooms/pages/rooms`, FIGURES];
const USER_LIST = [`${L}/domains/users`, FIGURES];
const RECORDING_PAGES = [`${L}/domains/recordings`];
const PARTICIPANTS = [`${OC}/panel/participants-panel`, `${L}/domains/meeting/waiting-participants`];
const ACTIVITIES = [`${OC}/panel/activities-panel`];
const MEMBERS = [`${L}/domains/room-members`, `${L}/domains/rooms/pages/room-detail`];
const AREAS = [
	[/^images\/meet\/deployment\//, null],
	[/^images\/meet\/embedded\/reference\/rest-snippets/, null],
	[/^images\/meet\/embedded\/reference\/webhook/, ['testapp'], 'the testapp webhook panel'],
	[/^images\/meet\/embedded\/tutorials\//, MEETING_VIEW, 'the tutorial apps of openvidu-meet-tutorials'],
	[/^images\/meet\/embedded\//, MEETING_VIEW, 'composed by hand'],
	[/\/room-wizard-/, WIZARD],
	[
		/^images\/meet\/home\//,
		[...MEETING_VIEW, ...PARTICIPANTS, ...MEMBERS, `${L}/domains/rooms/components/room-share-dialog`],
		'landing crops composed by hand'
	],
	[/\/(join-view|join-e2ee|join-ask)$/, JOIN_VIEW],
	[/\/device-view$/, DEVICE_VIEW],
	[/\/virtual-bg-prejoin$/, [...DEVICE_VIEW, `${OC}/panel/background-effects-panel`]],
	[/\/end-view$/, [`${L}/domains/meeting/pages/end-meeting`]],
	[/^images\/meet\/meetings\/e2e-encryption\//, [...MEETING_VIEW, `${OC}/panel/chat-panel`]],
	[/^images\/meet\/meetings\/locked-room\//, [...PARTICIPANTS, `${L}/shared/components/notifications`]],
	[/^images\/meet\/meetings\/(moderation|role-management)\//, [...MEETING_VIEW, ...PARTICIPANTS]],
	[
		/^images\/meet\/meetings\/smart-layout\//,
		[...MEETING_VIEW, `${OC}/panel/settings-panel`, `${OC}/hidden-participants-indicator`]
	],
	[/^images\/meet\/meetings\//, MEETING_VIEW],
	[
		/\/recording-list$/,
		[`${L}/domains/recordings/components/recording-lists`, `${L}/domains/recordings/pages/recordings`, FIGURES]
	],
	[/\/(recording-active|stop-recording|start-recording)$/, [...MEETING_VIEW, ...ACTIVITIES]],
	[/^(images|videos)\/meet\/recordings\//, RECORDING_PAGES],
	[/^(images|videos)\/meet\/room-members\//, MEMBERS],
	[/^images\/meet\/rooms\/access\//, [...MEETING_VIEW, `${L}/domains/meeting/components/share-room-access-link`]],
	[/\/room-list$/, ROOM_LIST],
	[/\/room-details$/, [`${L}/domains/rooms/pages/room-detail`]],
	[/\/room-appearance$/, [`${L}/domains/console/pages/config`]],
	[/^images\/meet\/rooms\//, [...WIZARD, `${L}/domains/rooms/pages/room-detail`]],
	[/\/users-list$/, USER_LIST],
	[/^images\/meet\/users\//, [`${L}/domains/users/pages`, `${L}/domains/auth`]],
	[/\/rest-api-test$/, ['meet-ce/backend/openapi']],
	[/^videos\/meet\/embedded\//, [`${L}/domains/console/pages/embedded`]],
	[/\/(join-meeting|access-room)$/, [...ROOM_LIST, ...JOIN_VIEW, ...DEVICE_VIEW, ...MEETING_VIEW]],
	[/\/view-recording$/, RECORDING_PAGES],
	[/^videos\/meet\/home\//, [...DEVICE_VIEW, ...MEETING_VIEW], 'the landing demo, edited by hand'],
	[/^videos\/meet\/meetings\/live-broadcast\//, [...MEETING_VIEW, ...ACTIVITIES]],
	[/^videos\/meet\/meetings\/raise-hand\//, [...MEETING_VIEW, ...PARTICIPANTS]],
	[/^videos\/meet\/meetings\/reactions\//, [...MEETING_VIEW, `${OC}/reaction`]],
	[/^videos\/meet\/meetings\/smart-layout\//, [...MEETING_VIEW, `${OC}/panel/settings-panel`]],
	[
		/^videos\/meet\/meetings\/virtual-background\//,
		[...MEETING_VIEW, `${OC}/panel/background-effects-panel`, `${OC}/settings`]
	],
	[/^videos\/meet\/meetings\//, MEETING_VIEW],
	[/^videos\/meet\/rooms\/access\//, [...ROOM_LIST, `${L}/domains/rooms/components/room-share-dialog`]],
	[/^videos\/meet\/rooms\//, [...ROOM_LIST, ...WIZARD]],
	[/^videos\/meet\/users\/management\//, USER_LIST],
	[/^videos\/meet\/users\/overview\//, [`${L}/domains/auth`, `${L}/domains/console/pages/overview`]]
];

for (const src of new Set(AREAS.flatMap(([, s]) => s ?? []).concat(GLOBAL))) {
	if (!existsSync(join(REPO, src)))
		console.warn(`warning: AREAS names ${src}, which no longer exists: update stale.mjs`);
}

// ---------- Assets and the date of their last commit in openvidu.io ----------
const assetKey = (file) => file.replace(/^docs\/assets\//, '').replace(/-(light|dark)?\.\w+$|\.\w+$/, '');
const lastCommit = new Map();
let date = null;
for (const line of git(
	DOCS,
	'log',
	'--format=@%cI',
	'--name-only',
	'--',
	'docs/assets/images/meet',
	'docs/assets/videos/meet'
).split('\n')) {
	if (line.startsWith('@')) date = line.slice(1);
	else if (line && !lastCommit.has(assetKey(line))) lastCommit.set(assetKey(line), date);
}
const keys = [
	...new Set(
		git(DOCS, 'ls-files', 'docs/assets/images/meet', 'docs/assets/videos/meet')
			.split('\n')
			.filter(Boolean)
			.map(assetKey)
	)
].sort();

// ---------- Commits since --since that touched a template or a stylesheet of each area ----------
const commitsCache = new Map();
function commitsTouching(sources) {
	const id = sources.join('|');
	if (!commitsCache.has(id)) {
		const specs = [...sources, ...GLOBAL].flatMap((s) =>
			/\.\w+$/.test(s) ? [s] : [`:(glob)${s}/**/*.html`, `:(glob)${s}/**/*.scss`, `:(glob)${s}/**/*.yaml`]
		);
		// Author dates: a merge rewrites the commit date to after the recapture that followed the change.
		const out = git(REPO, 'log', `${SINCE}..HEAD`, '--format=%aI%x09%h%x09%s', '--', ...specs);
		commitsCache.set(
			id,
			out
				.split('\n')
				.filter(Boolean)
				.map((l) => {
					const [when, hash, subject] = l.split('\t');
					return { when, hash, subject };
				})
		);
	}
	return commitsCache.get(id);
}

// ---------- Producers: output key -> command, from the tools' own --list ----------
const producers = new Map();
for (const [tool, script, opt] of [
	['record', 'meet-videos/record.mjs', '--flows'],
	['capture', 'meet-screenshots/capture.mjs', '--scenes']
]) {
	for (const line of execFileSync('node', [join(SKILLS, script), '--list'], { encoding: 'utf8' })
		.split('\n')
		.filter(Boolean)) {
		const [id, outputs = ''] = line.split('\t');
		for (const out of outputs.split(',').filter(Boolean)) producers.set(out, { tool, script, opt, id });
	}
}

// ---------- Report ----------
const stale = [];
const unmapped = [];
let fresh = 0;
for (const key of keys) {
	const area = AREAS.find(([re]) => re.test(key));
	if (!area) {
		unmapped.push(key);
		continue;
	}
	if (!area[1]) continue;
	const since = lastCommit.get(key);
	// A recapture is often committed minutes before the code it shows: the grace keeps that pair together.
	const newer = commitsTouching(area[1]).filter((c) => Date.parse(c.when) > Date.parse(since) + 10 * 60_000);
	if (newer.length) stale.push({ key, since, newer, producer: producers.get(key), origin: area[2] });
	else {
		fresh++;
		if (SHOW_ALL) console.log(`ok     ${key} (${since.slice(0, 10)})`);
	}
}

console.log(
	`openvidu.io: ${DOCS}\nchanges since ${SINCE}: ${stale.length} stale, ${fresh} up to date, ${unmapped.length} without an area\n`
);
// Assets a tool reproduces first; the rest need a new flow or scene, or come from another app.
stale.sort((a, b) => Number(!a.producer) - Number(!b.producer));
for (const { key, since, newer, producer, origin } of stale) {
	const by = producer ? `${producer.tool} ${producer.id}` : origin ? `manual: ${origin}` : 'no producer yet';
	console.log(
		`STALE  ${key}  [${by}]  last ${since.slice(0, 10)}, ${newer.length} commit(s), newest: ${newer[0].hash} ${newer[0].subject}`
	);
	if (SHOW_COMMITS)
		for (const c of newer.slice(1)) console.log(`         ${c.when.slice(0, 10)} ${c.hash} ${c.subject}`);
}
for (const key of unmapped) console.log(`AREA?  ${key}: add it to AREAS in stale.mjs`);

const byTool = new Map();
for (const { producer } of stale.filter((s) => s.producer)) {
	const ids = byTool.get(producer.script) ?? { opt: producer.opt, ids: new Set() };
	ids.ids.add(producer.id);
	byTool.set(producer.script, ids);
}
if (byTool.size) {
	console.log('\nTo recapture them (after ./meet.sh stack up docs, from the main checkout):');
	for (const [script, { opt, ids }] of byTool) {
		console.log(
			`  ./meet.sh stack run docs -- node .claude/skills/${script} ${opt} ${[...ids].join(',')} --out ${join(DOCS, 'docs/assets')}`
		);
	}
}
