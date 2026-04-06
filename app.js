/**
 * Last Epoch Korean Regex Builder — app.js
 *
 * Pure vanilla JS. No framework, no build step.
 * Loads affix_data.json and renders an interactive regex builder.
 */

// ─── State ──────────────────────────────────────────────────────

const CHAR_LIMIT = 30;

const state = {
  data: null,
  allAffixes: [],
  categoryMap: new Map(),
  expression: '',           // raw output string built by clicking
  activeCategory: 'all',
  previousCategory: 'all',
  searchQuery: '',
  lang: 'ko+en',
};

// ─── DOM References ─────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  regexText: $('#regexText'),
  charCount: $('#charCount'),
  orBtn: $('#orBtn'),
  andBtn: $('#andBtn'),
  clearBtn: $('#clearBtn'),
  copyBtn: $('#copyBtn'),
  copyFeedback: $('#copyFeedback'),
  searchBox: $('#searchBox'),
  categoryTabs: $('#categoryTabs'),
  affixList: $('#affixList'),
  langToggle: $('#langToggle'),
  examplesHeader: $('#examplesHeader'),
  examplesSection: $('#examplesSection'),
  refBtn: $('#refBtn'),
  refModal: $('#refModal'),
  refModalClose: $('#refModalClose'),
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

  state.allAffixes = deduplicateAffixes(state.data.affixes);
  buildCategoryMap();
  buildCategoryTabs();
  renderActiveTab();
  renderOutput();
  bindEvents();
}

// ─── Deduplication ─────────────────────────────────────────────

function deduplicateAffixes(affixes) {
  const seen = new Map();
  for (const affix of affixes) {
    const key = affix.filter_ko || affix.name_ko;
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, { ...affix, _statName: key, _shortName: affix.short_ko || key });
    }
  }
  return [...seen.values()];
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

function buildCategoryTabs() {
  if (!state.data.categories) return;
  for (const [ko, en] of Object.entries(state.data.categories)) {
    if (!state.categoryMap.has(ko)) continue;
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

  if (!state.searchQuery) return pool;

  const q = state.searchQuery.toLowerCase();
  return pool.filter(affix => {
    const searchable = [
      affix.name_ko, affix.name_en,
      affix.title_ko, affix.title_en,
      affix.filter_ko, affix.filter_en,
    ].join(' ').toLowerCase();
    return searchable.includes(q);
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

  const statName = affix._statName;
  if (isStatInExpression(statName, affix._shortName)) {
    card.classList.add('selected');
  }

  const name = getDisplayName(affix);
  const enName = state.lang !== 'ko' ? `<span class="en-name">${affix.name_en}</span>` : '';

  card.innerHTML = `
    <div class="stat-line">${name}${enName}</div>
  `;

  card.addEventListener('click', () => {
    appendAffix(affix._shortName);
  });

  return card;
}

function isStatInExpression(statName, shortName) {
  return state.expression.includes('/' + shortName + '/') ||
         state.expression.includes('/' + statName + '/');
}

// ─── Display Helpers ────────────────────────────────────────────

function getDisplayName(affix) {
  if (state.lang === 'en') return affix.name_en;
  return affix.name_ko;
}

// ─── Expression Building ────────────────────────────────────────

function appendAffix(statName) {
  const token = `/${statName}/`;
  if (state.expression && !state.expression.endsWith('&') && !state.expression.endsWith('|')) {
    state.expression += '|';
  }
  state.expression += token;
  renderOutput();
  renderActiveTab();
}

function appendMacro(macro) {
  if (state.expression && !state.expression.endsWith('&') && !state.expression.endsWith('|')) {
    state.expression += '&';
  }
  state.expression += macro;
  renderOutput();
}

function appendOperator(op) {
  if (!state.expression) return;
  if (state.expression.endsWith('&') || state.expression.endsWith('|')) return;
  state.expression += op;
  renderOutput();
}

function clearExpression() {
  state.expression = '';
  renderOutput();
  renderActiveTab();
}

// ─── Output ─────────────────────────────────────────────────────

function renderOutput() {
  if (!state.expression) {
    dom.regexText.innerHTML = '<span class="regex-placeholder">접사를 클릭하여 정규표현식을 만드세요</span>';
    updateCharCount(0);
    return;
  }

  dom.regexText.textContent = state.expression;
  updateCharCount(state.expression.length);
}

function updateCharCount(len) {
  dom.charCount.textContent = `${len}/${CHAR_LIMIT}`;
  if (len > CHAR_LIMIT * 0.9) {
    dom.charCount.classList.add('warning');
  } else {
    dom.charCount.classList.remove('warning');
  }
}

// ─── Clipboard ──────────────────────────────────────────────────

async function copyToClipboard() {
  if (!state.expression) return;

  try {
    await navigator.clipboard.writeText(state.expression);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = state.expression;
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

  // Operator buttons
  dom.orBtn.addEventListener('click', () => appendOperator('|'));
  dom.andBtn.addEventListener('click', () => appendOperator('&'));

  // Clear & Copy
  dom.clearBtn.addEventListener('click', clearExpression);
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

  // Category tabs
  dom.categoryTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-category]');
    if (!btn) return;
    setActiveCategory(btn.dataset.category);
    if (state.searchQuery) {
      state.searchQuery = '';
      dom.searchBox.value = '';
    }
    renderActiveTab();
  });

  // Collapsible sections
  dom.examplesHeader.addEventListener('click', () => {
    dom.examplesHeader.classList.toggle('collapsed');
    dom.examplesSection.style.display =
      dom.examplesHeader.classList.contains('collapsed') ? 'none' : '';
  });

  // Reference modal
  dom.refBtn.addEventListener('click', () => {
    dom.refModal.classList.add('open');
  });
  dom.refModalClose.addEventListener('click', () => {
    dom.refModal.classList.remove('open');
  });
  dom.refModal.addEventListener('click', (e) => {
    if (e.target === dom.refModal) dom.refModal.classList.remove('open');
  });

  // Preset buttons inside modal — insert and auto-close
  dom.refModal.addEventListener('click', (e) => {
    const btn = e.target.closest('.macro-btn');
    if (!btn) return;
    appendMacro(btn.dataset.macro);
    dom.refModal.classList.remove('open');
  });

  // Example cards: set expression on click
  for (const card of $$('.example-card')) {
    card.addEventListener('click', () => {
      state.expression = card.dataset.regex;
      renderOutput();
      renderActiveTab();
      navigator.clipboard?.writeText(state.expression);
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
