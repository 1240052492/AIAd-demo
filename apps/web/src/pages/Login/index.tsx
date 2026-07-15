import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { syncCreditBalance, useAuthStore, useCreditStore } from '@/stores'
import { authApi } from '@/services/api'
import { useGenerationStore } from '@/stores/generation'
import { useAccountSwitch } from '@/stores/accountSwitch'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [identifier, setIdentifier] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !password) {
      toast.error('请输入账号和密码')
      return
    }
    setLoading(true)
    try {
      const payload = isEmail(identifier.trim())
        ? { email: identifier.trim(), password }
        : { phone: identifier.trim(), password }
      const res = await authApi.login(payload)
      const { token, user } = res.data
      useCreditStore.getState().reset()
      useGenerationStore.getState().reset()
      useAccountSwitch.getState().reset()
      setAuth(user, token)
      await syncCreditBalance().catch(() => undefined)
      toast.success(`欢迎回来，${user.nickname || user.phone || user.email}`)
      const isAdmin =
        user?.role === 'admin' ||
        !!user?.roles?.some((r: any) => (r?.role?.code ?? r) === 'admin')
      // 管理员进入后台 overview（URL 可刷新保持）；普通用户进工作台首页
      navigate(isAdmin ? '/admin/overview' : '/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '登录失败，请检查账号或密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel-card w-full p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">登录</h2>
        <p className="mt-1 text-sm text-muted">登录以使用 AdCraft AI 广告工作台</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-muted">手机号 / 邮箱</label>
          <div className="flex items-center rounded-card border border-border bg-bg/60 px-3 focus-within:border-blue/60">
            <Mail className="h-4 w-4 text-muted" />
            <input
              type="text"
              value={identifier}
              autoComplete="username"
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="请输入手机号或邮箱"
              className="h-10 w-full bg-transparent px-2.5 text-sm text-text placeholder:text-muted/60 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-muted">密码</label>
          <div className="flex items-center rounded-card border border-border bg-bg/60 px-3 focus-within:border-blue/60">
            <Lock className="h-4 w-4 text-muted" />
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="h-10 w-full bg-transparent px-2.5 text-sm text-text placeholder:text-muted/60 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={cn('btn-primary mt-1 h-10 w-full', loading && 'cursor-not-allowed opacity-70')}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '登录'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        还没有账号？
        <Link to="/register" className="ml-1 text-blue hover:underline">
          立即注册
        </Link>
      </p>
    </div>
  )
}
