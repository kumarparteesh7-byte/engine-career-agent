/**
 * Domain packs — the single source of truth for each role family.
 *
 * Each domain defines:
 *   - keywords:   title terms used for SOURCING (scan adapters filter on these)
 *   - dimensions: the SCORING rubric (0–5 each, weights sum to ~1.0) + UI labels
 *   - filterThreshold: total at/above which a role is "worth tailoring"
 *
 * Adding a domain here automatically makes it available for sourcing,
 * scoring (via src/scorer/rubric.js), and the dashboard dimension bars.
 */

const DOMAINS = {
  pm: {
    id: 'pm',
    label: 'Product Management',
    keywords: [
      'product manager', 'product management', 'senior pm', 'staff pm', 'group pm',
      'principal pm', 'director of product', 'head of product', 'vp product',
      'product lead', 'product owner', 'associate product manager',
    ],
    filterThreshold: 3.5,
    dimensions: [
      { key: 'productSense', label: 'Product Sense', abbr: 'PS', weight: 0.25,
        signals: ['customer/user empathy in JD', 'vision or strategy ownership', 'roadmap prioritisation', 'discovery/design partnership', '"why" framing over "what/how"'],
        antiSignals: ['purely execution/delivery focus', 'spec-writing only, no strategy'] },
      { key: 'execution', label: 'Execution', abbr: 'EX', weight: 0.20,
        signals: ['cross-functional delivery ownership', 'launch accountability', 'agile leadership', 'dependency management', 'unblocking engineering'],
        antiSignals: ['project coordinator only', 'no ownership language'] },
      { key: 'influence', label: 'Influence', abbr: 'IN', weight: 0.20,
        signals: ['stakeholder alignment across functions', 'executive communication', 'driving consensus in ambiguity', 'partner/sales/marketing collaboration'],
        antiSignals: ['manages direct reports only, no lateral influence'] },
      { key: 'discovery', label: 'Discovery', abbr: 'DI', weight: 0.15,
        signals: ['user research / qualitative methods', 'market or competitive analysis', 'hypothesis-driven development', 'experimentation / A-B ownership'],
        antiSignals: ['requirements handed down from leadership only'] },
      { key: 'metricsImpact', label: 'Metrics & Impact', abbr: 'MI', weight: 0.20,
        signals: ['outcome ownership (revenue, retention, NPS, DAU)', 'data-driven decisions', 'OKR/KPI accountability', 'quantified impact'],
        antiSignals: ['output-only metrics (stories delivered, bugs closed)'] },
    ],
  },

  se: {
    id: 'se',
    label: 'Solutions / Pre-Sales Engineering',
    keywords: [
      'solutions engineer', 'solution engineer', 'sales engineer', 'pre-sales',
      'presales', 'pre sales', 'solutions consultant', 'sales consultant',
      'technical consultant', 'solutions architect', 'implementation engineer',
      'field engineer', 'customer engineer',
    ],
    filterThreshold: 3.5,
    dimensions: [
      { key: 'technicalDepth', label: 'Technical Depth', abbr: 'TD', weight: 0.25,
        signals: ['APIs/integrations/architecture', 'building demos or POCs', 'hands-on with the product stack', 'troubleshooting technical objections'],
        antiSignals: ['non-technical sales only', 'no product/technical depth'] },
      { key: 'discoveryQualification', label: 'Discovery & Qualification', abbr: 'DQ', weight: 0.20,
        signals: ['needs analysis / requirements gathering', 'qualifying technical fit', 'mapping pain to capability'],
        antiSignals: ['order-taking, no discovery'] },
      { key: 'demoStorytelling', label: 'Demo & Storytelling', abbr: 'DS', weight: 0.20,
        signals: ['persona-driven demos', 'tailoring narrative to the buyer', 'presenting to technical + business audiences'],
        antiSignals: ['generic canned demo only'] },
      { key: 'stakeholderInfluence', label: 'Stakeholder Influence', abbr: 'SI', weight: 0.15,
        signals: ['multi-threaded across buyer org', 'champion building', 'executive + practitioner communication'],
        antiSignals: ['single point of contact only'] },
      { key: 'dealImpact', label: 'Revenue Impact', abbr: 'RI', weight: 0.20,
        signals: ['quota / pipeline influence', 'win-rate or conversion ownership', 'closing or technical-win accountability'],
        antiSignals: ['no commercial outcome ownership'] },
    ],
  },

  csm: {
    id: 'csm',
    label: 'Customer Success',
    keywords: [
      'customer success manager', 'customer success', 'technical account manager',
      'customer success engineer', 'implementation manager', 'onboarding manager',
      'customer onboarding', 'client success', 'csm', 'customer experience manager',
    ],
    filterThreshold: 3.5,
    dimensions: [
      { key: 'relationshipManagement', label: 'Relationship Management', abbr: 'RM', weight: 0.22,
        signals: ['owning a book of accounts', 'trusted-advisor framing', 'executive business reviews', 'stakeholder mapping'],
        antiSignals: ['transactional support only'] },
      { key: 'retentionExpansion', label: 'Retention & Expansion', abbr: 'RE', weight: 0.22,
        signals: ['renewal ownership', 'upsell / cross-sell / NRR', 'churn reduction accountability'],
        antiSignals: ['no commercial / renewal ownership'] },
      { key: 'productAdoption', label: 'Adoption & Onboarding', abbr: 'AO', weight: 0.20,
        signals: ['driving product adoption', 'onboarding / implementation', 'success planning and outcomes'],
        antiSignals: ['reactive ticket handling only'] },
      { key: 'crossFunctionalAdvocacy', label: 'Advocacy & Voice-of-Customer', abbr: 'VC', weight: 0.16,
        signals: ['feeding insight to product/eng', 'escalation management', 'references / case studies'],
        antiSignals: ['siloed, no internal influence'] },
      { key: 'dataDrivenHealth', label: 'Data & Health', abbr: 'DH', weight: 0.20,
        signals: ['health scores / usage analytics', 'proactive risk identification', 'metrics-led account plans'],
        antiSignals: ['no data-driven account management'] },
    ],
  },

  sales: {
    id: 'sales',
    label: 'Sales / Account Executive',
    keywords: [
      'account executive', 'sales executive', 'business development', 'sdr', 'bdr',
      'sales development', 'enterprise sales', 'sales representative', 'sales manager',
      'inside sales', 'field sales', 'commercial account executive',
    ],
    filterThreshold: 3.5,
    dimensions: [
      { key: 'pipelineGeneration', label: 'Pipeline Generation', abbr: 'PG', weight: 0.20,
        signals: ['prospecting / outbound', 'pipeline creation ownership', 'territory development'],
        antiSignals: ['inbound order-taking only'] },
      { key: 'dealClosing', label: 'Closing', abbr: 'CL', weight: 0.25,
        signals: ['full-cycle closing', 'negotiation', 'quota carrying', 'win-rate ownership'],
        antiSignals: ['no closing responsibility'] },
      { key: 'discoveryQualification', label: 'Discovery & Qualification', abbr: 'DQ', weight: 0.18,
        signals: ['MEDDIC/SPIN or similar', 'needs discovery', 'qualifying fit and budget'],
        antiSignals: ['no structured qualification'] },
      { key: 'relationshipInfluence', label: 'Relationship & Influence', abbr: 'RI', weight: 0.15,
        signals: ['multi-threading', 'executive selling', 'champion development'],
        antiSignals: ['single-threaded transactional'] },
      { key: 'quotaImpact', label: 'Quota & Impact', abbr: 'QI', weight: 0.22,
        signals: ['quota attainment history', 'revenue / ARR ownership', 'quantified sales results'],
        antiSignals: ['no revenue accountability'] },
    ],
  },

  account: {
    id: 'account',
    label: 'Account Management',
    keywords: [
      'account manager', 'key account manager', 'strategic account manager',
      'account director', 'client partner', 'relationship manager', 'partner manager',
      'client manager', 'enterprise account manager', 'named account manager',
    ],
    filterThreshold: 3.5,
    dimensions: [
      { key: 'relationshipManagement', label: 'Relationship Management', abbr: 'RM', weight: 0.24,
        signals: ['owning strategic accounts', 'trusted-advisor / partner framing', 'executive relationships', 'QBRs'],
        antiSignals: ['transactional, no relationship depth'] },
      { key: 'accountGrowth', label: 'Account Growth', abbr: 'AG', weight: 0.24,
        signals: ['upsell / cross-sell ownership', 'whitespace / expansion planning', 'growing account revenue'],
        antiSignals: ['maintenance only, no growth target'] },
      { key: 'renewalRetention', label: 'Renewal & Retention', abbr: 'RR', weight: 0.18,
        signals: ['renewal ownership', 'retention / NRR targets', 'churn risk management'],
        antiSignals: ['no renewal accountability'] },
      { key: 'crossFunctionalCoordination', label: 'Cross-Functional Coordination', abbr: 'CC', weight: 0.14,
        signals: ['coordinating delivery/CS/product for the account', 'escalation ownership', 'internal orchestration'],
        antiSignals: ['no internal coordination'] },
      { key: 'commercialImpact', label: 'Commercial Impact', abbr: 'CI', weight: 0.20,
        signals: ['revenue / margin ownership', 'quantified account results', 'forecasting accountability'],
        antiSignals: ['no commercial outcome ownership'] },
    ],
  },
};

const DEFAULT_DOMAIN = 'pm';

function getDomain(id) {
  return DOMAINS[id] || DOMAINS[DEFAULT_DOMAIN];
}

/** Keywords for one or more domain ids (deduped, lowercased). */
function keywordsForDomains(ids) {
  const set = new Set();
  (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
    (DOMAINS[id]?.keywords || []).forEach((k) => set.add(k.toLowerCase()));
  });
  return [...set];
}

/** Compact list for prompts / UI selectors. */
function domainList() {
  return Object.values(DOMAINS).map((d) => ({ id: d.id, label: d.label }));
}

module.exports = { DOMAINS, DEFAULT_DOMAIN, getDomain, keywordsForDomains, domainList };
