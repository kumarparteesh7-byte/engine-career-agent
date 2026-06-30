#!/usr/bin/env node
const path = require('path');
const fs   = require('fs');
const { fetchGreenhouse } = require('./adapters/greenhouse');
const { fetchLever }      = require('./adapters/lever');
const { fetchAshby }      = require('./adapters/ashby');
const { fetchAdzuna }     = require('./adapters/adzuna');
const { upsert }          = require('./tracker/tracker');

const CONFIG_PATH = path.join(__dirname, '../data/config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  return { keywords: [], locations: [], greenhouse: [], lever: [], ashby: [] };
}

async function run() {
  const cfg = loadConfig();
  const { keywords, locations, greenhouse = [], lever = [], ashby = [] } = cfg;
  console.log(`Keywords: ${keywords.length} | Locations: ${locations.join(', ')}`);
  console.log(`Sources: ${greenhouse.length} Greenhouse, ${lever.length} Lever, ${ashby.length} Ashby\n`);

  const all = [];

  // Greenhouse
  for (const board of greenhouse) {
    process.stdout.write(`  [greenhouse] ${board}… `);
    try {
      const jobs = await fetchGreenhouse(board, keywords);
      console.log(jobs.length);
      all.push(...jobs);
    } catch(e) { console.log(`skip`); }
  }

  // Lever
  for (const board of lever) {
    process.stdout.write(`  [lever] ${board}… `);
    try {
      const jobs = await fetchLever(board, keywords, locations);
      console.log(jobs.length);
      all.push(...jobs);
    } catch(e) { console.log(`skip`); }
  }

  // Ashby
  for (const board of ashby) {
    process.stdout.write(`  [ashby] ${board}… `);
    try {
      const jobs = await fetchAshby(board, keywords, locations);
      console.log(jobs.length);
      all.push(...jobs);
    } catch(e) { console.log(`skip`); }
  }

  // Adzuna (AU + IN)
  if (process.env.ADZUNA_APP_ID) {
    for (const country of ['au', 'in']) {
      process.stdout.write(`  [adzuna:${country}]… `);
      try {
        const jobs = await fetchAdzuna(country, keywords, 3);
        console.log(jobs.length);
        all.push(...jobs);
      } catch(e) { console.log(`error: ${e.message.slice(0,40)}`); }
    }
  } else {
    console.log('  [adzuna] skipped — add ADZUNA_APP_ID/KEY to enable AU+IN jobs');
  }

  const stored = upsert(all);
  console.log(`\nDone. ${all.length} fetched → ${stored.length} total in tracker.`);
}

run().catch(e => { console.error(e); process.exit(1); });
