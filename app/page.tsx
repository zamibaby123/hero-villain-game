'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/deviceId'
import { generateRandomName } from '@/lib/randomName'
import AppHeader from '@/components/AppHeader'
import { useSearchParams } from 'next/navigation'





type RoomPreview = {
  id: string
  code: string
  host_username: string | null
  player_count: number
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function NoticeReader({ onNotice }: { onNotice: (msg: string) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const n = searchParams.get('notice')
    if (n) {
      onNotice(n)
      router.replace('/')
    }
  }, [searchParams, router, onNotice])

  return null
}


export default function Home() {
  const router = useRouter()
  const [myUsername, setMyUsername] = useState('')
  const [rooms, setRooms] = useState<RoomPreview[]>([])
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)


  async function ensurePlayer() {
    const deviceId = getDeviceId()
    const { data: existing } = await supabase
      .from('players')
      .select('*')
      .eq('device_id', deviceId)
      .single()
    if (existing) return existing

    const randomName = generateRandomName()
    const { data: created, error } = await supabase
      .from('players')
      .insert({ device_id: deviceId, username: randomName })
      .select()
      .single()
    if (error) throw error
    return created
  }

  useEffect(() => {
    ensurePlayer().then((p) => setMyUsername(p.username))
  }, [])

  // Sitewide "online" heartbeat
  useEffect(() => {
    const deviceId = getDeviceId()
    const send = () => supabase.functions.invoke('site-heartbeat', { body: { deviceId } })
    send()
    const interval = setInterval(send, 15000)
    return () => clearInterval(interval)
  }, [])

  async function fetchRooms() {
    const { data } = await supabase
      .from('rooms')
      .select('id, code, players(username), room_players(count)')
      .eq('is_public', true)
      .eq('status', 'lobby')
      .order('created_at', { ascending: true })

    if (data) {
      setRooms(
        data
          .filter((r: any) => (r.room_players?.[0]?.count ?? 0) > 0)
          .map((r: any) => ({
          id: r.id,
          code: r.code,
          host_username: r.players?.username ?? null,
          player_count: r.room_players?.[0]?.count ?? 0,
          }))
      )
    }
  }
  
  // Lobby screen periodically asks the server to sweep all empty/stale public rooms
  useEffect(() => {
    const interval = setInterval(() => {
      supabase.functions.invoke('cleanup-all-stale-rooms', { body: {} })
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Throttled polling — every 4 seconds, stable order (no jumpy reordering)
  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, 4000)
    return () => clearInterval(interval)
  }, [])

  async function handleCreateRoom() {
    setCreating(true)
    setError('')
    try {
      const player = await ensurePlayer()
      const code = generateRoomCode()

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({ code, host_player_id: player.id, is_public: true })
        .select()
        .single()
      if (error) throw error

      await supabase.from('room_players').insert({ room_id: room.id, player_id: player.id })
      router.push(`/room/${code}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleGoToRoom(code: string) {
    if (!code.trim()) {
      setError('Enter a room code')
      return
    }
    setError('')
    const upperCode = code.trim().toUpperCase()

    try {
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', upperCode)
        .single()
      if (roomErr || !room) throw new Error('Room not found')

      const player = await ensurePlayer()

      const { data: seated } = await supabase
        .from('room_players')
        .select('id')
        .eq('room_id', room.id)
        .eq('player_id', player.id)
        .single()

      if (!seated) {
        const { count } = await supabase
          .from('room_players')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
        if (count && count >= 8) throw new Error('Room is full')

        await supabase.from('room_players').insert({ room_id: room.id, player_id: player.id })
      }

      router.push(`/room/${upperCode}`)
    } catch (e: any) {
      setError(e.message)
    }
  }


  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-6 bg-gray-950 text-white">
      
      <Suspense fallback={null}>
        <NoticeReader onNotice={setNotice} />
      </Suspense>

      <AppHeader username={myUsername} />

      <h1 className="text-3xl font-bold">Heroes vs. Villains</h1>

      <button
        className="w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold disabled:opacity-50"
        onClick={handleCreateRoom}
        disabled={creating}
      >
        {creating ? 'Creating...' : 'Create Room'}
      </button>

      <div className="flex gap-2 w-full max-w-xs">
        <input
          className="flex-1 px-4 py-3 rounded bg-gray-800 border border-gray-700"
          placeholder="Have a room code?"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button
          className="px-4 py-3 rounded bg-gray-700 font-semibold"
          onClick={() => handleGoToRoom(joinCode)}
        >
          Go
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="w-full max-w-xs mt-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm uppercase tracking-widest text-gray-400">Public Rooms</h2>
          <button className="text-xs text-indigo-400 underline" onClick={fetchRooms}>
            Refresh
          </button>
        </div>

        {rooms.length === 0 && <p className="text-sm text-gray-500">No public rooms right now.</p>}

        <ul className="space-y-2">
          {rooms.map((r) => (
            <li key={r.id} className="px-4 py-3 rounded bg-gray-800 flex justify-between items-center">
              <div>
                <p className="font-semibold">{r.host_username ?? 'Unknown'}'s Room</p>
                <p className="text-xs text-gray-500">
                  Code: {r.code} · {r.player_count}/8 players
                </p>
              </div>
              <button
                className="px-3 py-2 rounded bg-indigo-600 text-sm font-semibold disabled:opacity-40"
                onClick={() => handleGoToRoom(r.code)}
                disabled={r.player_count >= 8}
              >
                {r.player_count >= 8 ? 'Full' : 'Join'}
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      {notice && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-sm w-full p-6">
            <p className="text-lg mb-4">{notice}</p>
            <button
              className="w-full px-4 py-3 rounded bg-indigo-600 font-semibold"
              onClick={() => setNotice(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

    </main>
  )
}
