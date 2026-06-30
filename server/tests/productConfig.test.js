const assert = require('assert')
const path = require('path')
const fs = require('fs')
const {
  normalizeProductConfigs,
  resolveCheckoutConfig,
} = require('../lib/productConfig')

const vectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../tests/fixtures/product-config-vectors.json'), 'utf8')
)

for (const [index, caseRow] of vectors.normalize.entries()) {
  const actual = normalizeProductConfigs(caseRow.input)
  assert.deepStrictEqual(actual, caseRow.expected, `normalize case #${index}`)
}

for (const [index, caseRow] of vectors.resolveCheckout.entries()) {
  const actual = resolveCheckoutConfig(caseRow.product, caseRow.configId)
  assert.deepStrictEqual(actual, caseRow.expected, `resolve case #${index}`)
}

console.log('productConfig vectors: ok')
