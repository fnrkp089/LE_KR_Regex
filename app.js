/**
 * Last Epoch Korean Regex Builder — app.js
 *
 * Pure vanilla JS. No framework, no build step.
 * Loads affix_data.json and renders an interactive regex builder.
 */

// ─── Range to Regex ─────────────────────────────────────────────
// Generates a regex pattern matching any integer in [min, max].
//
// Examples:
//   rangeToRegex(42, 42)   → "42"
//   rangeToRegex(3, 8)     → "[3-8]"
//   rangeToRegex(10, 19)   → "1[0-9]"
//   rangeToRegex(148, 149) → "14[8-9]"
//   rangeToRegex(148, 156) → "(14[8-9]|15[0-6])"
//   rangeToRegex(98, 102)  → "(9[8-9]|10[0-2])"
//   rangeToRegex(8, 12)    → "([8-9]|1[0-2])"

function rangeToRegex(min, max) {
  if (min > max) return String(min);
  if (min === max) return String(min);
  if (min < 0) min = 0;

  const parts = [];
  _splitRange(min, max, parts);

  if (parts.length === 1) return parts[0];
  return '(' + parts.join('|') + ')';
}

// Round min up to the nearest number ending in 999...9 (same digit count)
// e.g., 148 → 149, 15 → 19, 10 → 19, 100 → 199
function _roundUp(n) {
  const s = String(n);
  const last = Number(s[s.length - 1]);
  if (last === 9) return n;
  return n + (9 - last);
}

// Round max down to the nearest number ending in 000...0 (same digit count)
// e.g., 156 → 150, 25 → 20, 99 → 90, 199 → 100
function _roundDown(n) {
  const s = String(n);
  const last = Number(s[s.length - 1]);
  if (last === 0) return n;
  return n - last;
}

// Generate regex for a range where min ends in 0 and max ends in 9
// and they share all digits except possibly the leading ones
// e.g., 10-19 → "1[0-9]", 100-199 → "1[0-9][0-9]", 20-99 → "[2-9][0-9]"
function _rangeBlock(min, max) {
  const minStr = String(min);
  const maxStr = String(max);

  if (minStr.length !== maxStr.length) {
    // shouldn't happen in a well-formed block, but guard
    return null;
  }

  let result = '';
  for (let i = 0; i < minStr.length; i++) {
    const lo = minStr[i];
    const hi = maxStr[i];
    if (lo === hi) {
      result += lo;
    } else if (lo === '0' && hi === '9') {
      result += '[0-9]';
    } else {
      result += '[' + lo + '-' + hi + ']';
    }
  }
  return result;
}

function _splitRange(min, max, parts) {
  if (min === max) {
    parts.push(String(min));
    return;
  }

  const minStr = String(min);
  const maxStr = String(max);

  // Different digit counts: split at the boundary
  if (minStr.length !== maxStr.length) {
    const boundary = Math.pow(10, minStr.length) - 1;
    _splitRange(min, boundary, parts);
    _splitRange(boundary + 1, max, parts);
    return;
  }

  // Same length. Try to express as a single block.
  // Check if min ends in 0s and max ends in 9s at every trailing position
  const block = _rangeBlock(min, max);
  if (block !== null) {
    // Verify it's a valid block (each digit pair: lo <= hi)
    let valid = true;
    for (let i = 0; i < minStr.length; i++) {
      if (Number(minStr[i]) > Number(maxStr[i])) { valid = false; break; }
    }
    // Also check that trailing digits form 0-9 pairs correctly
    // The block is valid if for each position i:
    //   if digits before i are all equal, lo[i] <= hi[i]
    //   if a prior digit had lo < hi, then lo[i] must be 0 and hi[i] must be 9
    let seenDiff = false;
    for (let i = 0; i < minStr.length; i++) {
      if (seenDiff) {
        if (minStr[i] !== '0' || maxStr[i] !== '9') { valid = false; break; }
      } else if (minStr[i] !== maxStr[i]) {
        seenDiff = true;
      }
    }
    if (valid) {
      parts.push(block);
      return;
    }
  }

  // Not a clean block. Split:
  // 1) min to min rounded up to end in 9
  // 2) middle full blocks
  // 3) max rounded down to start at 0 to max
  const hi1 = _roundUp(min);
  const lo2 = _roundDown(max);

  if (hi1 >= max) {
    // min and max are in the same "last digit" block
    // e.g., 45-48 → just differ in last digit
    const prefix = minStr.slice(0, -1);
    const loDigit = minStr[minStr.length - 1];
    const hiDigit = maxStr[maxStr.length - 1];
    if (loDigit === hiDigit) {
      parts.push(prefix + loDigit);
    } else {
      parts.push(prefix + '[' + loDigit + '-' + hiDigit + ']');
    }
    return;
  }

  // Part 1: min to hi1
  _splitRange(min, hi1, parts);

  // Part 2: middle (hi1+1 to lo2-1), if exists
  if (hi1 + 1 <= lo2 - 1) {
    _splitRange(hi1 + 1, lo2 - 1, parts);
  }

  // Part 3: lo2 to max
  if (lo2 <= max) {
    _splitRange(lo2, max, parts);
  }
}

