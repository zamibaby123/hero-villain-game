'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/deviceId'
import RulesModal from '@/components/RulesModal'


type SeatedPlayer = {
  id: string
  player_id: string
  alive: boolean
  players: { username: string }
}

export default function RoomPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const [roomId, setRoomId] = useState<string | null>(null)
  const [status, setStatus] = useState('lobby')
  const [seated, setSeated] = useState<SeatedPlayer[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [isSeated, setIsSeated] = useState(false)
  const [checkingSeat, setCheckingSeat] = useState(true)
  const [joinName, setJoinName] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showRules, setShowRules] = useState(false)




  async function loadSeated(rid: string) {
    const { data } = await supabase
      .from('room_players')
      .select('id, player_id, alive, players(username)')
      .eq('room_id', rid)
    if (data) setSeated(data as any)
  }

  async function checkIfSeated(rid: string) {
    const deviceId = getDeviceId()
    const { data: me } = await supabase
      .from('players')
      .select('id')
      .eq('device_id', deviceId)
      .single()

    if (!me) {
      setIsSeated(false)
      setCheckingSeat(false)
      return
    }
    setMyPlayerId(me.id)

    const { data: seat } = await supabase
      .from('room_players')
      .select('id')
      .eq('room_id', rid)
      .eq('player_id', me.id)
      .single()

    setIsSeated(!!seat)
    setCheckingSeat(false)
  }

  useEffect(() => {
    async function init() {
      const { data: room, error: roomErr } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single()

      if (roomErr || !room) {
        setError('Room not found')
        setCheckingSeat(false)
        return
      }
      setRoomId(room.id)
      setStatus(room.status)
      setHostPlayerId(room.host_player_id)

      if (room.status === 'playing') {
        router.push(`/room/${code}/play`)
        return
      }

      await loadSeated(room.id)
      await checkIfSeated(room.id)
    }
    init()
  }, [code])

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` },
        () => loadSeated(roomId)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setStatus(payload.new.status)
          setHostPlayerId(payload.new.host_player_id)
          if (payload.new.status === 'playing') {
            router.push(`/room/${code}/play`)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, code, router])

  // Safety net: keep the seat count fresh even if Realtime drops (e.g. backgrounded tab)
  useEffect(() => {
    if (!roomId || isSeated) return
    const interval = setInterval(() => loadSeated(roomId), 4000)
    return () => clearInterval(interval)
  }, [roomId, isSeated])


  async function handleJoin() {
    if (!joinName.trim()) {
      setJoinError('Enter your name first')
      return
    }
    if (!roomId) return
    setJoining(true)
    setJoinError('')

    try {
      const deviceId = getDeviceId()
      const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('device_id', deviceId)
        .single()

      let player = existing
      if (existing && existing.username !== joinName.trim()) {
        const { data: updated } = await supabase
          .from('players')
          .update({ username: joinName.trim() })
          .eq('id', existing.id)
          .select()
          .single()
        player = updated
      } else if (!existing) {
        const { data: created, error: createErr } = await supabase
          .from('players')
          .insert({ device_id: deviceId, username: joinName.trim() })
          .select()
          .single()
        if (createErr) throw createErr
        player = created
      }

      if (!player) throw new Error('Could not create player')

      const { count } = await supabase
        .from('room_players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
      if (count && count >= 8) throw new Error('Room is full')

      await supabase.from('room_players').insert({
        room_id: roomId,
        player_id: player.id,
      })

      setMyPlayerId(player.id)
      setIsSeated(true)
    } catch (e: any) {
      setJoinError(e.message)
    } finally {
      setJoining(false)
    }
  }

  async function handleStart() {
    if (!roomId) return
    if (seated.length < 4) {
      setError('Need at least 4 players to start')
      return
    }
    const { error } = await supabase.functions.invoke('start-game', {
      body: { roomId },
    })
    if (error) setError(error.message)
  }

    async function handleLeaveWaitingRoom() {
    if (!roomId) return
    const deviceId = getDeviceId()
    await supabase.functions.invoke('leave-room', { body: { roomId, deviceId } })
    router.push('/')
  }

  function handleCopyLink() {
    const link = `${window.location.origin}/room/${code}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p className="text-red-400">{error}</p>
      </main>
    )
  }

  if (checkingSeat) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <p>Loading...</p>
      </main>
    )
  }

  if (!isSeated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-gray-950 text-white">
        <h1 className="text-2xl font-bold">Join Room {code}</h1>
        <p className="text-gray-400 text-sm">{seated.length} / 8 players in this room</p>


        <input
          className="w-full max-w-xs px-4 py-3 rounded bg-gray-800 border border-gray-700"
          placeholder="Your name"
          value={joinName}
          onChange={(e) => setJoinName(e.target.value)}
        />

        <button
          className="w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold disabled:opacity-50"
          onClick={handleJoin}
          disabled={joining || seated.length >= 8}
        >
          {seated.length >= 8 ? 'Room is full' : joining ? 'Joining...' : 'Join Room'}
        </button>



        {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-gray-950 text-white">
      <h1 className="text-2xl font-bold">Room {code}</h1>
      <button
          className="text-gray-400 border border-gray-700 rounded-full w-7 h-7 text-sm"
          onClick={() => setShowRules(true)}
        >
          ?
      </button>

      <button className="text-sm text-indigo-400 underline" onClick={handleCopyLink}>
        {copied ? 'Link copied!' : 'Copy room link'}
      </button>
      <p className="text-gray-400">{seated.length} / 8 players joined</p>

      <ul className="w-full max-w-xs space-y-2">
        {[...seated].sort((a, b) => {
          if (a.player_id === hostPlayerId) return -1
          if (b.player_id === hostPlayerId) return 1
          return 0
        }).map((p) => (
        
          <li key={p.id} className="px-4 py-2 rounded bg-gray-800 flex justify-between">
            <span>{p.players?.username ?? 'Unknown'}{p.player_id === myPlayerId && <span className="text-indigo-300"> (You)</span>}</span>
            {p.player_id === hostPlayerId && <span className="text-xs text-amber-400 uppercase self-center">Host</span>}
          </li>
        ))}
      </ul>

      {myPlayerId === hostPlayerId ? (
        <button
          className="w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold disabled:opacity-40"
          disabled={seated.length < 4}
          onClick={handleStart}
        >
          Start Game
        </button>
      ) : seated.length >= 4 ? (
        <p className="text-sm text-emerald-400">The host can now start ({seated.length}/8 joined)</p>
      ) : (
        <p className="text-sm text-gray-500">Waiting for more players to join ({seated.length}/4 minimum)</p>
      )}
      
      <button
        className="w-full max-w-xs px-4 py-3 rounded bg-gray-700 font-semibold"
        onClick={handleLeaveWaitingRoom}
      >
        Leave Waiting Room
      </button>
      
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </main>
  )
}
