/**
 * Customer Order — Others / manual DIN helpers smoke (no browser).
 * Run: node scripts/customer-order-din-others-smoke.mjs
 */
import assert from 'node:assert/strict'

const DIN_OTHERS_VALUE = '__OTHERS__'

function blankDesignForOrder(dinNumber) {
  const trimmed = dinNumber.trim()
  return {
    dinId: '',
    dinNumber: trimmed,
    designName: '',
    previewUrl: null,
    qualityName: '',
    widthLabel: '',
    salesRate: 0,
    costingId: null,
    matchings: [],
  }
}

function isManualDinSelection(dinNumber, masterDinNumbers) {
  const trimmed = dinNumber.trim()
  if (!trimmed || trimmed === DIN_OTHERS_VALUE) return true
  const lower = trimmed.toLowerCase()
  for (const n of masterDinNumbers) {
    if (String(n || '').trim().toLowerCase() === lower) return false
  }
  return true
}

function resolveSavedDin(dinSelect, manualDin, designDin) {
  if (dinSelect === DIN_OTHERS_VALUE) return manualDin.trim()
  return (designDin || dinSelect).trim()
}

const masters = ['JFG2250', 'FG2246', 'NEW-DIN-001']

assert.equal(isManualDinSelection('JFG9999', masters), true)
assert.equal(isManualDinSelection('JFG2250', masters), false)
assert.equal(isManualDinSelection('jfg2250', masters), false)
assert.equal(isManualDinSelection(DIN_OTHERS_VALUE, masters), true)
assert.equal(isManualDinSelection('', masters), true)
console.log('PASS isManualDinSelection')

assert.equal(resolveSavedDin(DIN_OTHERS_VALUE, 'JFG9999', ''), 'JFG9999')
assert.equal(resolveSavedDin(DIN_OTHERS_VALUE, '  NEW-DIN-001  ', 'x'), 'NEW-DIN-001')
assert.equal(resolveSavedDin('JFG2250', 'ignored', 'JFG2250'), 'JFG2250')
assert.notEqual(resolveSavedDin(DIN_OTHERS_VALUE, 'JFG9999', ''), DIN_OTHERS_VALUE)
assert.notEqual(resolveSavedDin(DIN_OTHERS_VALUE, 'JFG9999', ''), 'Others')
console.log('PASS resolveSavedDin never persists Others sentinel')

const blank = blankDesignForOrder('JFG9999')
assert.equal(blank.dinNumber, 'JFG9999')
assert.equal(blank.dinId, '')
assert.equal(blank.salesRate, 0)
assert.equal(blank.qualityName, '')
assert.equal(blank.previewUrl, null)
console.log('PASS blankDesignForOrder')

console.log('ALL PASS customer-order-din-others-smoke')