// ─── State ──────────────────────────────────────────────────────

const CHAR_LIMIT = 30;

const state = {
  data: null,             // loaded affix data
  allAffixes: [],         // flat array
  categoryMap: new Map(), // category → affix[]
  selectedStats: [],      // array of { statName, affixId }
  activeCategory: 'all',
  previousCategory: 'all',
  searchQuery: '',
  typeFilter: 'all',
  equipFilter: 'all',
  classFilter: 'all',
  lang: 'ko+en',
  mode: 'regex',
  expandedCards: new Set(),
  renderedTabs: new Set(),
};

// ─── DOM References ─────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  regexText: $('#regexText'),
  charCount: $('#charCount'),
  modeSelect: $('#modeSelect'),
  macroInput: $('#macroInput'),
  clearBtn: $('#clearBtn'),
  copyBtn: $('#copyBtn'),
  copyFeedback: $('#copyFeedback'),
  searchBox: $('#searchBox'),
  typeFilter: $('#typeFilter'),
  equipFilter: $('#equipFilter'),
  classFilter: $('#classFilter'),
  categoryTabs: $('#categoryTabs'),
  affixList: $('#affixList'),
  langToggle: $('#langToggle'),
  examplesHeader: $('#examplesHeader'),
  examplesSection: $('#examplesSection'),
  macroHeader: $('#macroHeader'),
  macroSection: $('#macroSection'),
};

// ─── Init ───────────────────────────────────────────────────────

async function init() {
  try {
    const resp = await fetch('affix_data.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.data = await resp.json();
  } catch (err) {
    dom.affixList.innerHTML = `
      <div class="error-banner">
        데이터를 불러올 수 없습니다. (${err.message})
        <br>
        <button onclick="location.reload()">다시 시도</button>
      </div>`;
    return;
  }

  state.allAffixes = state.data.affixes;
  buildCategoryMap();
  buildFilters();
  buildCategoryTabs();
  renderActiveTab();
  updateOutput();
  bindEvents();
}

// ─── Data Indexing ──────────────────────────────────────────────

function buildCategoryMap() {
  state.categoryMap.set('all', state.allAffixes);
  for (const affix of state.allAffixes) {
    const cat = affix.category;
    if (!state.categoryMap.has(cat)) {
      state.categoryMap.set(cat, []);
    }
    state.categoryMap.get(cat).push(affix);
  }
}

function buildFilters() {
  // Equipment filter
  if (state.data.equipment_types) {
    const equipSelect = dom.equipFilter;
    const types = Object.entries(state.data.equipment_types)
      .sort((a, b) => a[1].ko.localeCompare(b[1].ko, 'ko'));
    for (const [id, names] of types) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = names.ko;
      equipSelect.appendChild(opt);
    }
  }

  // Class filter
  const classes = new Set();
  for (const affix of state.allAffixes) {
    if (affix.class_ko !== '전체') classes.add(affix.class_ko);
  }
  for (const cls of [...classes].sort()) {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = cls;
    dom.classFilter.appendChild(opt);
  }
}

