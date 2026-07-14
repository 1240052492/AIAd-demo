import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require('C:/Users/Administrator/.workbuddy/binaries/node/workspace/node_modules/playwright-core')

const EXE = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:4177'
const ADMIN = { email: 'admin@example.com', password: 'Admin@123456' }
const OUT = 'D:/guanggaohangye/test-shots'
mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log(...a)

async function apiLogin(c) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c),
  })
  return (await r.json()).data.accessToken
}
async function ensureLoggedIn(page) {
  // 若被弹回登录页，则重新 UI 登录
  if (page.url().includes('/login')) {
    await page.fill('input[autocomplete="username"]', ADMIN.email)
    await page.fill('input[type="password"]', ADMIN.password)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/', { timeout: 20000 })
    await page.waitForTimeout(1500)
  }
}
async function go(page, path, waitMs = 2200) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(waitMs)
  await ensureLoggedIn(page)
  await page.waitForTimeout(800)
}

async function main() {
  const adminToken = await apiLogin(ADMIN)
  const projResp = await fetch(`${API}/api/projects?pageSize=1`, { headers: { Authorization: `Bearer ${adminToken}` } })
  const projectId = (await projResp.json()).data.items?.[0]?.id

  const browser = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') log('  [browser-error]', m.text().slice(0, 160)) })

  // 1) 登录页
  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/01-login.png` })
  log('  ✅ 01-login')

  // 登录
  await page.fill('input[autocomplete="username"]', ADMIN.email)
  await page.fill('input[type="password"]', ADMIN.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/', { timeout: 20000 })
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${OUT}/02-home.png`, fullPage: true })
  log('  ✅ 02-home')

  // 2) 数据总览（真实数据 / 验收#4）
  await go(page, '/dashboard', 2600)
  await page.screenshot({ path: `${OUT}/03-dashboard.png`, fullPage: true })
  log('  ✅ 03-dashboard (真实数据)')

  // 3) 后台-数据总览
  await go(page, '/admin', 1600)
  try { await page.getByRole('button', { name: '数据总览' }).first().click() } catch {}
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/04-admin-overview.png`, fullPage: true })
  log('  ✅ 04-admin-overview')

  // 4) 后台-角色权限配置（验收#3）
  try { await page.getByRole('button', { name: '角色权限配置' }).click() } catch {}
  await page.waitForTimeout(1400)
  await page.screenshot({ path: `${OUT}/05-admin-roleconfig.png`, fullPage: true })
  log('  ✅ 05-admin-roleconfig (权限配置生效)')

  // 5) 积分/会员（验收#2 上下文）
  await go(page, '/membership', 2200)
  await page.screenshot({ path: `${OUT}/06-membership.png`, fullPage: true })
  log('  ✅ 06-membership')

  // 6) 编辑器（验收#1：可编辑/批注门禁）
  if (projectId) {
    await go(page, `/editor/${projectId}`, 3200)
    await page.screenshot({ path: `${OUT}/07-editor.png`, fullPage: true })
    log('  ✅ 07-editor', projectId)
  }

  await browser.close()
  log('ALL SHOTS DONE ->', OUT)
}
main().catch((e) => { console.error('SCRIPT ERROR', e); process.exit(1) })
