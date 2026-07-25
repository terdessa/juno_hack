/**
 * Generated from the live Supabase schema. Regenerate after any migration —
 * do not hand-edit.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assignees: {
        Row: {
          id: string;
          name: string;
          role: string;
          kind: string;
          discipline: string;
        };
        Insert: {
          id: string;
          name: string;
          role: string;
          kind: string;
          discipline: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          kind?: string;
          discipline?: string;
        };
        Relationships: [];
      };
      inbox_items: {
        Row: {
          id: string;
          patient_id: string;
          call_id: string | null;
          task_id: string | null;
          kind: string;
          title: string;
          detail: string | null;
          urgency: string;
          status: string;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          patient_id: string;
          call_id?: string | null;
          task_id?: string | null;
          kind: string;
          title: string;
          detail?: string | null;
          urgency?: string;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          patient_id?: string;
          call_id?: string | null;
          task_id?: string | null;
          kind?: string;
          title?: string;
          detail?: string | null;
          urgency?: string;
          status?: string;
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          patient_id: string | null;
          task_id: string | null;
          calendar_event_id: string | null;
          start_at: string;
          end_at: string;
          reason: string | null;
          kind: string;
          source: string;
          external_id: string | null;
          invitee_name: string | null;
          invitee_email: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          task_id?: string | null;
          calendar_event_id?: string | null;
          start_at: string;
          end_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          task_id?: string | null;
          calendar_event_id?: string | null;
          start_at?: string;
          end_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      calls: {
        Row: {
          id: string;
          task_id: string;
          started_at: string | null;
          ended_at: string | null;
          transcript: Json | null;
          extracted_answers: Json;
          summary: string | null;
          mood: string | null;
          tags: Json;
          follow_up_type: string | null;
          status: string;
          created_at: string;
          elevenlabs_conversation_id: string | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          elevenlabs_conversation_id?: string | null;
          error?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          transcript?: Json | null;
          extracted_answers?: Json;
          summary?: string | null;
          mood?: string | null;
          tags?: Json;
          follow_up_type?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          started_at?: string | null;
          ended_at?: string | null;
          transcript?: Json | null;
          extracted_answers?: Json;
          summary?: string | null;
          mood?: string | null;
          tags?: Json;
          follow_up_type?: string | null;
          status?: string;
          created_at?: string;
          elevenlabs_conversation_id?: string | null;
          error?: string | null;
        };
        // supabase-js resolves nested selects (tasks -> calls) from this, so
        // it can't be trimmed away.
        Relationships: [
          {
            foreignKeyName: "calls_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          id: string;
          name: string;
          dob: string | null;
          phone: string | null;
          alt_phone: string | null;
          email: string | null;
          address: string | null;
          preferred_contact: string | null;
          next_of_kin: Json | null;
          nhs_number: string | null;
          condition: string | null;
          medications: Json;
          vaccinations: Json;
          notes: string | null;
          last_seen_at: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          dob?: string | null;
          phone?: string | null;
          alt_phone?: string | null;
          email?: string | null;
          address?: string | null;
          preferred_contact?: string | null;
          next_of_kin?: Json | null;
          nhs_number?: string | null;
          condition?: string | null;
          medications?: Json;
          vaccinations?: Json;
          notes?: string | null;
          last_seen_at?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          dob?: string | null;
          phone?: string | null;
          alt_phone?: string | null;
          email?: string | null;
          address?: string | null;
          preferred_contact?: string | null;
          next_of_kin?: Json | null;
          nhs_number?: string | null;
          condition?: string | null;
          medications?: Json;
          vaccinations?: Json;
          notes?: string | null;
          last_seen_at?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          patient_id: string;
          assignee_id: string | null;
          purpose: string | null;
          instruction_raw: string;
          questions: Json;
          due_at: string | null;
          status: string;
          urgency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          patient_id: string;
          assignee_id?: string | null;
          purpose?: string | null;
          instruction_raw: string;
          questions?: Json;
          due_at?: string | null;
          status?: string;
          urgency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          patient_id?: string;
          assignee_id?: string | null;
          purpose?: string | null;
          instruction_raw?: string;
          questions?: Json;
          due_at?: string | null;
          status?: string;
          urgency?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assignee_id_fkey";
            columns: ["assignee_id"];
            isOneToOne: false;
            referencedRelation: "assignees";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type CallRow = Database["public"]["Tables"]["calls"]["Row"];
