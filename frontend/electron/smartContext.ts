import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const FIELD_SEPARATOR = String.fromCharCode(30)
const SUPPORTED_BROWSERS = new Set([
  'Safari',
  'Google Chrome',
  'Arc',
  'Brave Browser',
  'Microsoft Edge',
])

export interface SmartContext {
  app_name: string
  bundle_id: string | null
  window_title: string | null
  page_title: string | null
  url_host: string | null
}

export interface SmartContextAccessStatus {
  status: 'full' | 'app-only' | 'unavailable'
  message: string
  context: SmartContext | null
}

export interface SmartContextCaptureResult {
  context: SmartContext
  access: SmartContextAccessStatus
  warning: string | null
}

const EMPTY_CONTEXT: SmartContext = {
  app_name: 'Unknown',
  bundle_id: null,
  window_title: null,
  page_title: null,
  url_host: null,
}

function normalizeValue(value: string | undefined) {
  return value && value.trim() ? value.trim() : null
}

async function runAppleScript(lines: string[]) {
  const { stdout } = await execFileAsync('osascript', lines.flatMap((line) => ['-e', line]), {
    timeout: 2500,
  })
  return stdout.trim()
}

async function captureFrontmostApp() {
  const raw = await runAppleScript([
    'tell application "System Events"',
    'set frontApp to first application process whose frontmost is true',
    'set appName to name of frontApp',
    'set bundleId to ""',
    'try',
    'set bundleId to bundle identifier of frontApp',
    'end try',
    'set windowTitle to ""',
    'try',
    'if (count of windows of frontApp) > 0 then',
    'set windowTitle to name of front window of frontApp',
    'end if',
    'end try',
    `return appName & (ASCII character 30) & bundleId & (ASCII character 30) & windowTitle`,
    'end tell',
  ])

  const [appName = 'Unknown', bundleId = '', windowTitle = ''] = raw.split(FIELD_SEPARATOR)
  return {
    app_name: appName || 'Unknown',
    bundle_id: normalizeValue(bundleId),
    window_title: normalizeValue(windowTitle),
  }
}

async function captureBrowserDetails(appName: string) {
  const lines = appName === 'Safari'
    ? [
      'tell application "Safari"',
      'set pageTitle to ""',
      'set pageUrl to ""',
      'try',
      'if (count of windows) > 0 then',
      'set pageTitle to name of current tab of front window',
      'set pageUrl to URL of current tab of front window',
      'end if',
      'end try',
      `return pageTitle & (ASCII character 30) & pageUrl`,
      'end tell',
    ]
    : [
      `tell application "${appName}"`,
      'set pageTitle to ""',
      'set pageUrl to ""',
      'try',
      'if (count of windows) > 0 then',
      'set pageTitle to title of active tab of front window',
      'set pageUrl to URL of active tab of front window',
      'end if',
      'end try',
      `return pageTitle & (ASCII character 30) & pageUrl`,
      'end tell',
    ]

  const raw = await runAppleScript(lines)
  const [pageTitle = '', pageUrl = ''] = raw.split(FIELD_SEPARATOR)

  let urlHost: string | null = null
  try {
    urlHost = pageUrl ? new URL(pageUrl).host : null
  } catch {
    urlHost = null
  }

  return {
    page_title: normalizeValue(pageTitle),
    url_host: normalizeValue(urlHost || ''),
  }
}

function buildAccessStatus(
  context: SmartContext | null,
  warning: string | null,
  browserEnhanced: boolean,
): SmartContextAccessStatus {
  if (!context) {
    return {
      status: 'unavailable',
      message: warning || 'Smart Mode will use transcript-only fallback until context access is available.',
      context: null,
    }
  }

  if (warning) {
    return {
      status: 'app-only',
      message: warning,
      context,
    }
  }

  return {
    status: 'full',
    message: browserEnhanced
      ? 'Smart Mode can read the active app, window title, page title, and site hostname.'
      : 'Smart Mode can read the active app and window title. Browser tab details are captured automatically when recording starts from a supported browser.',
    context,
  }
}

function describeFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/not authorized|Not authorized|Automation|Apple events/i.test(message)) {
    return 'Browser context access is blocked. Smart Mode will fall back to app and window details until Automation is allowed.'
  }
  if (/System Events got an error|not permitted|access/i.test(message)) {
    return 'Frontmost app context is unavailable. Grant Accessibility and Automation access to enable Smart Mode context.'
  }
  return 'Smart Mode context is temporarily unavailable. Recording will continue with transcript-only fallback.'
}

export async function getSmartContextAccessStatus() {
  try {
    const baseContext = await captureFrontmostApp()
    const isBrowser = SUPPORTED_BROWSERS.has(baseContext.app_name)
    if (!isBrowser) {
      return buildAccessStatus({
        ...EMPTY_CONTEXT,
        ...baseContext,
      }, null, false)
    }

    try {
      const browserDetails = await captureBrowserDetails(baseContext.app_name)
      return buildAccessStatus({
        ...EMPTY_CONTEXT,
        ...baseContext,
        ...browserDetails,
      }, null, true)
    } catch (error) {
      return buildAccessStatus({
        ...EMPTY_CONTEXT,
        ...baseContext,
      }, describeFailure(error), false)
    }
  } catch (error) {
    return buildAccessStatus(null, describeFailure(error), false)
  }
}

export async function captureSmartContext(): Promise<SmartContextCaptureResult> {
  const access = await getSmartContextAccessStatus()
  return {
    context: access.context || { ...EMPTY_CONTEXT },
    access,
    warning: access.status === 'full' ? null : access.message,
  }
}
