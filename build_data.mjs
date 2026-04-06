/**
 * build_data.mjs — Builds affix_data.json from raw game data files.
 *
 * Usage: bun run build_data.mjs
 *        node build_data.mjs
 *
 * Input files (in data/):
 *   - affix_structure.json  (from window.itemDB.affixList)
 *   - i18n_ko.json          (Korean translations)
 *   - i18n_en.json          (English translations)
 *
 * Output: affix_data.json (committed to repo, served by GitHub Pages)
 */

import { readFileSync, writeFileSync } from 'fs';

const structure = JSON.parse(readFileSync('data/affix_structure.json', 'utf-8'));
const ko = JSON.parse(readFileSync('data/i18n_ko.json', 'utf-8'));
const en = JSON.parse(readFileSync('data/i18n_en.json', 'utf-8'));

function resolve(key) {
  return { ko: ko[key] || '', en: en[key] || '' };
}

// classSpecificity is a bitmask — each base class occupies one bit.
// Cross-referenced with displayCategory class buckets (24–28) to confirm mapping.
const CLASS_BITS = {
  2:  'Common.Class_Primalist',   // bit 1
  4:  'Common.Class_Mage',        // bit 2
  8:  'Common.Class_Sentinel',    // bit 3
  16: 'Common.Class_Acolyte',     // bit 4
  32: 'Common.Class_Rogue',       // bit 5
};

// Resolve category keys to Korean names
// displayCategoryKeys is an array of i18n keys like "Common.Affix_Category_Attributes"
// Each affix has a `group` field (integer) that indexes into this array
const categoryKeys = structure.displayCategoryKeys || [];
const categoryList = categoryKeys.map(key => {
  const resolved = resolve(key);
  return { key, ko: resolved.ko, en: resolved.en };
});

function getCategoryForAffix(affix) {
  const idx = affix.displayCategory;
  if (idx != null && idx >= 0 && idx < categoryList.length) {
    const cat = categoryList[idx];
    if (cat.ko) return cat.ko;
  }
  return '기타';
}

function convertRoll(roll, forcePercent) {
  const min = roll.min;
  const max = roll.max;

  if (forcePercent) {
    return {
      min: Math.round(min * 100),
      max: Math.round(max * 100),
      suffix: '%',
    };
  }

  return {
    min: Math.round(min),
    max: Math.round(max),
    suffix: '',
  };
}

// Detect whether an affix's rolls represent percentages by checking
// the first tier. All tiers share the same format, but higher tiers
// can exceed 1.0 (e.g., 1.12 = 112%), so per-roll detection fails.
function detectPercent(tiers) {
  for (const tier of tiers) {
    for (const roll of tier.rolls || []) {
      if (roll.min !== 0 || roll.max !== 0) {
        return Math.abs(roll.min) < 1 || Math.abs(roll.max) < 1;
      }
    }
  }
  return false;
}

function processAffix(id, affix, isMulti) {
  const displayName = resolve(`Item_Affixes.Item_Affix_${id}_DisplayName`);
  const title = resolve(`Item_Affixes.Item_Affix_${id}_Title`);
  const filterOverride = resolve(`Item_Affixes.Item_Affix_${id}_FilterOverride`);

  if (!displayName.ko && !displayName.en) return null;

  // Resolve equipment types
  const equipKo = [];
  const equipEn = [];
  if (affix.canRollOn) {
    for (const typeId of affix.canRollOn) {
      const name = resolve(`Item_Names.Item_BaseType_Name_${typeId}`);
      if (name.ko) equipKo.push(name.ko);
      if (name.en) equipEn.push(name.en);
    }
  }

  // Resolve class from bitmask — if exactly one class bit is set, assign
  // that class; otherwise treat as generic ('전체').
  let classKo = '전체';
  let classEn = 'All';
  if (affix.classSpecificity && affix.classSpecificity !== 0) {
    const matchedBits = Object.keys(CLASS_BITS).filter(
      bit => affix.classSpecificity & Number(bit)
    );
    if (matchedBits.length === 1) {
      const cls = resolve(CLASS_BITS[matchedBits[0]]);
      classKo = cls.ko || '전체';
      classEn = cls.en || 'All';
    }
  }

  // Process tiers
  // For multiAffixes, each tier may already have multiple rolls (one per stat),
  // OR the raw data may store them as sequential single-roll tiers that need
  // to be grouped. Detect by checking: if a multiAffix has more raw tiers than
  // expected (>7, the game max), and each tier has exactly 1 roll, then the
  // tiers are flattened and need to be grouped.
  const tiers = [];
  if (affix.tiers) {
    const rawTiers = affix.tiers;
    const pct = detectPercent(rawTiers);
    const hasMultipleRollsPerTier = rawTiers.some(t => (t.rolls || []).length > 1);

    if (isMulti && !hasMultipleRollsPerTier && rawTiers.length > 7) {
      const uniqueLevels = [...new Set(rawTiers.map(t => t.requiredLevel || 0))];
      const statsPerTier = Math.round(rawTiers.length / uniqueLevels.length);

      for (let i = 0; i < rawTiers.length; i += statsPerTier) {
        const group = rawTiers.slice(i, i + statsPerTier);
        const rolls = group.flatMap(t => (t.rolls || []).map(r => convertRoll(r, pct)));
        tiers.push({
          tier: tiers.length + 1,
          level: group[0].requiredLevel || 0,
          rolls,
        });
      }
    } else {
      for (let i = 0; i < rawTiers.length; i++) {
        const tier = rawTiers[i];
        const rolls = (tier.rolls || []).map(r => convertRoll(r, pct));
        tiers.push({
          tier: i + 1,
          level: tier.requiredLevel || 0,
          rolls,
        });
      }
    }
  }

  return {
    id: Number(id),
    name_ko: displayName.ko,
    name_en: displayName.en,
    title_ko: title.ko,
    title_en: title.en,
    filter_ko: filterOverride.ko,
    filter_en: filterOverride.en,
    type: affix.type === 0 ? 'prefix' : 'suffix',
    category: getCategoryForAffix(affix),
    multi: isMulti,
    class_ko: classKo,
    class_en: classEn,
    equip_ko: equipKo,
    equip_en: equipEn,
    tiers,
  };
}

