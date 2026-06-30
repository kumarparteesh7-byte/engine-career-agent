const https = require('https');
const { makeJob } = require('../schema');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function inferRemote(text) {
  return /remote|anywhere|distributed/i.test(text);
}

async function fetchAshby(boardSlug, keywords = [], countries = []) {
  const url = 'https://api.ashbyhq.com/posting-api/job-board/' + boardSlug;
  const data = await post(url, {});
  const jobs = data.jobs ?? [];

  return jobs
    .filter(j => {
      const title = (j.title ?? '').toLowerCase();
      const loc = j.location ?? '';
      const kwMatch = !keywords.length || keywords.some(kw => title.includes(kw.toLowerCase()));
      const locMatch = !countries.length || countries.some(c => loc.toLowerCase().includes(c.toLowerCase())) || inferRemote(loc);
      return kwMatch && locMatch;
    })
    .map(j => {
      const location = j.location ?? '';
      const description = j.descriptionPlain ?? j.jobDescriptionSections?.map(s => s.content).join(' ') ?? '';
      return makeJob({
        title: j.title ?? '',
        company: boardSlug,
        location,
        url: j.jobUrl ?? '',
        description,
        source: 'ashby',
        sourceId: j.id ?? j.title,
        remote: inferRemote(location + ' ' + description),
      });
    });
}

module.exports = { fetchAshby };
