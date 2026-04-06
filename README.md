# 라스트 에포크 정규표현식 빌더

Last Epoch 한국어 보관함 검색 정규표현식 빌더.

Korean Last Epoch players can browse 1,112 affixes in Korean, click to build regex patterns, and paste them directly into the in-game stash search.

## Features

- Browse all affixes in Korean with English subtitles (KO+EN mode)
- Click affixes to build regex patterns
- Click specific tiers for range-aware regex (e.g., `/(14[8-9]|15[0-6]).*?방어력/`)
- Category tabs: 핵심, 공격적인, 방어적인, 상태이상, 클래스 특정, 신상, 기타
- Search in Korean or English
- Filter by type (접두사/접미사), equipment, class
- Expression mode: combine macros with regex (e.g., `T7&/치명타 확률/`)
- Copy to clipboard
- Macro reference table
- Dark theme matching Last Epoch aesthetic

## Usage

Visit: **[fnrkp089.github.io](https://fnrkp089.github.io)** (or wherever deployed)

## Development

### Prerequisites

- [Bun](https://bun.sh) (or Node.js) for the build script
- Raw game data files (see Data Update below)

### Data Update

When Last Epoch patches change affix data:

1. Navigate to `https://www.lastepochtools.com/db/ko/prefixes`
2. Open browser console and run:

```javascript
// Extract affix structure
copy(JSON.stringify(window.itemDB.affixList));
// Paste into data/affix_structure.json

// Download Korean translations
fetch('/data/version142/i18n/full/ko.json?14')
  .then(r => r.json())
  .then(d => {
    const blob = new Blob([JSON.stringify(d)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'i18n_ko.json'; a.click();
  });

// Download English translations
fetch('/data/version142/i18n/full/en.json?14')
  .then(r => r.json())
  .then(d => {
    const blob = new Blob([JSON.stringify(d)], {type: 'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'i18n_en.json'; a.click();
  });
```

3. Place files in `data/` directory
4. Run: `bun run build_data.mjs`
5. Commit the updated `affix_data.json`

### Testing

```bash
bun test/range-regex.test.js
```

### File Structure

```
├── index.html          # Main page
├── style.css           # Dark theme styles
├── app.js              # All application logic
├── affix_data.json     # Built affix data (committed)
├── build_data.mjs      # Data build script
├── test/               # Tests
├── data/               # Raw source data (gitignored)
└── README.md
```

## Credits

- Data: [lastepochtools.com](https://www.lastepochtools.com)
- Reference: [lastepoch.re](https://www.lastepoch.re)
