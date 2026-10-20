import { LOCAL_ONLY, supabase } from '../../lib/supabase'
import { patchLocalEntry } from '../library/localLibrary'

export function deviceLabel(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : /CrOS/.test(ua) ? 'ChromeOS' : 'unknown OS'
  return `${browser} on ${os}`
}

export async function startPlaySession(userId: string, gameId: number): Promise<string | null> {
  if (LOCAL_ONLY) {
    patchLocalEntry(gameId, { last_played_at: new Date().toISOString() })
    return null
  }
  const { data, error } = await supabase
    .from('play_sessions')
    .insert({ user_id: userId, game_id: gameId, device_label: deviceLabel() })
    .select('id')
    .single()
  if (error) return null
  await supabase.from('user_games').update({ last_played_at: new Date().toISOString() }).eq('user_id', userId).eq('game_id', gameId)
  return data.id
}

export async function endPlaySession(sessionId: string | null, userId: string, gameId: number, seconds: number, priorTotal: number) {
  if (LOCAL_ONLY) {
    patchLocalEntry(gameId, { last_played_at: new Date().toISOString(), total_play_seconds: priorTotal + Math.max(0, Math.round(seconds)) })
    return
  }
  if (sessionId) await supabase.from('play_sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId)
  await supabase
    .from('user_games')
    .update({ last_played_at: new Date().toISOString(), total_play_seconds: priorTotal + Math.max(0, Math.round(seconds)) })
    .eq('user_id', userId)
    .eq('game_id', gameId)
}
