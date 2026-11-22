#!/usr/bin/env node
// Copies Claude Code project files (settings, skills, agents) and GitHub templates
// from setup/ into .claude/ and .github/, then removes setup/. Run from the repo root:
//   node scripts/install-tooling.mjs
import { cpSync, existsSync, rmSync } from 'node:fs';

const copied = [];
if (existsSync('setup/dot-claude')) { cpSync('setup/dot-claude', '.claude', { recursive: true }); copied.push('.claude/'); }
if (existsSync('setup/dot-github')) { cpSync('setup/dot-github', '.github', { recursive: true }); copied.push('.github/'); }
rmSync('setup', { recursive: true, force: true });
console.log(copied.length ? `Installed into ${copied.join(' and ')}; removed setup/.` : 'Nothing to install (no setup/ folder).');
