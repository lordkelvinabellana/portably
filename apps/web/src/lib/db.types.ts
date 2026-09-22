// Hand-written to match supabase/migrations/20260922000000_initial_schema.sql.
// Regenerate once a project is linked:
//   npx supabase gen types typescript --linked > apps/web/src/lib/db.types.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UploadStatus = 'pending' | 'uploading' | 'ready' | 'failed'
export type FileFormat = 'iso' | 'cso' | 'pbp' | 'zip'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          storage_quota_bytes: number
          storage_used_bytes: number
          created_at: string
          updated_at: string
        }
        Insert: { id: string; username?: string | null }
        Update: { username?: string | null }
        Relationships: []
      }
      games: {
        Row: {
          id: number
          disc_id: string
          title: string
          region: string | null
          cover_url: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      user_games: {
        Row: {
          user_id: string
          game_id: number
          file_sha256: string
          file_size: number
          file_name: string | null
          file_format: FileFormat
          storage_path: string | null
          upload_status: UploadStatus
          settings: Json
          last_played_at: string | null
          total_play_seconds: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          game_id: number
          file_sha256: string
          file_size: number
          file_name?: string | null
          file_format: FileFormat
          storage_path?: string | null
          upload_status?: UploadStatus
          settings?: Json
        }
        Update: Partial<Database['public']['Tables']['user_games']['Insert']> & {
          last_played_at?: string | null
          total_play_seconds?: number
        }
        Relationships: []
      }
      saves: {
        Row: {
          id: string
          user_id: string
          game_id: number
          storage_path: string
          content_hash: string
          size_bytes: number
          device_label: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          game_id: number
          storage_path: string
          content_hash: string
          size_bytes: number
          device_label?: string | null
        }
        Update: never
        Relationships: []
      }
      save_states: {
        Row: {
          id: string
          user_id: string
          game_id: number
          slot: number
          storage_path: string
          screenshot_path: string | null
          size_bytes: number
          core_version: string
          created_at: string
        }
        Insert: {
          user_id: string
          game_id: number
          slot: number
          storage_path: string
          screenshot_path?: string | null
          size_bytes: number
          core_version: string
        }
        Update: Partial<Database['public']['Tables']['save_states']['Insert']>
        Relationships: []
      }
      play_sessions: {
        Row: {
          id: string
          user_id: string
          game_id: number
          started_at: string
          ended_at: string | null
          device_label: string | null
        }
        Insert: { user_id: string; game_id: number; device_label?: string | null }
        Update: { ended_at?: string | null }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      upsert_game: {
        Args: { p_disc_id: string; p_title: string; p_region?: string | null }
        Returns: Database['public']['Tables']['games']['Row']
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Game = Database['public']['Tables']['games']['Row']
export type UserGame = Database['public']['Tables']['user_games']['Row']
