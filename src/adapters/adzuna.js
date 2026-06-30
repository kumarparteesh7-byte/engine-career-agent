const https = require('https');
const { makeJob } = require('../schema');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch jobs from Adzuna for a given country.
 * country: 'au' | 'in' | 'gb' | 'us'
 * Requires ADZUNA_APP_ID and ADZUNA_APP_KEY in environment.
 */
async function fetchAdzuna(country, keywords, pages = 2) {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error('ADZUNA_APP_ID / ADZUNA_APP_KEY not set');

  const what = keywords.join(' OR ');
  const allJobs = [];

  for (let page = 1; page <= pages; page++) {
    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}` +
      `?app_id=${appId}&app_key=${appKey}` +
      `&results_per_page=20` +
      `&what_or=${encodeURIComponent(what)}` +
      `&content-type=application/json`;

    const data = await get(url);
    const results = data.results ?? [];
    results.forEach(j => {
      allJobs.push(makeJob({
        title: j.title ?? '',
        company: j.company?.display_name ?? '',
        location: j.location?.display_name ?? '',
        url: j.redirect_url ?? '',
        description: j.description ?? '',
        source: 'adzuna',
        sourceId: j.id ?? j.redirect_url,
        remote: /remote/i.test(j.title + ' ' + j.description),
      }));
    });
  }

  return allJobs;
}

module.exports = { fetchAdzuna };
