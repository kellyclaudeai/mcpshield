import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const workflowsDir = path.join(repoRoot, '.github', 'workflows')
const pkgPath = path.join(repoRoot, 'package.json')

const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
const pinnedPnpmVersion = String(pkg.packageManager || '').match(/^pnpm@(.+)$/)?.[1]

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringifyStep(step) {
  if (!isObject(step)) return String(step)
  if (typeof step.name === 'string') return step.name
  if (typeof step.uses === 'string') return step.uses
  if (typeof step.run === 'string') return step.run.split('\n')[0]
  return JSON.stringify(step)
}

function formatLocation({ file, jobId, stepIndex }) {
  return `${file} (job: ${jobId}, step: ${stepIndex + 1})`
}

const errors = []

let entries = []
try {
  entries = await fs.readdir(workflowsDir)
} catch (err) {
  errors.push(`Unable to read workflows directory: ${workflowsDir} (${err?.message || err})`)
}

for (const entry of entries) {
  if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue

  const file = path.join(workflowsDir, entry)
  let doc
  try {
    const raw = await fs.readFile(file, 'utf8')
    doc = YAML.parse(raw)
  } catch (err) {
    errors.push(`${file}: YAML parse failed (${err?.message || err})`)
    continue
  }

  if (!isObject(doc?.jobs)) continue

  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (!isObject(job)) continue
    const steps = job.steps
    if (!Array.isArray(steps)) continue

    const pnpmSetupIndices = []

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex]
      if (!isObject(step)) continue

      const uses = step.uses
      if (typeof uses !== 'string') continue

      if (uses.startsWith('pnpm/action-setup@')) {
        pnpmSetupIndices.push(stepIndex)

        if (pinnedPnpmVersion) {
          const version = step.with?.version
          if (typeof version !== 'string' || !version.trim()) {
            errors.push(
              `${formatLocation({ file, jobId, stepIndex })}: pnpm/action-setup is missing with.version (expected ${pinnedPnpmVersion})`
            )
          } else if (version.trim() !== pinnedPnpmVersion) {
            errors.push(
              `${formatLocation({ file, jobId, stepIndex })}: pnpm/action-setup version ${version.trim()} does not match packageManager pnpm@${pinnedPnpmVersion}`
            )
          }
        }
      }
    }

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex]
      if (!isObject(step)) continue

      const uses = step.uses
      if (typeof uses === 'string' && uses.startsWith('actions/setup-node@')) {
        const cache = step.with?.cache
        if (cache === 'pnpm') {
          const hasEarlierPnpmSetup = pnpmSetupIndices.some(idx => idx < stepIndex)
          if (!hasEarlierPnpmSetup) {
            errors.push(
              `${formatLocation({ file, jobId, stepIndex })}: actions/setup-node uses cache: pnpm but no earlier pnpm/action-setup step was found`
            )
          }
        }
      }

      const run = step.run
      if (typeof run === 'string') {
        if (/(^|\n)\s*pnpm\s+run\s+lint\s+--\b/.test(run)) {
          errors.push(
            `${formatLocation({ file, jobId, stepIndex })}: step runs "pnpm run lint -- ..." which is fragile in CI; prefer "pnpm run lint" (and bake flags into the script). Found: ${stringifyStep(step)}`
          )
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Workflow validation failed:')
  for (const err of errors) console.error(`- ${err}`)
  process.exit(1)
}
