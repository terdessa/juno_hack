/**
 * Generated from the live Supabase schema. Regenerate after any migration —
 * do not hand-edit.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          end_at: string
          id: string
          patient_id: string
          start_at: string
          task_id: string | null
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          end_at: string
          id?: string
          patient_id: string
          start_at: string
          task_id?: string | null
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          end_at?: string
          id?: string
          patient_id?: string
          start_at?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          created_at: string
          ended_at: string | null
          extracted_answers: Json
          id: string
          mood_score: number | null
          started_at: string | null
          status: string
          task_id: string
          transcript: string | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          extracted_answers?: Json
          id?: string
          mood_score?: number | null
          started_at?: string | null
          status?: string
          task_id: string
          transcript?: string | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          extracted_answers?: Json
          id?: string
          mood_score?: number | null
          started_at?: string | null
          status?: string
          task_id?: string
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          created_at: string
          dob: string | null
          id: string
          last_seen_at: string | null
          name: string
          notes: string | null
          phone: string | null
          status: string
          vaccinations: Json
        }
        Insert: {
          created_at?: string
          dob?: string | null
          id?: string
          last_seen_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          vaccinations?: Json
        }
        Update: {
          created_at?: string
          dob?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          vaccinations?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          instruction_raw: string
          patient_id: string
          questions: Json
          status: string
          urgency: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          instruction_raw: string
          patient_id: string
          questions?: Json
          status?: string
          urgency?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          instruction_raw?: string
          patient_id?: string
          questions?: Json
          status?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DefaultSchema = Database["public"]

export type Tables<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T]["Update"]

export type Patient = Tables<"patients">
export type Task = Tables<"tasks">
export type Call = Tables<"calls">
export type Booking = Tables<"bookings">
