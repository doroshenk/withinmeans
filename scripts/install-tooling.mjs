#!/usr/bin/env node
// Copies the Claude Code project settings, the /work-ticket skill and the PR template
// from setup/ into .claude/ and .github/. Run once from the repo root:  node scripts/install-tooling.mjs
import { cpSync, rmSync } from 'node:fs';

cpSync('setup/dot-claude', '.claude', { recursive: true });
cpSync('setup/dot-github', '.github', { recursive: true });
rmSync('setup', { recursive: true, force: true });
console.log('Installed .claude/settings.json, .claude/skills/work-ticket/SKILL.md and .github/pull_request_template.md; removed setup/.');
