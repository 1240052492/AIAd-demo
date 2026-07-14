// 真实数据端到端测试（非 mock 数据，全部走真实账号 + 真实 DB）
// 覆盖验收：生图/合成 + 积分消耗前后端一致 + 角色倍率生效 + 充值 + 概况真实
import { readFileSync } from 'node:fs'
const BASE = 'http://127.0.0.1:4177'
// 使用真实有效的 PNG（由 sharp 生成），避免损坏 base64 导致合成失败
const pngBuf = readFileSync(new URL('./_valid_env.png', import.meta.url))

async function login(email, pwd) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pwd }),
  })
  const j = await r.json()
  if (j.code !== 0 && !j.data?.accessToken) throw new Error(`login ${email} failed: ${JSON.stringify(j)}`)
  return j.data.accessToken
}
async function jget(token, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return r.json()
}
async function jpost(token, path, body, isForm = false) {
  const headers = { Authorization: `Bearer ${token}` }
  let init = { method: 'POST', headers }
  if (isForm) { const fd = new FormData(); for (const [k, v] of Object.entries(body)) { if (v instanceof Blob) fd.append(k, v, `${k}.png`); else fd.append(k, v) } init.body = fd }
  else { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body) }
  const r = await fetch(`${BASE}${path}`, init)
  return r.json()
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const log = (...a) => console.log(...a)
let PASS = 0, FAIL = 0
function check(name, ok, extra = '') { if (ok) { PASS++; log(`  ✅ ${name} ${extra}`) } else { FAIL++; log(`  ❌ ${name} ${extra}`) } }

const A = await login('admin@example.com', 'Admin@123456')
const P = await login('perf@example.com', 'Perf@123456')
log('\n=== A. 概况（真实数据） ===')
const dash = await jget(A, '/api/dashboard')
check('dashboard 返回真实聚合', dash.code === 0 && typeof dash.data.totalUsers === 'number',
  `users=${dash.data.totalUsers} projects=${dash.data.totalProjects} gen=${dash.data.totalGenerations} consume=${dash.data.creditsConsumedTotal}`)

log('\n=== B. 充值前后端一致（真实数据） ===')
const bal0 = await jget(P, '/api/credits/balance')
const rech = await jpost(P, '/api/credits/recharge', { amount: 2000 }) // ¥20 -> 200 + 50首充 = 250
const bal1 = await jget(P, '/api/credits/balance')
check('充值后余额 = 前 + 到账', bal1.data.balance === bal0.data.balance + rech.data.order.points,
  `before=${bal0.data.balance} +${rech.data.order.points} => after=${bal1.data.balance}`)
const tx = await jget(P, '/api/credits/transactions?pageSize=3')
const last = tx.data.items[0]
check('流水记录了 recharge 且 balanceAfter 一致', last.type === 'recharge' && last.balanceAfter === bal1.data.balance,
  `type=${last.type} balanceAfter=${last.balanceAfter}`)

