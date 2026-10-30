#!/usr/bin/env node
// The built console ships no test support: the fake API, its hooks and the test runners must not be reachable from
// dist (a fake that could answer for the real API is the kind of thing that must never ship).
//
//   node scripts/check-dist.mjs dist
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('usage: check-dist.mjs <dist directory>')
  process.exit(2)
}

const FORBIDDEN = [
  /FakeApi/,
  /fake-api/,
  /tests\/support/,
  /__TEST__/,
  /__test_hook__/i,
  /window\.__(?:test|e2e|mock)/i,
  /@playwright/,
  /vitest/,
  /\bexpire\(\)/,
]

function files(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

const problems = []
let n = 0
for (const f of files(dir)) {
  if (!/\.(js|mjs|css|html|map|json)$/.test(f)) continue
  n++
  const text = readFileSync(f, 'utf8')
  for (const re of FORBIDDEN) if (re.test(text)) problems.push(`${f}: matches ${re}`)
}
if (n === 0) problems.push(`${dir} has no built files`)
const index = readFileSync(join(dir, 'index.html'), 'utf8')
if (!/<meta[^>]+name="robots"[^>]+noindex/i.test(index)) problems.push('index.html lacks <meta name="robots" content="noindex">')
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`${dir}: ${n} files, no test support, noindex present`)
