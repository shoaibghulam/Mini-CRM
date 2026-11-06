/**
 * Hand-written to match docs/03-db-security-design.md (no Supabase CLI here).
 * Shape follows `supabase gen types typescript` so it can be swapped for the
 * generated file later. Insert/Update list only the columns the
 * `authenticated` role has column grants for.
 */
export type UserRole = 'manager' | 'assignee';
export type TaskStatus = 'new' | 'in_progress' | 'under_review' | 'accepted' | 'needs_rework';

export type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export type SiteRow = {
  id: number;
  name: string;
  address: string;
  created_at: string;
}

export type TaskRow = {
  id: number;
  site_id: number;
  assignee_id: string;
  author_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  created_at: string;
  /** Set by delete_task(). RLS hides archived rows, so the API only ever returns null here. */
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type TaskStatusHistoryRow = {
  id: number;
  task_id: number;
  actor_id: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  comment: string | null;
  created_at: string;
}

export type SiteWrite = {
  name?: string;
  address?: string;
}

export type TaskWrite = {
  site_id?: number;
  assignee_id?: string;
  title?: string;
  description?: string;
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [];
      };
      sites: {
        Row: SiteRow;
        Insert: SiteWrite & { name: string };
        Update: SiteWrite;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: TaskWrite & { site_id: number; assignee_id: string; title: string };
        Update: TaskWrite;
        Relationships: [];
      };
      task_status_history: {
        Row: TaskStatusHistoryRow;
        Insert: { [_ in never]: never };
        Update: { [_ in never]: never };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      change_task_status: {
        Args: { p_task_id: number; p_new_status: TaskStatus; p_comment?: string | null };
        Returns: TaskRow;
      };
      delete_task: { Args: { p_task_id: number }; Returns: undefined };
      is_manager: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: { user_role: UserRole; task_status: TaskStatus };
    CompositeTypes: { [_ in never]: never };
  };
}
