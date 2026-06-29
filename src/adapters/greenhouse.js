/**
 * Greenhouse adapter.
 *
 * Greenhouse exposes a public, unauthenticated JSON board for each company:
 *   GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 *
 * board_token is usually the company slug (e.g. "stripe", "notion", "figma").
 * The `content=true` param includes the full job description HTML.
 */

const https = require('https');
const { makeJob } = require('../schema');

const BASE = 'https://boards-api.greenhouse.io/v1/boards';

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferRemote(location, description) {
  const hay = `${location} ${description}`.toLowerCase();
  return hay.includes('remote') || hay.includes('anywhere') || hay.includes('distributed');
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        } else {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch all open jobs for a Greenhouse board token.
 * @param {string} boardToken  e.g. "stripe"
 * @param {string[]} [keywords]  optional title keywords to filter (case-insensitive)
 * @returns {Promise<import('../schema').Job[]>}
 */
async function fetchGreenhouse(boardToken, keywords = []) {
  const url = `${BASE}/${boardToken}/jobs?content=true`;
  const data = await get(url);
  const jobs = data.jobs ?? [];

  return jobs
    .filter((j) => {
      if (!keywords.length) return true;
      const title = (j.title ?? '').toLowerCase();
      return keywords.some((kw) => title.includes(kw.toLowerCase()));
    })
    .map((j) => {
      const description = j.content ? stripHtml(j.content) : '';
      const location = j.location?.name ?? '';
      return makeJob({
        title: j.title ?? '',
        company: boardToken,
        location,
        url: j.absolute_url ?? '',
        description,
        source: 'greenhouse',
        sourceId: String(j.id),
        remote: inferRemote(location, description),
      });
    });
}

module.exports = { fetchGreenhouse };