// Process all affixes
const affixes = [];
let singleCount = 0;
let multiCount = 0;

if (structure.singleAffixes) {
  for (const [id, affix] of Object.entries(structure.singleAffixes)) {
    const processed = processAffix(id, affix, false);
    if (processed) {
      affixes.push(processed);
      singleCount++;
    }
  }
}

if (structure.multiAffixes) {
  for (const [id, affix] of Object.entries(structure.multiAffixes)) {
    const processed = processAffix(id, affix, true);
    if (processed) {
      affixes.push(processed);
      multiCount++;
    }
  }
}

// Validation
const SINGLE_MIN = 558;
const SINGLE_MAX = 598;
const MULTI_MIN = 514;
const MULTI_MAX = 554;

if (singleCount < SINGLE_MIN || singleCount > SINGLE_MAX) {
  throw new Error(`Single affix count ${singleCount} outside expected range ${SINGLE_MIN}-${SINGLE_MAX}`);
}
if (multiCount < MULTI_MIN || multiCount > MULTI_MAX) {
  throw new Error(`Multi affix count ${multiCount} outside expected range ${MULTI_MIN}-${MULTI_MAX}`);
}

// Sort by ID
affixes.sort((a, b) => a.id - b.id);

// Compute shortest unique prefix for each affix's stat name.
// The stat name used for regex is filter_ko || name_ko.
// The prefix must be unique: no other affix's stat name should *contain* it.
const allStatNames = [...new Set(affixes.map(a => a.filter_ko || a.name_ko).filter(Boolean))];

function findShortestUnique(name, allNames) {
  for (let len = 2; len <= name.length; len++) {
    const prefix = name.slice(0, len);
    const matches = allNames.filter(n => n.includes(prefix));
    if (matches.length === 1) return prefix;
  }
  return name;
}

let totalSaved = 0;
let shortenedCount = 0;
for (const affix of affixes) {
  const statName = affix.filter_ko || affix.name_ko;
  if (!statName) { affix.short_ko = ''; continue; }
  const short = findShortestUnique(statName, allStatNames);
  affix.short_ko = short;
  if (short.length < statName.length) {
    totalSaved += statName.length - short.length;
    shortenedCount++;
  }
}

// Build categories list (preserving display order from displayCategoryKeys)
// Only include categories that have at least one affix assigned.
const usedCategories = new Set(affixes.map(a => a.category));
const categories = {};
for (const cat of categoryList) {
  if (cat.ko && usedCategories.has(cat.ko)) {
    categories[cat.ko] = cat.en;
  }
}

// Build equipment types lookup
const equipmentTypes = {};
const allEquipIds = new Set();
for (const affix of affixes) {
  if (structure.singleAffixes?.[affix.id]?.canRollOn) {
    for (const id of structure.singleAffixes[affix.id].canRollOn) allEquipIds.add(id);
  }
  if (structure.multiAffixes?.[affix.id]?.canRollOn) {
    for (const id of structure.multiAffixes[affix.id].canRollOn) allEquipIds.add(id);
  }
}
for (const id of allEquipIds) {
  const name = resolve(`Item_Names.Item_BaseType_Name_${id}`);
  if (name.ko || name.en) {
    equipmentTypes[id] = { ko: name.ko, en: name.en };
  }
}

const output = {
  affixes,
  categories,
  equipment_types: equipmentTypes,
  meta: {
    version: '1.4.2',
    total_affixes: affixes.length,
    single_affixes: singleCount,
    multi_affixes: multiCount,
    build_date: new Date().toISOString().split('T')[0],
  },
};

writeFileSync('affix_data.json', JSON.stringify(output, null, 2), 'utf-8');

console.log(`Built affix_data.json`);
console.log(`  Single affixes: ${singleCount}`);
console.log(`  Multi affixes:  ${multiCount}`);
console.log(`  Total:          ${affixes.length}`);
console.log(`  Categories:     ${Object.keys(categories).length}`);
console.log(`  Equipment types: ${Object.keys(equipmentTypes).length}`);
console.log(`  Shortened names: ${shortenedCount} (avg ${Math.round(totalSaved / Math.max(shortenedCount, 1))} chars saved)`);
