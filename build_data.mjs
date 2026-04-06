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

// Class ID → i18n key mapping
const CLASS_KEYS = {
  1: 'Common.Class_Sentinel',
  2: 'Common.Class_Mage',
  3: 'Common.Class_Primalist',
  4: 'Common.Class_Acolyte',
  5: 'Common.Class_Rogue',
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
  const groupIndex = affix.group;
  if (groupIndex != null && groupIndex >= 0 && groupIndex < categoryList.length) {
    const cat = categoryList[groupIndex];
    if (cat.ko) return cat.ko;
  }
  return '기타';
}

function isPercentValue(rawValue) {
  // Raw values < 1 that represent percentages (0.15 = 15%)
  // Values >= 1 are flat values
  // Exception: some percentage values are stored as whole numbers
  // We detect based on whether the value has significant decimals
  return Math.abs(rawValue) < 1 && rawValue !== 0;
}

function convertRoll(roll) {
  const min = roll.min;
  const max = roll.max;

  if (isPercentValue(min) || isPercentValue(max)) {
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

  // Resolve class
  let classKo = '전체';
  let classEn = 'All';
  if (affix.classSpecificity && affix.classSpecificity !== 0) {
    const classKey = CLASS_KEYS[affix.classSpecificity];
    if (classKey) {
      const cls = resolve(classKey);
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
    const hasMultipleRollsPerTier = rawTiers.some(t => (t.rolls || []).length > 1);

    if (isMulti && !hasMultipleRollsPerTier && rawTiers.length > 7) {
      // Flattened multiAffix: group every N sequential tiers into one logical tier
      // N = total raw tiers / expected real tiers
      // Detect N by finding how many stats this affix has (usually 2 or 3)
      // Heuristic: the number of stats = rawTiers.length / (number of unique requiredLevel values)
      const uniqueLevels = [...new Set(rawTiers.map(t => t.requiredLevel || 0))];
      const statsPerTier = Math.round(rawTiers.length / uniqueLevels.length);

      for (let i = 0; i < rawTiers.length; i += statsPerTier) {
        const group = rawTiers.slice(i, i + statsPerTier);
        const rolls = group.flatMap(t => (t.rolls || []).map(convertRoll));
        tiers.push({
          tier: tiers.length + 1,
          level: group[0].requiredLevel || 0,
          rolls,
        });
      }
    } else {
      // Normal case: each tier already has correct rolls
      for (let i = 0; i < rawTiers.length; i++) {
        const tier = rawTiers[i];
        const rolls = (tier.rolls || []).map(convertRoll);
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

// Build categories list (preserving display order from displayCategoryKeys)
const categories = {};
for (const cat of categoryList) {
  if (cat.ko) {
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