function buildCategoryTabs() {
  if (!state.data.categories) return;
  for (const [ko, en] of Object.entries(state.data.categories)) {
    const btn = document.createElement('button');
    btn.dataset.category = ko;
    btn.textContent = ko;
    dom.categoryTabs.appendChild(btn);
  }
}

// ─── Filtering ──────────────────────────────────────────────────

function getFilteredAffixes() {
  let pool = state.activeCategory === 'all'
    ? state.allAffixes
    : (state.categoryMap.get(state.activeCategory) || []);

  return pool.filter(affix => {
    // Type filter
    if (state.typeFilter !== 'all' && affix.type !== state.typeFilter) return false;

    // Equipment filter
    if (state.equipFilter !== 'all') {
      const equipId = Number(state.equipFilter);
      const raw = state.data.affixes.find(a => a.id === affix.id);
      // Check if equip_ko or equip_en contains the equipment
      const equipName = state.data.equipment_types?.[state.equipFilter];
      if (equipName && !affix.equip_ko.includes(equipName.ko)) return false;
    }

    // Class filter
    if (state.classFilter !== 'all') {
      if (affix.class_ko !== '전체' && affix.class_ko !== state.classFilter) return false;
    }

    // Search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const searchable = [
        affix.name_ko, affix.name_en,
        affix.title_ko, affix.title_en,
        affix.filter_ko, affix.filter_en,
      ].join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    return true;
  });
}

// ─── Rendering ──────────────────────────────────────────────────

function renderActiveTab() {
  const affixes = getFilteredAffixes();

  if (affixes.length === 0) {
    dom.affixList.innerHTML = '<div class="empty-state">검색 결과 없음</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const affix of affixes) {
    fragment.appendChild(createAffixCard(affix));
  }
  dom.affixList.innerHTML = '';
  dom.affixList.appendChild(fragment);
}

function createAffixCard(affix) {
  const card = document.createElement('div');
  card.className = 'affix-card';
  card.dataset.id = affix.id;

  // Check if selected
  const statName = getStatName(affix);
  if (state.selectedStats.some(s => s.affixId === affix.id)) {
    card.classList.add('selected');
  }

  // Check if expanded
  const isExpanded = state.expandedCards.has(affix.id);
  if (isExpanded) card.classList.add('expanded');

  // Build stat lines
  let statsHtml = '';
  if (affix.tiers.length > 0) {
    const t1 = affix.tiers[0];
    for (const roll of t1.rolls) {
      const range = formatRange(roll);
      const name = getDisplayName(affix);
      const enName = state.lang !== 'ko' ? `<span class="en-name">${affix.name_en}</span>` : '';
      statsHtml += `<div class="stat-line"><span class="range">${range}</span> ${name}${enName}</div>`;
    }
  } else {
    const name = getDisplayName(affix);
    statsHtml = `<div class="stat-line">${name}</div>`;
  }

  // Meta line
  const typeBadge = affix.type === 'prefix'
    ? '<span class="prefix-badge">접두사</span>'
    : '<span class="suffix-badge">접미사</span>';
  const title = state.lang === 'en' ? affix.title_en : affix.title_ko;
  const equipList = affix.equip_ko.slice(0, 3).join(', ');
  const equipMore = affix.equip_ko.length > 3 ? '+' : '';

  card.innerHTML = `
    ${statsHtml}
    <div class="meta-line">
      ${title ? title + ' &middot; ' : ''}${typeBadge}${equipList ? ' &middot; ' + equipList + equipMore : ''}
      ${affix.class_ko !== '전체' ? ' &middot; ' + affix.class_ko : ''}
    </div>
    ${isExpanded ? renderTierList(affix) : ''}
  `;

  // Card click: toggle expand
  card.addEventListener('click', (e) => {
    if (e.target.closest('.tier-row')) return;
    if (e.target.closest('.stat-line')) {
      // Click on stat line: add/remove from regex
      toggleStat(affix, e.target.closest('.stat-line'));
      return;
    }
    // Toggle expand
    if (state.expandedCards.has(affix.id)) {
      state.expandedCards.delete(affix.id);
    } else {
      state.expandedCards.add(affix.id);
    }
    renderActiveTab();
  });

  return card;
}

