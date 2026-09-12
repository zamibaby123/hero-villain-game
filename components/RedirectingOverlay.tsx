'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RedirectingOverlay({ noticeParam }: { noticeParam?: string }) {
  const router = useRouter()
  const [seconds, setSeconds] = useState(3)

  useEffect(() => {
    if (seconds <= 0) {
      const url = noticeParam ? `/?notice=${encodeURIComponent(noticeParam)}` : '/'
      router.push(url)
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds, noticeParam, router])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
      <p className="text-lg">Redirecting to the Lobby...</p>
      <p className="text-3xl font-bold">{seconds}</p>
    </main>
  )
}
