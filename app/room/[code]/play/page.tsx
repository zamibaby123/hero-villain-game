'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getDeviceId } from '@/lib/deviceId'
import AppHeader from '@/components/AppHeader'



type Phase = 'role' | 'submit' | 'waiting' | 'reveal' | 'voting' | 'results' | 'ended'

export default function PlayPage() {
  const { code } = useParams<{ code: string }>()
  const [roomId, setRoomId] = useState<string | null>(null)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [coVillainIds, setCoVillainIds] = useState<string[]>([])
  const [word, setWord] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState<Phase>('role')
  const [showRules, setShowRules] = useState(false)


  const [deadline, setDeadline] = useState<number | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [submittedCount, setSubmittedCount] = useState(0)
  const [aliveCount, setAliveCount] = useState(4)
  const [myWord, setMyWord] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submissions, setSubmissions] = useState<any[]>([])

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myUsername, setMyUsername] = useState<string | null>(null)
  const [myAlive, setMyAlive] = useState(true)

  const [alivePlayers, setAlivePlayers] = useState<any[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [voteConfirmed, setVoteConfirmed] = useState(false)

  const [voteCount, setVoteCount] = useState(0)
  const [resultsStartedAt, setResultsStartedAt] = useState<number | null>(null)
  const [eliminatedName, setEliminatedName] = useState<string | null>(null)
  const [eliminatedRole, setEliminatedRole] = useState<string | null>(null)
  const [villainsRemaining, setVillainsRemaining] = useState<number | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [votingStartsAt, setVotingStartsAt] = useState<number | null>(null)

  async function fetchAliveCount() {
    if (!roomId) return
    const { count } = await supabase
      .from('room_players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('alive', true)
    setAliveCount(count ?? 4)
  }

  async function loadRound(rId: string) {
    const deviceId = getDeviceId()
    const { data, error: fnErr } = await supabase.functions.invoke('get-my-role', {
      body: { roomId, deviceId },
    })
    if (fnErr) return
    setRole(data.role)
    setWord(data.word)
    setRoundId(data.roundId)
    setCoVillainIds(data.coVillainIds ?? [])


    const { data: round } = await supabase
      .from('rounds')
      .select('round_deadline, submitted_count')
      .eq('id', data.roundId)
      .single()

    if (round?.round_deadline) setDeadline(new Date(round.round_deadline).getTime())
    setSubmittedCount(round?.submitted_count ?? 0)
    setMyWord('')
    setSubmissions([])
    setSelectedTarget(null)
    setVoteConfirmed(false)
    setVoteCount(0)
    setEliminatedName(null)
    setEliminatedRole(null)
    setVillainsRemaining(null)
    await fetchAliveCount()

    if (!myAlive) {
      setPhase('submit') // eliminated players skip the role screen entirely
    } else {
      setPhase('role')
    }
  }

  useEffect(() => {
    async function init() {
      const deviceId = getDeviceId()
      const { data: myPlayer } = await supabase
        .from('players')
        .select('id, username')
        .eq('device_id', deviceId)
        .single()
      if (myPlayer) {
        setMyPlayerId(myPlayer.id)
        setMyUsername(myPlayer.username)
      }

      const { data: room } = await supabase
        .from('rooms')
        .select('id, status, winner')
        .eq('code', code)
        .single()

      if (!room) {
        setError('Room not found')
        setLoading(false)
        return
      }
      setRoomId(room.id)

      if (room.status === 'ended') {
        setWinner(room.winner)
        setPhase('ended')
        setLoading(false)
        return
      }

      const { data, error: fnErr } = await supabase.functions.invoke('get-my-role', {
        body: { roomId: room.id, deviceId },
      })

      if (fnErr) {
        try {
          const body = await fnErr.context.json()
          setError(body.error || 'Could not load your role')
        } catch {
          setError('Could not load your role')
        }
        setLoading(false)
        return
      }

      setRole(data.role)
      setWord(data.word)
      setRoundId(data.roundId)
      setCoVillainIds(data.coVillainIds ?? [])


      let alive = true
      if (myPlayer) {
        const { data: seat } = await supabase
          .from('room_players')
          .select('id, alive')
          .eq('room_id', room.id)
          .eq('player_id', myPlayer.id)
          .single()
        if (seat) {
          alive = seat.alive
          setMyAlive(seat.alive)
        }
      }

      const { count } = await supabase
        .from('room_players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('alive', true)
      setAliveCount(count ?? 4)

      const { data: round } = await supabase
        .from('rounds')
        .select('round_deadline, submitted_count')
        .eq('id', data.roundId)
        .single()

      if (round?.round_deadline) setDeadline(new Date(round.round_deadline).getTime())
      setSubmittedCount(round?.submitted_count ?? 0)
      setPhase(alive ? 'role' : 'submit')
      setLoading(false)
    }
    init()
  }, [code])

  // Countdown ticker
  useEffect(() => {
    if (!deadline || phase === 'results' || phase === 'ended') return
    function tick() {
      setSecondsLeft(Math.max(0, Math.floor((deadline! - Date.now()) / 1000)))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadline, phase])

  // Live submission count tracker
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`round-${roundId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` },
        (payload) => setSubmittedCount(payload.new.submitted_count)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roundId])

  // Early finalize the moment everyone alive has submitted
  useEffect(() => {
    if (submittedCount >= aliveCount && aliveCount > 0 && roomId && roundId && (phase === 'submit' || phase === 'waiting')) {
      supabase.functions.invoke('finalize-round', { body: { roomId, roundId } })
    }
  }, [submittedCount, aliveCount, roomId, roundId, phase])

  // Timeout handling for submit and voting phases
  useEffect(() => {
    if (secondsLeft !== 0 || !roomId || !roundId) return
    if (phase === 'role' || phase === 'submit' || phase === 'waiting') {
      supabase.functions.invoke('finalize-round', { body: { roomId, roundId } })
    } else if (phase === 'voting') {
      supabase.functions.invoke('tally-votes', { body: { roomId, roundId, forceTally: true } })
    }
  }, [secondsLeft, roomId, roundId, phase])

  // Safety net: periodically verify we're on the right phase, regardless of how we got here
  useEffect(() => {
    if (!roomId || !roundId || phase === 'results' || phase === 'ended') return

    const syncInterval = setInterval(async () => {
      const { data: round } = await supabase
        .from('rounds')
        .select('finalized, votes_tallied, voting_starts_at')
        .eq('id', roundId)
        .single()

      if (!round) return

      const now = Date.now()
      const votingStarted = round.voting_starts_at && now >= new Date(round.voting_starts_at).getTime()

      if (round.finalized && votingStarted && phase !== 'voting' && phase !== 'reveal') {
        loadAlivePlayers()
      } else if (round.finalized && !votingStarted && phase !== 'reveal' && phase !== 'voting') {
        setPhase('reveal')
      }
    }, 3000)

    return () => clearInterval(syncInterval)
  }, [roomId, roundId, phase])

  // Reveal sequence — auto-advances to voting at the server-scheduled time
  useEffect(() => {
    if (submittedCount < aliveCount || aliveCount === 0 || !roundId || phase === 'voting' || phase === 'results' || phase === 'ended') return
    setPhase('reveal')

    const interval = setInterval(async () => {
      await supabase.functions.invoke('reveal-next-word', { body: { roundId } })
      const { data } = await supabase
        .from('submissions')
        .select('id, word, no_submission, reveal_order, room_players(id, player_id, players(username))')
        .eq('round_id', roundId)
        .eq('revealed', true)
        .order('reveal_order', { ascending: true })
      if (data) setSubmissions(data)

      const { data: round } = await supabase
        .from('rounds')
        .select('voting_starts_at')
        .eq('id', roundId)
        .single()

      if (round?.voting_starts_at) {
        const startsAt = new Date(round.voting_starts_at).getTime()
        setVotingStartsAt(startsAt)
        if (Date.now() >= startsAt) {
          clearInterval(interval)
          loadAlivePlayers()
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [submittedCount, aliveCount, roundId, phase])

  async function loadAlivePlayers() {
    if (!roomId || !roundId) return
    const { data } = await supabase
      .from('room_players')
      .select('id, player_id, players(username)')
      .eq('room_id', roomId)
      .eq('alive', true)
    if (data) setAlivePlayers(data)

    const { data: round } = await supabase
      .from('rounds')
      .select('voting_deadline')
      .eq('id', roundId)
      .single()

    if (round?.voting_deadline) {
      setDeadline(new Date(round.voting_deadline).getTime())
    }
    setPhase('voting')
  }

  // Voting phase: poll for vote count, trigger tally, and watch for a decided result
  useEffect(() => {
    if (phase !== 'voting' || !roundId || !roomId) return

    const interval = setInterval(async () => {
      const { data: round } = await supabase
        .from('rounds')
        .select('votes_tallied, eliminated_room_player_id, eliminated_role, villains_remaining')
        .eq('id', roundId)
        .single()

      if (round?.votes_tallied) {
        const elimId = round.eliminated_room_player_id
        if (elimId) {
          const elim = alivePlayers.find((p) => p.id === elimId)
          setEliminatedName(elim?.players?.username ?? 'Someone')
          setEliminatedRole(round.eliminated_role)
          setVillainsRemaining(round.villains_remaining)
          if (elim?.player_id === myPlayerId) setMyAlive(false)
        } else {
          setEliminatedName(null)
          setEliminatedRole(null)
        }
        setPhase('results')
        setResultsStartedAt(Date.now())
        return
      }

      const { count } = await supabase
        .from('votes')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', roundId)
      setVoteCount(count ?? 0)
      if (count && count >= alivePlayers.length) {
        await supabase.functions.invoke('tally-votes', { body: { roomId, roundId } })
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [phase, roundId, roomId, alivePlayers, myPlayerId])

  // Results phase: poll for what happens next (win, or a new round)
  useEffect(() => {
    if (phase !== 'results' || !roomId) return
    if (resultsStartedAt && Date.now() - resultsStartedAt < 5000) return

    const interval = setInterval(async () => {
      const { data: room } = await supabase
        .from('rooms')
        .select('status, winner')
        .eq('id', roomId)
        .single()
      if (!room) return

      if (room.status === 'ended') {
        setWinner(room.winner)
        setPhase('ended')
        return
      }

      const { data: latestRound } = await supabase
        .from('rounds')
        .select('id, round_number')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (latestRound && latestRound.id !== roundId) {
        loadRound(latestRound.id)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [phase, roomId, roundId])

  async function handleSubmitWord() {
    if (!roomId || !roundId) return
    setSubmitError('')
    if (!/^[A-Za-z]+$/.test(myWord.trim())) {
      setSubmitError('One word only — letters only, no spaces or numbers')
      return
    }
    setSubmitting(true)
    const deviceId = getDeviceId()
    const { error: fnErr } = await supabase.functions.invoke('submit-word', {
      body: { roomId, roundId, deviceId, word: myWord.trim() },
    })
    setSubmitting(false)
    if (fnErr) {
      try {
        const body = await fnErr.context.json()
        setSubmitError(body.error || 'Could not submit word')
      } catch {
        setSubmitError('Could not submit word')
      }
      return
    }
    setPhase('waiting')
  }

  async function handleSelectVote(targetRoomPlayerId: string) {
    if (voteConfirmed) return
    setSelectedTarget(targetRoomPlayerId)
  }

  async function handleConfirmVote() {
    if (!roomId || !roundId || !selectedTarget) return
    const deviceId = getDeviceId()
    const { error } = await supabase.functions.invoke('cast-vote', {
      body: { roomId, roundId, deviceId, targetRoomPlayerId: selectedTarget },
    })
    if (error) {
      try {
        const body = await error.context.json()
        alert(body.error || 'Vote failed to save')
      } catch {
        alert('Vote failed to save')
      }
      return
    }
    setVoteConfirmed(true)
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white"><p>Loading...</p></main>
  }
  if (error) {
    return <main className="min-h-screen flex items-center justify-center bg-gray-950 text-white"><p className="text-red-400">{error}</p></main>
  }

  const Timer = (
    <p className={`text-2xl font-bold ${secondsLeft !== null && secondsLeft <= 10 ? 'text-red-500' : ''}`}>
      0:{(secondsLeft ?? 60).toString().padStart(2, '0')}
    </p>
  )
  const RoleBanner = (
    <div className="w-full max-w-xs px-4 py-3 rounded bg-gray-800 border border-gray-700 text-center mb-2">
      <p className={`text-xs uppercase tracking-widest ${role === 'villain' ? 'text-red-400' : 'text-emerald-400'}`}>
        {role === 'villain' ? 'Villain' : 'Hero'}
      </p>
      <p className="text-lg font-semibold">{word}</p>
    </div>
  )
  const SpectatorBanner = !myAlive ? (
    <div className="w-full max-w-xs px-3 py-2 rounded bg-red-950 border border-red-800 text-center text-xs text-red-300 mb-1">
      You've been eliminated — spectating
    </div>
  ) : null
  const PlayingAs = (
    <p className="text-xs text-gray-500">Playing as <span className="text-white font-semibold">{myUsername}</span></p>
  )



  if (phase === 'role') {
    // Only reachable if alive — eliminated players skip straight to 'submit' as spectators
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {Timer}
        <p className="text-sm uppercase tracking-widest text-gray-400">You are the</p>
        <h1 className={`text-4xl font-bold ${role === 'villain' ? 'text-red-500' : 'text-emerald-400'}`}>
          {role === 'villain' ? 'Villain' : 'Hero'}
        </h1>
        <p className="text-sm text-gray-400 mt-4">Your word:</p>
        <p className="text-2xl font-semibold">{word}</p>
        <p className="text-xs text-gray-500 mt-2">You have 60 seconds to submit — the clock is already running</p>
        <button className="mt-6 w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold" onClick={() => setPhase('submit')}>
          Continue
        </button>
      </main>
    )
  }

  if (phase === 'submit') {
    if (!myAlive) {
      return (
        <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
          <AppHeader username={myUsername} />
          {SpectatorBanner}
          {Timer}
          <p className="text-gray-400 text-sm">Watching the others submit their words...</p>
          <p className="text-sm text-gray-500">{submittedCount} / {aliveCount} submitted</p>
        </main>
      )
    }
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {RoleBanner}
        {Timer}
        <p className="text-gray-400 text-sm">Submit a word that hints at your knowledge</p>
        <input
          className="w-full max-w-xs px-4 py-3 rounded bg-gray-800 border border-gray-700 text-center"
          placeholder="One word, letters only"
          value={myWord}
          onChange={(e) => setMyWord(e.target.value)}
          maxLength={20}
        />
        <p className="text-sm text-gray-500">{submittedCount} / {aliveCount} submitted</p>
        <button
          className="w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold disabled:opacity-40"
          onClick={handleSubmitWord}
          disabled={submitting || !myWord.trim()}
        >
          Submit
        </button>
        {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
      </main>
    )
  }

  if (phase === 'waiting') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {SpectatorBanner}
        {RoleBanner}
        {Timer}
        <p className="text-lg">Word submitted!</p>
        <p className="text-gray-400">{submittedCount} / {aliveCount} players submitted</p>
        {submittedCount >= aliveCount ? (
          <p className="text-emerald-400 text-sm">Everyone's in! Get ready to see the words...</p>
        ) : (
          <p className="text-sm text-gray-500">Waiting for the others to submit...</p>
        )}
      </main>
    )
  }

  if (phase === 'reveal') {
    const allRevealed = submissions.length >= aliveCount
    const secondsToVoting = votingStartsAt ? Math.max(0, Math.ceil((votingStartsAt - Date.now()) / 1000)) : null
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {SpectatorBanner}
        {RoleBanner}
        {PlayingAs}
        <h2 className="text-xl font-bold">Revealing words randomly...</h2>
        <ul className="w-full max-w-xs space-y-2">
          {submissions.map((s) => {
            const isMe = s.room_players?.player_id === myPlayerId
            const isCoVillain = coVillainIds.includes(s.room_players?.id)
            return (
              <li key={s.id} className={`px-4 py-3 rounded flex justify-between ${isMe ? 'bg-indigo-900 border border-indigo-500' : 'bg-gray-800'}`}>
                <span>{s.room_players?.players?.username ?? '???'}{isMe && <span className="text-indigo-300"> (You)</span>}{isCoVillain && <span className="text-red-400"> (Co-Villain)</span>}</span>
                <span className={s.no_submission ? 'text-gray-500 italic' : 'font-semibold'}>
                  {s.no_submission ? 'No submission' : s.word}
                </span>
              </li>
            )
          })}
        </ul>
        {allRevealed && (
          <p className="text-emerald-400 text-sm mt-4">
            Get ready to vote{secondsToVoting !== null ? `... ${secondsToVoting}` : '...'}
          </p>
        )}
      </main>
    )
  }

  if (phase === 'voting') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {SpectatorBanner}
        {RoleBanner}
        {PlayingAs}
        {Timer}
        <h2 className="text-xl font-bold">{myAlive ? 'Vote to eliminate' : 'Voting in progress'}</h2>
        <p className="text-sm text-gray-500">{voteCount} / {alivePlayers.length} votes cast</p>

        <ul className="w-full max-w-xs space-y-2">
          {alivePlayers
            .filter((p) => myAlive ? p.player_id !== myPlayerId : true)
            .map((p) => {
              const isMe = p.player_id === myPlayerId
              const isCoVillain = coVillainIds.includes(p.id)
              const sub = submissions.find((s) => s.room_players?.id === p.id)
              const wordDisplay = sub ? (sub.no_submission ? 'No submission' : sub.word) : ''
              if (!myAlive) {
                return (
                  <li key={p.id} className={`px-4 py-3 rounded flex justify-between ${isMe ? 'bg-indigo-900 border border-indigo-500' : 'bg-gray-800'}`}>
                    <span>{p.players?.username ?? '???'}{isMe && <span className="text-indigo-300"> (You)</span>}</span>
                    <span className="text-gray-400">{wordDisplay}</span>
                  </li>
                )
              }
              return (
                <li key={p.id}>
                  <button
                    className={`w-full px-4 py-3 rounded flex justify-between items-center text-left ${selectedTarget === p.id ? 'bg-indigo-600' : 'bg-gray-800'} disabled:opacity-60`}
                    onClick={() => handleSelectVote(p.id)}
                    disabled={voteConfirmed}
                  >
                    <span>{p.players?.username ?? '???'}{isCoVillain && <span className="text-red-400"> (Co-Villain)</span>}</span>
                    <span className="text-gray-300 text-sm">{wordDisplay}</span>
                  </button>
                </li>
              )
            })}
          </ul>

        {myAlive && !voteConfirmed && selectedTarget && (
          <button
            className="w-full max-w-xs px-4 py-3 rounded bg-emerald-600 font-semibold"
            onClick={handleConfirmVote}
          >
            Confirm Vote
          </button>
        )}
        {myAlive && voteConfirmed && (
          <p className="text-sm text-emerald-400">Vote confirmed — waiting for others...</p>
        )}

      </main>
    )
  }

  if (phase === 'results') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
        <AppHeader username={myUsername} />
        {SpectatorBanner}
        {eliminatedName ? (
          <>
            <p className="text-xl font-bold">{eliminatedName} was eliminated!</p>
            <p className="text-gray-400">
              {eliminatedName} was a {eliminatedRole === 'villain' ? 'Villain' : 'Hero'}
            </p>
            {villainsRemaining !== null && (
              <p className="text-sm text-red-400">
                There {villainsRemaining === 1 ? 'is' : 'are'} {villainsRemaining} Villain{villainsRemaining === 1 ? '' : 's'} remaining
              </p>
            )}
          </>
        ) : (
          <p className="text-xl font-bold">The vote was tied — no one is eliminated</p>
        )}
        <p className="text-gray-400 text-sm">Get ready for the next round...</p>
      </main>
    )
  }

  // phase === 'ended'
  return <EndedScreen roomId={roomId} code={code as string} winner={winner} />
  // phase === 'ended'
  return <EndedScreen roomId={roomId} code={code as string} winner={winner} />
}



function EndedScreen({ roomId, code, winner }: { roomId: string | null; code: string; winner: string | null }) {
  const router = useRouter()
  const [countdown, setCountdown] = useState(10)
  const [actionTaken, setActionTaken] = useState(false)

  useEffect(() => {
    if (!roomId) return
    const channel = supabase
      .channel(`ended-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new.status === 'lobby') {
            router.push(`/room/${code}`)
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    if (actionTaken) return
    if (countdown <= 0) {
      handlePlayAgain()
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, actionTaken])

  async function handlePlayAgain() {
    if (!roomId || actionTaken) return
    setActionTaken(true)
    await supabase.functions.invoke('return-to-waiting-room', { body: { roomId } })
  }

  async function handleLeaveRoom() {
    if (!roomId) return
    setActionTaken(true)
    const deviceId = getDeviceId()
    await supabase.functions.invoke('leave-room', { body: { roomId, deviceId } })
    router.push('/')
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-950 text-white">
      
      <h1 className="text-3xl font-bold">
        {winner === 'heroes' ? 'Heroes Win!' : winner === 'villain' ? 'Villain Wins!' : 'Game Over'}
      </h1>
      {!actionTaken && (
        <p className="text-sm text-gray-500">Returning to Waiting Room in {countdown}...</p>
      )}
      <button
        className="mt-6 w-full max-w-xs px-4 py-3 rounded bg-indigo-600 font-semibold disabled:opacity-50"
        onClick={handlePlayAgain}
        disabled={actionTaken}
      >
        Play Again
      </button>
      <button
        className="w-full max-w-xs px-4 py-3 rounded bg-gray-700 font-semibold"
        onClick={handleLeaveRoom}
      >
        Leave Room
      </button>
    </main>
  )
}
