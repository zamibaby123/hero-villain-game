'use client'

import { useState, useEffect } from 'react'

export default function AppHeader({ username }: { username?: string | null }) {
  const [rulesOpen, setRulesOpen] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('hasSeenRules')
    if (!seen) {
      setRulesOpen(true)
      localStorage.setItem('hasSeenRules', 'true')
    }
  }, [])

  return (
    <>
    <div className="fixed top-3 left-3 right-3 max-w-xs mx-auto flex justify-between items-start text-sm z-30 bg-gray-950/90 backdrop-blur-sm py-2 px-1 rounded">
        <span className="text-gray-400">
          {username ? (
            <>Playing as <span className="text-white font-semibold">{username}</span></>
          ) : (
            <>&nbsp;</>
          )}
        </span>
        <div className="flex flex-col items-end gap-2">
          <button className="text-xs text-indigo-400 underline">Sign Up / Log In</button>
          <button
            className="text-xs px-2 py-1 rounded border border-gray-600 bg-gray-800 text-gray-300"
            onClick={() => setRulesOpen(true)}
          >
            How to Play
          </button>
        </div>
      </div>


      {rulesOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-sm w-full p-6 max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">How to Play</h2>
            <div className="space-y-3 text-sm text-gray-300">
              <p><span className="text-emerald-400 font-semibold">Heroes</span> all know a secret word. <span className="text-red-400 font-semibold">Villains</span> don't — they only know they're a Villain.</p>
              <p>Each round, everyone submits one word that hints at the secret — without saying it outright. Villains have to bluff.</p>
              <p>Villains can see who their fellow Villains are (if there's more than one), and can subtly coordinate.</p>
              <p>After words are revealed one at a time, everyone votes to eliminate whoever seems most suspicious.</p>
              <p><span className="text-emerald-400 font-semibold">Heroes win</span> when all Villains are eliminated.</p>
              <p><span className="text-red-400 font-semibold">Villains win</span> when the number of Villains left is equal to the number of Heroes left.</p>
              <p className="text-gray-500 text-xs pt-2">Villain count scales with room size — roughly 1 Villain per 3 players.</p>
            </div>
            <button
              className="mt-6 w-full px-4 py-3 rounded bg-indigo-600 font-semibold"
              onClick={() => setRulesOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
