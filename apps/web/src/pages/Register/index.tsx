import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, User, Loader2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/stores'
import { authApi } from '@/services/api'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [identifier, setIdentifier] = useState<string>('')
  const [nickname, setNickname] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [confirm, setConfirm] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim() || !password || !confirm) {
      toast.error('请完整填写注册信息')
      return
    }
    if (password.length < 6) {
      toast.error('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      toast.error('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const payload = isEmail(identifier.trim())
        ? {
            email: identifier.trim(),
            password,
            nickname: nickname.trim() || undefined,
          }
        : {
            phone: identifier.trim(),
            password,
            nickname: nickname.trim() || undefined,
          }
      const res = await authApi.register(payload)
      const { token, user } = res.data
      setAuth(user, token)
      toast.success('注册成功，已自动登录')
      navigate('/')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel-card w-full p-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">注册账号</h2>
        <p className="mt-1 text-sm text-muted">创建 AdCraft AI 账号，开启 AI 广告生产</p>
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
          <label className="text-sm text-muted">昵称（选填）</label>
          <div className="flex items-center rounded-card border border-border bg-bg/60 px-3 focus-within:border-blue/60">
            <User className="h-4 w-4 text-muted" />
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="展示名称，如：设计师小李"
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
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="h-10 w-full bg-transparent px-2.5 text-sm text-text placeholder:text-muted/60 outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm text-muted">确认密码</label>
          <div className="flex items-center rounded-card border border-border bg-bg/60 px-3 focus-within:border-blue/60">
            <Lock className="h-4 w-4 text-muted" />
            <input
              type="password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              className="h-10 w-full bg-transparent px-2.5 text-sm text-text placeholder:text-muted/60 outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={cn('btn-primary mt-1 h-10 w-full', loading && 'cursor-not-allowed opacity-70')}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '注册并登录'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        已有账号？
        <Link to="/login" className="ml-1 text-blue hover:underline">
          去登录
        </Link>
      </p>
    </div>
  )
}
