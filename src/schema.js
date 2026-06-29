/**
 * Canonical job shape used everywhere in the pipeline.
 * All source adapters must return an array of these objects.
 */

/**
 * @typedef {Object} Job
 * @property {string}  id          - Unique ID: `${source}::${sourceId}`
 * @property {string}  title
 * @property {string}  company
 * @property {string}  location    - Raw location string from source
 * @property {boolean} remote      - Inferred from location/description
 * @property {string}  url         - Canonical apply / view URL
 * @property {string}  description - Full JD text (HTML stripped)
 * @property {string}  source      - 'greenhouse' | 'lever' | 'ashby' | 'adzuna' | 'manual'
 * @property {string}  fetchedAt   - ISO timestamp
 * @property {Score|null}   score     - Populated by scorer
 * @property {string|null}  tailoredCv - Path to tailored PDF, if generated
 * @property {string}  status      - 'new' | 'scored' | 'tailored' | 'applied' | 'archived'
 */

/**
 * @typedef {Object} Score
 * @property {number} total         - 0–5 weighted aggregate
 * @property {number} productSense  - 0–5
 * @property {number} execution     - 0–5
 * @property {number} influence     - 0–5
 * @property {number} discovery     - 0–5
 * @property {number} metricsImpact - 0–5
 * @property {string[]} matchedCompetencies
 * @property {string[]} gaps
 * @property {string}   reasoning
 */

function makeJob({ title, company, location, url, description, source, sourceId, remote = false }) {
  return {
    id: `${source}::${sourceId}`,
    title,
    company,
    location,
    remote,
    url,
    description,
    source,
    fetchedAt: new Date().toISOString(),
    score: null,
    tailoredCv: null,
    status: 'new',
  };
}

module.exports = { makeJob };
