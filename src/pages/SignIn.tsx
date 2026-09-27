import { useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { Card, PrimaryButton } from '../components/ui'
import { IconTile } from '../components/icons'

// Signing in without ever leaving the app.
//
// The obvious flow — email a link, tap it — is broken on an iPhone once
// the app is on the home screen. iOS gives a home-screen app its own
// storage, separate from Safari's, and Mail always opens links in
// Safari. So the link signs you in over in Safari while the app you're
// actually looking at sits on "check your email" forever, and there's no
// way to hand the session across or to make Mail open the app instead.
//
// So the email carries a code instead, and typing it in happens inside
// the app, with nothing to hand across. Supabase sends one of two emails:
// "Confirm signup" to someone signing in for the first time and "Magic
// Link" to everyone after that. Both templates have to be edited to show
// the code and leave the link out (supabase/email-templates/ has the
// text); a first-timer who got the stock signup email saw only a link.
//
// The code's length is a Supabase setting (Authentication → Sign In /
// Providers → Email → Email OTP Length, 6 to 10), so nothing here assumes
// six digits.
const MIN_CODE = 6
const MAX_CODE = 10

// Supabase's own wording for these is too terse to act on, and the
// rate-limit one is the single most likely thing a new golfer will hit.
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('too many requests')) {
    return "Too many sign-in emails were sent recently, so this one didn't go out. Wait a few minutes and try once more — retrying now only pushes it further out."
  }
  // The link and the code are the same one-time token, so opening the
  // link spends the code too. Someone who taps it out of habit and then
  // types the code lands here, and "expired" on its own is baffling when
  // the email arrived a minute ago.
  if (m.includes('expired') || m.includes('already') || m.includes('used')) {
    return 'That code has expired or was already used (opening a link in an older sign-in email uses it up too). Send a new email and use the code from that one.'
  }
  if (m.includes('invalid') && (m.includes('token') || m.includes('otp') || m.includes('code'))) {
    return "That code wasn't right. Check the email again — it's the most recent one that counts."
  }
  if (m.includes('invalid') && m.includes('email')) {
    return "That doesn't look like a valid email address."
  }
  if (m.includes('redirect')) {
    return 'This address is not on the allowed sign-in list for the app yet. Tell Matt and he can add it.'
  }
  return message
}

export default function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying'>('idle')
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
        setError(friendlyAuthError(authError.message))
        setStatus('idle')
      } else {
        setStatus('sent')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('idle')
    }
  }

  const verify = async (typed = code) => {
    const token = typed.replace(/\D/g, '')
    if (token.length < MIN_CODE || status === 'verifying') return
    setStatus('verifying')
    setError(null)
    try {
      // 'email' covers both a brand new golfer and one who already has an
      // account, so the same box works either way.
      const { error: authError } = await requireSupabase().auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      })
      if (authError) {
        setError(friendlyAuthError(authError.message))
        setStatus('sent')
      }
      // On success the auth listener in App.tsx takes over and boots the
      // group, so there's nothing to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('sent')
    }
  }

  const sent = status === 'sent' || status === 'verifying'

  return (
    <div className="mx-auto max-w-md min-h-dvh flex flex-col justify-center px-5 rise">
      <div className="text-center mb-7">
        <img src="/sandbagger-icon-180.png" alt="" width={72} height={72} className="mx-auto rounded-2xl mb-3" />
        <h1 className="text-hero font-extrabold tracking-tight text-ink">Sandbagger</h1>
        <p className="text-body text-ink-dim mt-1.5">Trips, rounds, and receipts.</p>
      </div>

      {sent ? (
        <Card className="p-5">
          <div className="flex justify-center mb-3">
            <IconTile name="mail" tone="sky" size={48} />
          </div>
          <p className="text-headline font-bold text-ink text-center">Check your email</p>
          <p className="text-footnote text-ink-dim mt-1.5 text-center">
            We sent a sign-in code to <span className="font-bold text-ink">{email.trim()}</span>.
          </p>

          <label htmlFor="signin-code" className="block text-caption font-semibold uppercase tracking-wider text-ink-faint mt-5 mb-2">
            Enter the code
          </label>
          <input
            id="signin-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={MAX_CODE}
            value={code}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, '').slice(0, MAX_CODE)
              // A whole code arriving at once is iOS autofill ("From
              // Messages" / "From Mail") or a paste, so sign straight in.
              // Typed codes wait for the button, since a 6-digit prefix
              // of an 8-digit code would otherwise go off early.
              const arrivedWhole = next.length >= MIN_CODE && next.length - code.length > 1
              setCode(next)
              setError(null)
              if (arrivedWhole) void verify(next)
            }}
            onKeyDown={(e) => e.key === 'Enter' && void verify()}
            placeholder="Code from the email"
            autoFocus
            className={`w-full rounded-xl border border-line-strong bg-card px-3 py-3.5 text-center text-ink tabular-nums placeholder:text-ink-faint focus:border-green focus:outline-none ${
              code ? 'text-large font-extrabold tracking-[0.18em]' : 'text-headline font-semibold'
            }`}
          />
          <PrimaryButton onClick={() => void verify()} disabled={code.length < MIN_CODE || status === 'verifying'} className="w-full mt-3">
            {status === 'verifying' ? 'Signing you in…' : 'Sign in'}
          </PrimaryButton>
          {error && <p className="text-footnote text-flag font-semibold mt-2.5">{error}</p>}

          <p className="text-caption text-ink-faint mt-3.5">
            The code is all you need, so there's nothing to tap in the email. On an iPhone, the code usually shows up above the keyboard, ready to fill in.
          </p>
          <button
            onClick={() => {
              setStatus('idle')
              setCode('')
              setError(null)
            }}
            className="mt-3 text-footnote font-bold text-green"
          >
            Use a different email
          </button>
        </Card>
      ) : (
        <Card className="p-5">
          <label className="block text-caption font-semibold uppercase tracking-wider text-ink-faint mb-2">Email</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-line-strong bg-card px-4 py-3.5 text-headline text-ink placeholder:text-ink-faint focus:border-green focus:outline-none"
          />
          <PrimaryButton onClick={() => void send()} disabled={!email.trim() || status === 'sending'} className="w-full mt-3">
            {status === 'sending' ? 'Sending…' : 'Email me a code'}
          </PrimaryButton>
          {error && <p className="text-footnote text-flag font-semibold mt-2.5">{error}</p>}
          <p className="text-caption text-ink-faint mt-3">
            No password. We'll email you a code to enter here.
          </p>
        </Card>
      )}
    </div>
  )
}
