#!/usr/bin/env node

require('dotenv').config();
const pool = require('../src/config/db');
const teamsService = require('../src/services/teams.service');

function usage() {
  console.log('Usage: node scripts/test_team_hierarchy_membership.js <TEAM_A> <TEAM_B> <PARENT_UUID> <CHILD_UUID>');
}

async function runScenario(label, fn) {
  try {
    await fn();
    console.log(`${label}: PASS`);
  } catch (err) {
    const code = err?.code || 'ERR_UNKNOWN';
    const meta = err?.meta ? ` meta=${JSON.stringify(err.meta)}` : '';
    console.log(`${label}: FAIL code=${code} msg=${err?.message || 'error'}${meta}`);
  }
}

async function main() {
  const [teamARaw, teamBRaw, parentId, childId] = process.argv.slice(2);
  if (!teamARaw || !teamBRaw || !parentId || !childId) {
    usage();
    process.exit(1);
  }

  const parseTeamId = (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  };
  const teamA = parseTeamId(teamARaw);
  const teamB = parseTeamId(teamBRaw);

  await runScenario('S1 validate parent for TEAM_A', () => teamsService.validateAddMember(teamA, parentId));
  await runScenario('S2 validate child for TEAM_B', () => teamsService.validateAddMember(teamB, childId));
  await runScenario('S3 validate child for TEAM_A', () => teamsService.validateAddMember(teamA, childId));
}

main()
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (_) {}
  });