function renderTierList(affix) {
  let html = '<div class="tier-list">';
  for (const tier of affix.tiers) {
    const tierNum = tier.tier;
    const tierClass = `t${Math.min(tierNum, 7)}`;

    for (let ri = 0; ri < tier.rolls.length; ri++) {
      const roll = tier.rolls[ri];
      const range = formatRange(roll);
      const statName = getStatName(affix, ri);
      const regex = buildTierRegex(roll, statName);

      html += `
        <div class="tier-row" data-tier="${tierNum}" data-roll-index="${ri}"
             data-affix-id="${affix.id}">
          ${ri === 0 ? `<span class="tier-badge ${tierClass}">T${tierNum}</span>` : '<span class="tier-badge"></span>'}
          <span class="tier-range">${range}</span>
          <span class="tier-stat">${statName}</span>
          <span class="tier-regex-preview">${regex}</span>
        </div>`;
    }
  }
  html += '</div>';
  return html;
}

// ─── Display Helpers ────────────────────────────────────────────

function getDisplayName(affix) {
  if (state.lang === 'en') return affix.name_en;
  return affix.name_ko;
}

function getStatName(affix, rollIndex) {
  // For regex output, always use Korean
  if (affix.filter_ko) return affix.filter_ko;
  return affix.name_ko;
}

function formatRange(roll) {
  if (roll.min === roll.max) {
    return `${roll.min}${roll.suffix}`;
  }
  return `${roll.min}${roll.suffix}-${roll.max}${roll.suffix}`;
}

function buildTierRegex(roll, statName) {
  const rangePattern = rangeToRegex(roll.min, roll.max);
  const suffix = roll.suffix === '%' ? '%' : '';
  return `/${rangePattern}${suffix}.*?${statName}/`;
}

// ─── Selection & Output ─────────────────────────────────────────

function toggleStat(affix, statLineEl) {
  const statName = getStatName(affix);
  const idx = state.selectedStats.findIndex(s => s.affixId === affix.id);

  if (idx >= 0) {
    state.selectedStats.splice(idx, 1);
  } else {
    state.selectedStats.push({ statName, affixId: affix.id });
  }

  updateOutput();
  renderActiveTab();
}

function addTierRegex(affixId, tierNum, rollIndex) {
  const affix = state.allAffixes.find(a => a.id === affixId);
  if (!affix) return;

  const tier = affix.tiers.find(t => t.tier === tierNum);
  if (!tier) return;

  const roll = tier.rolls[rollIndex] || tier.rolls[0];
  const statName = getStatName(affix, rollIndex);
  const regex = buildTierRegex(roll, statName);

  // Replace existing entry for this affix, or add new
  const idx = state.selectedStats.findIndex(s => s.affixId === affixId);
  const entry = { statName, affixId, tierRegex: regex };

  if (idx >= 0) {
    state.selectedStats[idx] = entry;
  } else {
    state.selectedStats.push(entry);
  }

  updateOutput();
  renderActiveTab();
}

function updateOutput() {
  if (state.selectedStats.length === 0) {
    dom.regexText.innerHTML = '<span class="regex-placeholder">접사를 클릭하여 정규표현식을 만드세요</span>';
    updateCharCount(0);
    return;
  }

  // Build the patterns
  const patterns = state.selectedStats.map(s => {
    if (s.tierRegex) {
      // Tier-specific regex: already includes /slashes/
      return s.tierRegex.slice(1, -1); // strip outer slashes
    }
    return s.statName;
  });

  let output;
  const inner = patterns.join('|');

  if (state.mode === 'expression') {
    const macro = dom.macroInput.value.trim();
    if (macro) {
      output = `${macro}&/${inner}/`;
    } else {
      output = `/${inner}/`;
    }
  } else {
    output = `/${inner}/`;
  }

  dom.regexText.textContent = output;
  updateCharCount(output.length);
}

function updateCharCount(len) {
  dom.charCount.textContent = `${len}/${CHAR_LIMIT}`;
  if (len > CHAR_LIMIT * 0.9) {
    dom.charCount.classList.add('warning');
  } else {
    dom.charCount.classList.remove('warning');
  }
}

