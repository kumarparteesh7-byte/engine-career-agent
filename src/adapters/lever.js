const https = require('https');
const { makeJob } = require('../schema');

const BASE = 'https://api.lever.co/v0/postings';

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

function inferRemote(text) {
  return /remote|anywhere|distributed/i.test(text);
}

function locationMatch(location, countries) {
  if (!countries.length) return true;
  return countries.some(c => location.toLowerCase().includes(c.toLowerCase()));
}

async function fetchLever(boardToken, keywords = [], countries = []) {
  const url = `${BASE}/${boardToken}?mode=json`;
  const data = await get(url);
  const jobs = Array.isArray(data) ? data : [];

  return jobs
    .filter(j => {
      const title = (j.text ?? '').toLowerCase();
      const loc = j.categories?.location ?? '';
      const kwMatch = !keywords.length || keywords.some(kw => title.includes(kw.toLowerCase()));
      const locMatch = !countries.length || locationMatch(loc, countries) || inferRemote(loc + ' ' + (j.descriptionPlain ?? ''));
      return kwMatch && locMatch;
    })
    .map(j => {
      const location = j.categories?.location ?? '';
      const description = j.descriptionPlain ?? j.description?.replace(/<[^>]+>/g, ' ') ?? '';
      return makeJob({
        title: j.text ?? '',
        company: boardToken,
        location,
        url: j.hostedUrl ?? j.applyUrl ?? '',
        description,
        source: 'lever',
        sourceId: j.id ?? j.text,
        remote: inferRemote(location + ' ' + description),
      });
    });
}

module.exports = { fetchLever };
