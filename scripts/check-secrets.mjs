// Secret scan (CI runs it before anything reaches Vercel): every file git tracks or would add,
// plus the built site, checked for credentials that must only ever live in Vercel's settings.
// Exits non-zero naming the file and the kind of secret, never the secret itself.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const PATTERNS = [
  ['Discord webhook', /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]{20,}/],
  ['Redis URL with a password', /rediss?:\/\/[^\s:/@]*:[^\s@]{8,}@/],
  ['Upstash / Vercel KV token', /(?:KV|UPSTASH)[A-Z_]*TOKEN["']?[ \t]*[:=][ \t]*["']?[\w-]{20,}/],
  ['Vercel token', /\b(?:vcp|vck|vci|vca)_[A-Za-z0-9]{20,}/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['OpenAI / Anthropic key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['secret in an env assignment', /^[ \t]*[A-Z_]*(?:SECRET|PASSWORD|PRIVATE)[A-Z_]*[ \t]*=[ \t]*\S{8,}/m],
]

const root = fileURLToPath(new URL('../', import.meta.url))
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !/(^|\/)package-lock\.json$/.test(f))

/** @param {string} dir @returns {string[]} */
const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((f) => {
        const p = join(dir, f)
        return statSync(p).isDirectory() ? walk(p) : [p]
      })
    : []
const built = walk(join(root, 'dist')).map((p) => relative(root, p).replace(/\\/g, '/'))

const failures = []
for (const file of new Set([...tracked, ...built])) {
  const path = join(root, file)
  if (!existsSync(path) || statSync(path).size > 5_000_000) continue
  const buffer = readFileSync(path)
  if (buffer.includes(0)) continue // binary
  const text = buffer.toString('utf8')
  for (const [kind, pattern] of PATTERNS) if (pattern.test(text)) failures.push(`${file}: looks like a ${kind}`)
}

if (failures.length) {
  console.error(`secret scan failed:\n  ${failures.join('\n  ')}\nMove it to Vercel's environment variables, and rotate it: it has been exposed.`)
  process.exit(1)
}
console.log(`secret scan passed: ${tracked.length} repo files and ${built.length} built files`)
