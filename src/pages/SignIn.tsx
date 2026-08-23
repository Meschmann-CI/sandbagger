import { useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { Card, PrimaryButton } from '../components/ui'

// Magic-link sign in: no passwords to remember at the 19th hole.
export default function SignIn() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    const address = email.trim()
    if (!address) return
    setStatus('sending')
    setError(null)
    try {
      // Without a ceiling, an unreachable project leaves the button stuck
      // on "Sending…" with nothing to tell the user.
      const request = requireSupabase().auth.signInWithOtp({
        email: address,
        options: { emailRedirectTo: window.location.origin },
      })
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Couldn't reach the server. Check your connection and the app's Supabase settings.")), 15000),
      )
      const { error: authError } = await Promise.race([request, timeout])
      if (authError) {
        setError(authError.message)
        setStatus('idle')
      } else {
        setStatus('sent')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('idle')
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col justify-center px-5 rise">
      <div className="text-center mb-7">
        <div className="text-5xl mb-3">⛳</div>
        <h1 className="text-[30px] font-extrabold tracking-tight text-ink">Sandbagger</h1>
        <p className="text-[14px] text-ink-dim mt-1.5">Trips, rounds, and receipts.</p>
      </div>

      {status === 'sent' ? (
        <Card className="p-6 text-center">
          <p className="text-2xl mb-2">📬</p>
          <p className="text-[16px] font-extrabold text-ink">Check your email</p>
          <p className="text-[13.5px] text-ink-dim mt-1.5">
            We sent a sign-in link to <span className="font-bold text-ink">{email.trim()}</span>. Open it on this device and
            you're in.
          </p>
          <button onClick={() => setStatus('idle')} className="mt-4 text-[13px] font-bold text-green">
            Use a different email
          </button>
        </Card>
      ) : (
        <Card className="p-5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint mb-2">Email</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-[16px] text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
          />
          <PrimaryButton onClick={() => void send()} disabled={!email.trim() || status === 'sending'} className="w-full mt-3">
            {status === 'sending' ? 'Sending…' : 'Send me a sign-in link'}
          </PrimaryButton>
          {error && <p className="text-[12.5px] text-flag font-semibold mt-2.5">{error}</p>}
          <p className="text-[11.5px] text-ink-faint mt-3">
            No password. You'll get a link by email that signs you in on this device.
          </p>
        </Card>
      )}
    </div>
  )
}
