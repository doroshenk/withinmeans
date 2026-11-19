#!/usr/bin/env node
// Creates the Within Means phase labels, milestones and one GitHub issue per ticket
// from docs/tickets.json, then links each "Blocked by" to real issue numbers.
// Uses your own `gh` login. Safe to re-run: existing tickets (matched by "[P0-01]" title prefix) are updated, not duplicated.
//
// Usage (from the repo root):  node scripts/create-issues.mjs
//                              node scripts/create-issues.mjs --dry-run

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const data = JSON.parse(readFileSync(new URL('../docs/tickets.json', import.meta.url), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'wm-issues-'));

function isReadOnly(args) {
  const cmd = args.slice(0, 2).join(' ');
  return cmd === 'repo view' || cmd === 'issue list' || (args[0] === 'api' && !args.includes('-f'));
}

function gh(args) {
  if (dryRun && !isReadOnly(args)) {
    console.log('[dry-run] gh', args.join(' '));
    return '';
  }
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
}

const repo = gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
console.log(`Repository: ${repo}${dryRun ? ' (dry run)' : ''}`);

// Labels
const labelColors = ['0F6E74', '00929C', 'A87A00', '6B57C9', 'C2417F', '9C5B3B', 'C9610E'];
for (const p of data.phases) {
  gh(['label', 'create', `phase-${p.number}`, '--color', labelColors[p.number], '--description', p.name, '--force', '--repo', repo]);
}

// Milestones
const existingMilestones = JSON.parse(gh(['api', `repos/${repo}/milestones?state=all&per_page=100`]) || '[]');
for (const p of data.phases) {
  if (!existingMilestones.some((m) => m.title === p.name)) {
    gh(['api', `repos/${repo}/milestones`, '-f', `title=${p.name}`, '-f', `description=${p.description} Release ${p.release}.`]);
    console.log(`Milestone created: ${p.name}`);
  }
}

// Existing issues
const existing = JSON.parse(gh(['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '500', '--json', 'number,title']) || '[]');
const numberOf = {};
for (const i of existing) {
  const m = i.title.match(/^\[(P\d-\d\d)\]/);
  if (m) numberOf[m[1]] = i.number;
}

function body(t, link) {
  const lines = [];
  lines.push(`**Ticket:** ${t.id} · **Spec:** ${t.refs} · **Plan:** \`docs/PLAN.md\` §8`);
  lines.push(`**Blocked by:** ${t.blocked.length ? t.blocked.map(link).join(', ') : 'nothing'}`, '');
  lines.push(`**Goal.** ${t.goal}`, '', '**Tests to write first (red):**', '');
  for (const s of t.tests) lines.push(`- [ ] ${s}`);
  if (t.done.length) { lines.push('', '**Also done when:**', ''); for (const s of t.done) lines.push(`- [ ] ${s}`); }
  if (t.console.length) { lines.push('', '**Find it in the console (learning):**', ''); for (const s of t.console) lines.push(`- [ ] ${s}`); }
  lines.push('', 'Start with `/work-ticket ' + t.id + '` in Claude Code. Definition of done: `docs/PLAN.md` §9.');
  return lines.join('\n');
}

function writeBody(t, link) {
  const f = join(tmp, `${t.id}.md`);
  writeFileSync(f, body(t, link), 'utf8');
  return f;
}

// Pass 1: create missing issues (blocked-by as plain IDs for now)
for (const t of data.tickets) {
  if (numberOf[t.id]) continue;
  const milestone = data.phases.find((p) => p.number === t.phase).name;
  const out = gh(['issue', 'create', '--repo', repo, '--title', `[${t.id}] ${t.title}`,
    '--body-file', writeBody(t, (id) => id), '--label', `phase-${t.phase}`, '--milestone', milestone]);
  const n = Number((out.match(/\/issues\/(\d+)/) || [])[1]);
  if (n) numberOf[t.id] = n;
  console.log(`Created ${t.id} → #${n || '?'}`);
}

// Pass 2: rewrite bodies with real issue links
for (const t of data.tickets) {
  const n = numberOf[t.id];
  if (!n) continue;
  gh(['issue', 'edit', String(n), '--repo', repo, '--body-file', writeBody(t, (id) => (numberOf[id] ? `#${numberOf[id]} (${id})` : id))]);
}

console.log(`\nDone: ${Object.keys(numberOf).length} of ${data.tickets.length} tickets have issues.`);