function getOutputText() {
  if (state.selectedStats.length === 0) return '';
  return dom.regexText.textContent;
}

// ─── Clipboard ──────────────────────────────────────────────────

async function copyToClipboard() {
  const text = getOutputText();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for insecure contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  dom.copyFeedback.classList.add('show');
  setTimeout(() => dom.copyFeedback.classList.remove('show'), 1500);
}

// ─── Event Binding ──────────────────────────────────────────────

function bindEvents() {
  // Language toggle
  dom.langToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-lang]');
    if (!btn) return;
    dom.langToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.lang = btn.dataset.lang;
    renderActiveTab();
  });

  // Mode select
  dom.modeSelect.addEventListener('change', () => {
    state.mode = dom.modeSelect.value;
    dom.macroInput.style.display = state.mode === 'expression' ? '' : 'none';
    updateOutput();
  });

  // Macro input
  dom.macroInput.addEventListener('input', () => {
    updateOutput();
  });

  // Clear
  dom.clearBtn.addEventListener('click', () => {
    state.selectedStats = [];
    dom.macroInput.value = '';
    updateOutput();
    renderActiveTab();
  });

  // Copy
  dom.copyBtn.addEventListener('click', copyToClipboard);

  // Search with debounce
  let searchTimer;
  dom.searchBox.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = dom.searchBox.value.trim();
      if (query && state.activeCategory !== 'all') {
        state.previousCategory = state.activeCategory;
        setActiveCategory('all');
      } else if (!query && state.previousCategory !== 'all') {
        setActiveCategory(state.previousCategory);
        state.previousCategory = 'all';
      }
      state.searchQuery = query;
      renderActiveTab();
    }, 200);
  });

  // Type filter
  dom.typeFilter.addEventListener('change', () => {
    state.typeFilter = dom.typeFilter.value;
    renderActiveTab();
  });

  // Equipment filter
  dom.equipFilter.addEventListener('change', () => {
    state.equipFilter = dom.equipFilter.value;
    renderActiveTab();
  });

  // Class filter
  dom.classFilter.addEventListener('change', () => {
    state.classFilter = dom.classFilter.value;
    renderActiveTab();
  });

  // Category tabs
  dom.categoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-category]');
    if (!btn) return;
    setActiveCategory(btn.dataset.category);
    // Clear search when manually switching tabs
    if (state.searchQuery) {
      state.searchQuery = '';
      dom.searchBox.value = '';
    }
    renderActiveTab();
  });

  // Tier row clicks (delegated)
  dom.affixList.addEventListener('click', (e) => {
    const tierRow = e.target.closest('.tier-row');
    if (!tierRow) return;
    e.stopPropagation();

    const affixId = Number(tierRow.dataset.affixId);
    const tierNum = Number(tierRow.dataset.tier);
    const rollIndex = Number(tierRow.dataset.rollIndex);
    addTierRegex(affixId, tierNum, rollIndex);
  });

  // Collapsible sections
  dom.examplesHeader.addEventListener('click', () => {
    dom.examplesHeader.classList.toggle('collapsed');
    dom.examplesSection.style.display =
      dom.examplesHeader.classList.contains('collapsed') ? 'none' : '';
  });

  dom.macroHeader.addEventListener('click', () => {
    dom.macroHeader.classList.toggle('collapsed');
    dom.macroSection.style.display =
      dom.macroHeader.classList.contains('collapsed') ? 'none' : '';
  });

  // Example cards: copy regex on click
  for (const card of $$('.example-card')) {
    card.addEventListener('click', () => {
      const regex = card.dataset.regex;
      dom.regexText.textContent = regex;
      updateCharCount(regex.length);
      // Also copy
      navigator.clipboard?.writeText(regex);
      dom.copyFeedback.classList.add('show');
      setTimeout(() => dom.copyFeedback.classList.remove('show'), 1500);
    });
  }
}

function setActiveCategory(category) {
  state.activeCategory = category;
  dom.categoryTabs.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
}

// ─── Go ─────────────────────────────────────────────────────────

init();
