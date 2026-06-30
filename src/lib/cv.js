/**
 * Shared, deterministic CV + text helpers.
 *
 * This module is the SINGLE source of truth for:
 *   - cleaning HTML/entity-encoded job descriptions
 *   - parsing data/cv.txt into structured experience/education
 *   - keying bullets by company
 *   - fuzzy-matching a company name to an existing section key
 *
 * It runs in BOTH Node (server) and the browser (dashboard) via the UMD
 * wrapper below, so the parsing logic can never drift between the two
 * sides again (that drift is what caused tailored bullets to silently not
 * apply to the CV panel).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CV = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /** Decode HTML entities, then strip tags — order matters because some
   *  ATSes (Greenhouse) return entity-ENCODED html (e.g. "&lt;p&gt;"). */
  function cleanHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
      .replace(/&#34;/g, '"').replace(/&quot;/g, '"')
      // block-level tags → newlines so the text stays readable
      .replace(/<\/(p|div|li|h[1-6]|ul|ol|tr)\s*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      // strip whatever inline tags remain
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  function isBullet(line) { return /^[•–\-]/.test(line); }
  function stripBullet(line) { return line.replace(/^[•–\-]\s*/, ''); }

  /**
   * Parse the pipe-separated CV text into structured sections.
   * Expected role line:    Title | Company | Dates | Location
   * Expected edu line:      Degree | School | Year
   * Section is determined by EXPERIENCE / EDUCATION header lines.
   *
   * @returns {{experience: Array, education: Array}}
   */
  function parseCv(text) {
    const experience = [];
    const education = [];
    let current = null;          // current role being filled with bullets
    let section = 'header';      // header | experience | education

    String(text || '').split('\n').forEach((raw) => {
      const t = raw.trim();
      if (!t) return;

      if (/^EXPERIENCE$/i.test(t)) { section = 'experience'; current = null; return; }
      if (/^EDUCATION$/i.test(t))  { section = 'education';  current = null; return; }

      const isRow = t.includes('|') && !isBullet(t);

      if (isRow) {
        const parts = t.split('|').map((s) => s.trim());
        if (section === 'education') {
          education.push({ degree: parts[0] || '', school: parts[1] || '', year: parts[2] || '' });
          current = null;
        } else {
          // Treat any pipe row outside EDUCATION as a role. If we're still in
          // 'header' (no EXPERIENCE marker yet) flip to experience implicitly.
          section = section === 'education' ? section : 'experience';
          current = {
            title: parts[0] || '',
            company: parts[1] || '',
            dates: parts[2] || '',
            location: parts[3] || '',
            bullets: [],
          };
          experience.push(current);
        }
      } else if (isBullet(t) && current && section !== 'education') {
        current.bullets.push(stripBullet(t));
      }
    });

    return { experience, education };
  }

  /** { "Bixie AI (P8.io)": [bullets], ... } preserving CV order. */
  function bulletsByCompany(parsed) {
    const out = {};
    (parsed.experience || []).forEach((r) => {
      const key = r.company || r.title;
      if (key) out[key] = r.bullets.slice();
    });
    return out;
  }

  /** The exact company names, in order — used to constrain the LLM tool. */
  function companies(parsed) {
    return (parsed.experience || []).map((r) => r.company || r.title).filter(Boolean);
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Match a candidate company label to one of `keys` (exact → fuzzy). */
  function matchCompanyKey(keys, candidate) {
    const c = norm(candidate);
    return keys.find((k) => k === candidate)
        || keys.find((k) => norm(k) === c)
        || keys.find((k) => norm(k).includes(c) || c.includes(norm(k)))
        || null;
  }

  return { cleanHtml, parseCv, bulletsByCompany, companies, matchCompanyKey };
});
