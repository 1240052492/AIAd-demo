const BASE = 'http://localhost:4177'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const loginRes = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@example.com', password: 'Admin@123456' }),
})
const ld = await loginRes.json()
const token = ld.data?.accessToken || ld.data?.token
const meId = ld.data?.user?.id
console.log('LOGIN', loginRes.status, 'token?', !!token, 'meId?', !!meId)
if (!token) {
  console.log('LOGIN BODY', JSON.stringify(ld).slice(0, 300))
  process.exit(1)
}
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

console.log('\n=== 真实数据接口（应非 MOCK 固定值 128/42/3860/3）===')
for (const p of [
  '/api/admin/overview',
  '/api/admin/users?pageSize=2',
  '/api/admin/provider-configs',
  '/api/admin/workflows?pageSize=5',
  '/api/admin/credit-rules',
  '/api/admin/settings',
  '/api/admin/generation-jobs?pageSize=3',
]) {
  const r = await fetch(BASE + p, { headers: H })
  const d = await r.json()
  console.log(p, '->', r.status, JSON.stringify(d.data).slice(0, 240))
}

console.log('\n=== 探针：settings 是否含新增 industries 字段（验证我改的 admin.ts 已加载）===')
const setRes = await fetch(BASE + '/api/admin/settings', { headers: H })
const setData = (await setRes.json()).data || {}
console.log('settings has industries?', Array.isArray(setData.industries), '| has announcement?', 'announcement' in setData)

console.log('\n=== 自我保护：管理员改自己状态应被拒（400）===')
const sp = await fetch(BASE + `/api/admin/users/${meId}/status`, {
  method: 'PATCH',
  headers: H,
  body: JSON.stringify({ status: 'disabled' }),
})
console.log('self-protect PATCH /users/me/status ->', sp.status, (await sp.json()).message || '')

console.log('\n=== 白名单：credit-rules PUT 带脏字段应被忽略 ===')
const cr = await fetch(BASE + '/api/admin/credit-rules', {
  method: 'PUT',
  headers: H,
  body: JSON.stringify({ imageGeneration: 9, evilField: 'hack' }),
})
const crd = (await cr.json()).data || {}
console.log('credit-rules PUT ->', cr.status, '| hasEvilField?', 'evilField' in crd, '| imageGeneration=', crd.imageGeneration)

console.log('\nDONE')
