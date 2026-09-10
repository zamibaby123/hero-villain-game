'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/deviceId'

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function Home() {
  const [name, setName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function ensurePlayer(username: string) {
    const deviceId = getDeviceId()
    const { data: existing } = await supabase
      .from('players')
      .select('*')
      .eq('device_id', deviceId)
      .single()

    if (existing) {
      if (existing.username !== username) {
        const { data: updated } = await supabase
          .from('players')
          .update({ username })
          .eq('id', existing.id)
          .select()
          .single()
        return updated
      }
      return existing
    }

    const { data: created, error } = await supabase
      .from('players')
      .insert({ device_id: deviceId, username })
      .select()
      .single()

    if (error) throw error
    return created
  }

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name first')
    setError('')
    try {
      const player = await ensurePlayer(name.trim())
      const code = generateRoomCode()

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({ code, host_player_id: player.id })
        .select()
        .single()
      if (error) throw error

      await supabase.from('room_players').insert({
        room_id: room.id,
        player_id: player.id,
      })

      router.push(`/room/${code}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name first')
    if (!joinCode.trim()) return setError('Enter a room code')
    setError('')
    try {
      const player = await ensurePlayer(name.trim())
      const code = joinCode.trim().toUpperCase()

      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single()
      if (roomErr || !room) throw new Error('Room not found')

      const { data: seated } = await supabase
        .from('room_players')
        .select('*')
        .eq('room_id', room.id)
        .eq('player_id', player.id)
        .single()

      if (!seated) {
        const { count } = await supabase
          .from('room_players')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
        if (count && count >= 4) throw new Error('Room is full')

        await supabase.from('room_players').insert({
          room_id: room.id,
          player_id: player.id,
        })
      }

      router.push(`/room/${code}`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-gray-950 text-white">
      <h1 className="text-3xl font-bold">Hero vs. Villain</h1>

      <input
        className="w-full max-w-xs px-4 py-3 rounded bg-gray-800 border border-gray-700"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button
        className="w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold"
        onClick={handleCreate}
      >
        Create Room
      </button>

      <div className="flex gap-2 w-full max-w-xs">
        <input
          className="flex-1 px-4 py-3 rounded bg-gray-800 border border-gray-700"
          placeholder="Room code"
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
        />
        <button
          className="px-4 py-3 rounded bg-gray-700 font-semibold"
          onClick={handleJoin}
        >
          Join
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
    </main>
  )
}
