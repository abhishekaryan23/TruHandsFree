import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function getSigningIdentity() {
  return process.env.APPLE_SIGNING_IDENTITY || process.env.CSC_NAME || '-'
}

function isAdHocIdentity(identity) {
  return identity === '-'
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return walk(resolved)
    }
    return [resolved]
  }))
  return files.flat()
}

async function isMachOBinary(targetPath) {
  try {
    const { stdout } = await execFileAsync('file', ['-b', targetPath])
    return stdout.includes('Mach-O')
  } catch {
    return false
  }
}

async function signTarget(targetPath, identity) {
  const args = ['--force']
  if (!isAdHocIdentity(identity)) {
    args.push('--timestamp', '--options', 'runtime')
  }
  args.push('--sign', identity, targetPath)
  await execFileAsync('codesign', args)
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const identity = getSigningIdentity()
  if (isAdHocIdentity(identity)) {
    console.log('[afterPack] No signing identity configured. Using ad-hoc signatures for bundled backend binaries.')
  }

  const appBundlePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const backendRoot = path.join(appBundlePath, 'Contents', 'Resources', 'truhandsfree-engine')

  try {
    await fs.access(backendRoot)
  } catch {
    console.log(`[afterPack] No bundled backend found at ${backendRoot}.`)
    return
  }

  const files = await walk(backendRoot)
  const signableFiles = []
  for (const filePath of files) {
    if (await isMachOBinary(filePath)) {
      signableFiles.push(filePath)
    }
  }

  signableFiles.sort((left, right) => right.length - left.length)

  for (const filePath of signableFiles) {
    console.log(`[afterPack] Signing ${filePath}`)
    await signTarget(filePath, identity)
  }
}