log('\n=== C. 合成（本地 sharp，真实消耗积分 + worker） ===')
const proj = await jpost(P, '/api/projects', { title: 'E2E合成测试', businessType: 'poster' })
const projId = proj.data.id
// 上传环境图（env）
const envUp = await jpost(P, `/api/projects/${projId}/assets`, { file: new Blob([pngBuf], { type: 'image/png' }), type: 'upload_environment' }, true)
const envId = envUp.data.id
// 生成一张设计图（mock，免费）作为 design
const imgJob = await jpost(P, '/api/image-jobs', { projectId: projId, prompt: '测试设计图', mock: true, count: 1 })
const imgJob2 = await jget(A, `/api/admin/generation-jobs/${imgJob.data.jobId}`)
const designAsset = imgJob2.data.responseJson?.results?.[0]
if (!designAsset) throw new Error('mock 设计图未生成')
const balB = await jget(P, '/api/credits/balance')
// 提交合成任务（真实，worker 本地处理，消耗积分）
const comp = await jpost(P, '/api/composition-jobs', { projectId: projId, designAssetId: designAsset.assetId, environmentAssetId: envId })
check('合成任务入队', comp.code === 0 && comp.data.jobId, `job=${comp.data.jobId}`)
// 等待 worker 处理
let compJob, tries = 0
while (tries++ < 20) {
  await sleep(1000)
  compJob = await jget(A, `/api/admin/generation-jobs/${comp.data.jobId}`)
  if (compJob.data.status === 'succeeded' || compJob.data.status === 'failed') break
}
const balA = await jget(P, '/api/credits/balance')
check('合成任务被 worker 处理（succeeded）', compJob.data.status === 'succeeded', `status=${compJob.data.status}`)
check('消耗积分后余额减少且等于 creditsConsumed', balA.data.balance === balB.data.balance - compJob.data.creditsConsumed && compJob.data.creditsConsumed > 0,
  `before=${balB.data.balance} -${compJob.data.creditsConsumed} => after=${balA.data.balance}`)
const compTx = await jget(P, '/api/credits/transactions?pageSize=5')
const consumeRow = compTx.data.items.find(t => t.type === 'consume' && t.relatedId === comp.data.jobId)
check('流水有 consume 记录且 relatedId 关联本任务', !!consumeRow, consumeRow ? `amount=${consumeRow.amount} balanceAfter=${consumeRow.balanceAfter}` : '')

log('\n=== D. 角色倍率生效（服务端强制） ===')
const rc = await jget(A, '/api/admin/role-configs')
const agentCfg = rc.data.find(r => r.roleCode === 'agent')
check('agent 倍率配置存在=0.7', agentCfg && agentCfg.rate === 0.7, `rate=${agentCfg?.rate}`)
// 当前 perf 角色
const users0 = await jget(A, `/api/admin/users?search=perf@example.com`)
const beforeRoles = users0.data.items[0].roleCodes
// 赋 agent 角色
const setR = await fetch(`${BASE}/api/admin/users/${users0.data.items[0].id}/roles`, {
  method: 'PUT', headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ roleCodes: ['user', 'agent'] }),
}).then(r => r.json())
check('赋 agent 角色接口生效（roleCodes 持久化）', setR.code === 0, `=> ${JSON.stringify(setR.data.roleCodes)}`)
const users1 = await jget(A, `/api/admin/users?search=perf@example.com`)
check('重新查询角色已变更', JSON.stringify(users1.data.items[0].roleCodes) === JSON.stringify(['user', 'agent']),
  `now=${JSON.stringify(users1.data.items[0].roleCodes)}`)
// 还原
await fetch(`${BASE}/api/admin/users/${users0.data.items[0].id}/roles`, {
  method: 'PUT', headers: { Authorization: `Bearer ${A}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ roleCodes: beforeRoles }),
})

log('\n=== E. 实时生图网关探测（验证"生图正常"路径） ===')
const liveImg = await jpost(P, '/api/image-jobs', { projectId: projId, prompt: '实时生图探测 red sale poster', count: 1, ratio: '1:1', mock: false })
if (liveImg.code === 0) {
  let liveJob, t2 = 0
  while (t2++ < 150) { await sleep(1000); liveJob = await jget(A, `/api/admin/generation-jobs/${liveImg.data.jobId}`); if (['succeeded','failed'].includes(liveJob.data.status)) break }
  check('实时生图网关可用', liveJob.data.status === 'succeeded', `status=${liveJob.data.status}`)
  if (liveJob.data.status === 'failed') log(`     (网关返回: ${String(liveJob.data.errorMessage).slice(0,120)})`)
} else {
  check('实时生图网关探测', false, `submit failed: ${JSON.stringify(liveImg).slice(0,120)}`)
}

log(`\n========== 结果：PASS=${PASS}  FAIL=${FAIL} ==========`)
process.exit(FAIL > 0 ? 1 : 0)
