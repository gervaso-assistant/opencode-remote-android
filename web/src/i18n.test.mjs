import assert from 'node:assert/strict'
import { createTranslator, languageOptions, normalizeLanguage } from './i18n.ts'

assert.equal(normalizeLanguage('it'), 'it')
assert.equal(normalizeLanguage('zh-TW'), 'zh-TW')
assert.equal(normalizeLanguage('fr'), 'en')
assert.ok(languageOptions.some((language) => language.code === 'zh-TW'))

const en = createTranslator('en')
const it = createTranslator('it')
const zh = createTranslator('zh-TW')

assert.equal(en('sessions.title'), 'Sessions')
assert.equal(it('sessions.title'), 'Sessioni')
assert.equal(zh('sessions.title'), '工作階段')

assert.equal(en('session.deleteTitle'), 'Delete session?')
assert.equal(it('session.deleteTitle'), 'Eliminare la sessione?')
assert.equal(zh('session.deleteTitle'), '刪除工作階段？')

// Unknown keys should remain visible during development instead of rendering blank UI.
assert.equal(en('missing.key'), 'missing.key')

console.log('i18n tests passed')
