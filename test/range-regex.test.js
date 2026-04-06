/**
 * Tests for rangeToRegex()
 *
 * Run: bun test test/range-regex.test.js
 *      node --test test/range-regex.test.js
 */

// Import the function by evaluating app.js in a non-browser context
// Since app.js uses DOM, we extract just the rangeToRegex functions
import { readFileSync } from 'fs';

// Extract rangeToRegex and _splitRange from app.js
const appCode = readFileSync('app.js', 'utf-8');
const fnMatch = appCode.match(
  /function rangeToRegex[\s\S]*?^function _splitRange[\s\S]*?^}/m
);
if (!fnMatch) throw new Error('Could not extract rangeToRegex from app.js');

const fn = new Function(fnMatch[0] + '\nreturn { rangeToRegex, _splitRange };');
const { rangeToRegex } = fn();

function assertRegex(min, max, description) {
  const pattern = rangeToRegex(min, max);
  const regex = new RegExp('^' + pattern + '$');

  // Test that every integer in [min, max] matches
  for (let i = min; i <= max; i++) {
    if (!regex.test(String(i))) {
      throw new Error(
        `FAIL [${description}]: rangeToRegex(${min}, ${max}) = "${pattern}" ` +
        `does not match ${i}`
      );
    }
  }

  // Test boundaries: min-1 and max+1 should NOT match (if >= 0)
  if (min > 0 && regex.test(String(min - 1))) {
    throw new Error(
      `FAIL [${description}]: rangeToRegex(${min}, ${max}) = "${pattern}" ` +
      `incorrectly matches ${min - 1}`
    );
  }
  if (max < 9999 && regex.test(String(max + 1))) {
    throw new Error(
      `FAIL [${description}]: rangeToRegex(${min}, ${max}) = "${pattern}" ` +
      `incorrectly matches ${max + 1}`
    );
  }

  console.log(`  PASS: rangeToRegex(${min}, ${max}) = "${pattern}" [${description}]`);
}

console.log('rangeToRegex tests:');
console.log('');

// Basic cases
assertRegex(42, 42, 'single value');
assertRegex(0, 0, 'zero');
assertRegex(3, 8, 'single digit range');
assertRegex(0, 9, 'full single digit');

// Same prefix
assertRegex(10, 19, 'full decade');
assertRegex(148, 149, 'two values same prefix');
assertRegex(20, 25, 'partial decade');
assertRegex(100, 109, 'hundred + single digit');

// Cross-decade
assertRegex(148, 156, 'cross decade');
assertRegex(15, 20, 'teens to twenties');
assertRegex(45, 55, 'cross decade mid');

// Cross-hundred
assertRegex(98, 102, 'cross hundred');
assertRegex(95, 105, 'wide cross hundred');

// Different digit count
assertRegex(8, 12, 'single to double digit');
assertRegex(5, 20, 'single to double wide');
assertRegex(99, 100, 'two to three digits');

// Edge cases
assertRegex(1, 1, 'min equals max (1)');
assertRegex(0, 1, 'zero to one');
assertRegex(1, 9, 'one to nine');
assertRegex(10, 99, 'all two digit');
assertRegex(100, 999, 'all three digit');

// Game-realistic ranges
assertRegex(15, 20, 'crit chance T1');
assertRegex(58, 72, 'armor T1');
assertRegex(148, 156, 'armor T7');
assertRegex(26, 30, 'movement speed T7');
assertRegex(4, 10, 'cold resistance');

// Guard: min > max
const badResult = rangeToRegex(10, 5);
if (badResult !== '10') {
  throw new Error(`FAIL: rangeToRegex(10, 5) should return "10", got "${badResult}"`);
}
console.log('  PASS: rangeToRegex(10, 5) = "10" [min > max guard]');

console.log('');
console.log('All tests passed!');
