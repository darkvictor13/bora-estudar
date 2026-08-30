export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          id: number
          new_value: Json | null
          occurred_at: string
          old_value: Json | null
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: never
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: never
          new_value?: Json | null
          occurred_at?: string
          old_value?: Json | null
          reason?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      catalog_blocks: {
        Row: {
          active: boolean
          block_key: string
          catalog_key: string
          created_at: string
          id: string
          name: string
          number: number
          question_count: number
          subject_key: string
          subject_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          block_key: string
          catalog_key: string
          created_at?: string
          id?: string
          name: string
          number: number
          question_count?: number
          subject_key: string
          subject_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          block_key?: string
          catalog_key?: string
          created_at?: string
          id?: string
          name?: string
          number?: number
          question_count?: number
          subject_key?: string
          subject_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_blocks_catalog_key_fkey"
            columns: ["catalog_key"]
            isOneToOne: false
            referencedRelation: "catalogs"
            referencedColumns: ["key"]
          },
        ]
      }
      catalog_questions: {
        Row: {
          block_id: string
          position: number
          question_id: number
          topic: string
        }
        Insert: {
          block_id: string
          position: number
          question_id: number
          topic: string
        }
        Update: {
          block_id?: string
          position?: number
          question_id?: number
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_questions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "catalog_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogs: {
        Row: {
          active: boolean
          created_at: string
          key: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          key: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          current_uses: number
          id: string
          max_uses: number | null
          months: number
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          current_uses?: number
          id?: string
          max_uses?: number | null
          months: number
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          current_uses?: number
          id?: string
          max_uses?: number | null
          months?: number
          valid_until?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          batch_id: string | null
          block_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          day_order: number
          deleted_at: string | null
          external_link: string | null
          extra_activity: string | null
          id: string
          planned_minutes: number | null
          reinforcement_skipped: boolean
          source_goal_id: string | null
          source_week: number | null
          status: Database["public"]["Enums"]["goal_status"]
          student_id: string
          student_note: string | null
          study_plan_id: string
          teacher_id: string
          teacher_note: string | null
          title: string
          type: Database["public"]["Enums"]["goal_type"]
          updated_at: string
          week_number: number
          weekday: number
        }
        Insert: {
          batch_id?: string | null
          block_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          day_order: number
          deleted_at?: string | null
          external_link?: string | null
          extra_activity?: string | null
          id?: string
          planned_minutes?: number | null
          reinforcement_skipped?: boolean
          source_goal_id?: string | null
          source_week?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          student_id: string
          student_note?: string | null
          study_plan_id: string
          teacher_id: string
          teacher_note?: string | null
          title: string
          type: Database["public"]["Enums"]["goal_type"]
          updated_at?: string
          week_number: number
          weekday: number
        }
        Update: {
          batch_id?: string | null
          block_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          day_order?: number
          deleted_at?: string | null
          external_link?: string | null
          extra_activity?: string | null
          id?: string
          planned_minutes?: number | null
          reinforcement_skipped?: boolean
          source_goal_id?: string | null
          source_week?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          student_id?: string
          student_note?: string | null
          study_plan_id?: string
          teacher_id?: string
          teacher_note?: string | null
          title?: string
          type?: Database["public"]["Enums"]["goal_type"]
          updated_at?: string
          week_number?: number
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
          {
            foreignKeyName: "goal_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
          {
            foreignKeyName: "goals_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "study_plan_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_source_goal_id_fkey"
            columns: ["source_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_source_goal_id_fkey"
            columns: ["source_goal_id"]
            isOneToOne: false
            referencedRelation: "vw_goal_performance"
            referencedColumns: ["goal_id"]
          },
        ]
      }
      operations: {
        Row: {
          actor_id: string
          created_at: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json | null
          target_id: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          operation: string
          payload_hash: string
          request_id: string
          result?: Json | null
          target_id?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          operation?: string
          payload_hash?: string
          request_id?: string
          result?: Json | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          contact_email: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          id: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      quiz_session_questions: {
        Row: {
          answered_at: string
          execution_order: number
          id: string
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          quiz_session_id: string
          recorded_at: string
          round: number
          source_question_id: number | null
          topic: string | null
        }
        Insert: {
          answered_at: string
          execution_order: number
          id?: string
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          quiz_session_id: string
          recorded_at?: string
          round?: number
          source_question_id?: number | null
          topic?: string | null
        }
        Update: {
          answered_at?: string
          execution_order?: number
          id?: string
          outcome?: Database["public"]["Enums"]["question_outcome"]
          phase?: Database["public"]["Enums"]["question_phase"]
          question_id?: number
          quiz_session_id?: string
          recorded_at?: string
          round?: number
          source_question_id?: number | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_questions_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_session_questions_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: false
            referencedRelation: "vw_quiz_session_performance"
            referencedColumns: ["quiz_session_id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          block_id: string
          cancelled_at: string | null
          completed_at: string | null
          completion_id: string | null
          duration_minutes: number | null
          execution_sequence: number
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          block_id: string
          cancelled_at?: string | null
          completed_at?: string | null
          completion_id?: string | null
          duration_minutes?: number | null
          execution_sequence: number
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          main_target?: number
          origin?: Database["public"]["Enums"]["quiz_session_origin"]
          session_number?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          block_id?: string
          cancelled_at?: string | null
          completed_at?: string | null
          completion_id?: string | null
          duration_minutes?: number | null
          execution_sequence?: number
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          main_target?: number
          origin?: Database["public"]["Enums"]["quiz_session_origin"]
          session_number?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          student_id?: string
          study_plan_id?: string
          teacher_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
          {
            foreignKeyName: "quiz_session_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
          {
            foreignKeyName: "quiz_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "vw_goal_performance"
            referencedColumns: ["goal_id"]
          },
          {
            foreignKeyName: "quiz_sessions_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reinforcement_questions: {
        Row: {
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          reinforcement_id: string
          topic: string | null
        }
        Insert: {
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          reinforcement_id: string
          topic?: string | null
        }
        Update: {
          outcome?: Database["public"]["Enums"]["question_outcome"]
          phase?: Database["public"]["Enums"]["question_phase"]
          question_id?: number
          reinforcement_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reinforcement_questions_reinforcement_id_fkey"
            columns: ["reinforcement_id"]
            isOneToOne: false
            referencedRelation: "reinforcements"
            referencedColumns: ["id"]
          },
        ]
      }
      reinforcement_sessions: {
        Row: {
          quiz_session_id: string
          reinforcement_id: string
        }
        Insert: {
          quiz_session_id: string
          reinforcement_id: string
        }
        Update: {
          quiz_session_id?: string
          reinforcement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reinforcement_sessions_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: true
            referencedRelation: "quiz_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinforcement_sessions_quiz_session_id_fkey"
            columns: ["quiz_session_id"]
            isOneToOne: true
            referencedRelation: "vw_quiz_session_performance"
            referencedColumns: ["quiz_session_id"]
          },
          {
            foreignKeyName: "reinforcement_sessions_reinforcement_id_fkey"
            columns: ["reinforcement_id"]
            isOneToOne: false
            referencedRelation: "reinforcements"
            referencedColumns: ["id"]
          },
        ]
      }
      reinforcements: {
        Row: {
          block_id: string
          completed_at: string
          created_at: string
          cutoff: string
          id: string
          request_id: string
          source_score: number
          student_id: string
          study_plan_id: string
          teacher_id: string
        }
        Insert: {
          block_id: string
          completed_at?: string
          created_at?: string
          cutoff: string
          id?: string
          request_id: string
          source_score: number
          student_id: string
          study_plan_id: string
          teacher_id: string
        }
        Update: {
          block_id?: string
          completed_at?: string
          created_at?: string
          cutoff?: string
          id?: string
          request_id?: string
          source_score?: number
          student_id?: string
          study_plan_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reinforcement_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
          {
            foreignKeyName: "reinforcement_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
        ]
      }
      review_cycles: {
        Row: {
          block_id: string
          completed_at: string
          cutoff: string
          id: string
          reinforcement_id: string | null
          student_id: string
        }
        Insert: {
          block_id: string
          completed_at?: string
          cutoff: string
          id?: string
          reinforcement_id?: string | null
          student_id: string
        }
        Update: {
          block_id?: string
          completed_at?: string
          cutoff?: string
          id?: string
          reinforcement_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_cycles_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cycles_reinforcement_id_fkey"
            columns: ["reinforcement_id"]
            isOneToOne: false
            referencedRelation: "reinforcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cycles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_preferences: {
        Row: {
          cycle_config: Json
          review_config: Json
          student_id: string
          updated_at: string
        }
        Insert: {
          cycle_config?: Json
          review_config?: Json
          student_id: string
          updated_at?: string
        }
        Update: {
          cycle_config?: Json
          review_config?: Json
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_preferences_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_teacher_links: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_teacher_links_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_teacher_links_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plan_batches: {
        Row: {
          applied_at: string
          applied_by: string
          goal_count: number
          id: string
          mode: Database["public"]["Enums"]["batch_mode"]
          study_plan_id: string
          week_number: number
        }
        Insert: {
          applied_at?: string
          applied_by: string
          goal_count: number
          id: string
          mode: Database["public"]["Enums"]["batch_mode"]
          study_plan_id: string
          week_number: number
        }
        Update: {
          applied_at?: string
          applied_by?: string
          goal_count?: number
          id?: string
          mode?: Database["public"]["Enums"]["batch_mode"]
          study_plan_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_batches_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_batches_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plan_blocks: {
        Row: {
          active: boolean
          block_order: number
          catalog_block_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          link: string | null
          name: string
          question_count: number
          student_id: string
          study_plan_id: string
          subject_color: string
          subject_name: string
          subject_order: number
          subject_target: number
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          block_order: number
          catalog_block_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          link?: string | null
          name: string
          question_count?: number
          student_id: string
          study_plan_id: string
          subject_color?: string
          subject_name: string
          subject_order: number
          subject_target?: number
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          block_order?: number
          catalog_block_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          link?: string | null
          name?: string
          question_count?: number
          student_id?: string
          study_plan_id?: string
          subject_color?: string
          subject_name?: string
          subject_order?: number
          subject_target?: number
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_block_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
          {
            foreignKeyName: "study_plan_blocks_catalog_block_id_fkey"
            columns: ["catalog_block_id"]
            isOneToOne: false
            referencedRelation: "catalog_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          area: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          stage: string | null
          start_date: string
          status: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model: string | null
          target_exam: string | null
          teacher_id: string
          updated_at: string
          weekly_goals: number
        }
        Insert: {
          area?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          stage?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model?: string | null
          target_exam?: string | null
          teacher_id: string
          updated_at?: string
          weekly_goals?: number
        }
        Update: {
          area?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          stage?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["study_plan_status"]
          student_id?: string
          study_model?: string | null
          target_exam?: string | null
          teacher_id?: string
          updated_at?: string
          weekly_goals?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          coupon_id: string | null
          created_at: string
          id: string
          plan: string
          status: Database["public"]["Enums"]["access_status"]
          student_id: string
          updated_at: string
          validity: unknown
        }
        Insert: {
          coupon_id?: string | null
          created_at?: string
          id?: string
          plan?: string
          status?: Database["public"]["Enums"]["access_status"]
          student_id: string
          updated_at?: string
          validity?: unknown
        }
        Update: {
          coupon_id?: string | null
          created_at?: string
          id?: string
          plan?: string
          status?: Database["public"]["Enums"]["access_status"]
          student_id?: string
          updated_at?: string
          validity?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          profile_id: string
          theme: Database["public"]["Enums"]["theme_preference"]
          updated_at: string
        }
        Insert: {
          profile_id: string
          theme?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
        }
        Update: {
          profile_id?: string
          theme?: Database["public"]["Enums"]["theme_preference"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string
          focus_exam: string | null
          interest_area: string | null
          name: string
          status: string
          student_id: string
          teacher_id: string | null
          timezone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email: string
          focus_exam?: string | null
          interest_area?: string | null
          name: string
          status?: string
          student_id: string
          teacher_id?: string | null
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string
          focus_exam?: string | null
          interest_area?: string | null
          name?: string
          status?: string
          student_id?: string
          teacher_id?: string | null
          timezone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_block_errors: {
        Row: {
          block_id: string | null
          error_count: number | null
          extra_errors: number | null
          last_error_at: string | null
          last_error_phase: Database["public"]["Enums"]["question_phase"] | null
          main_errors: number | null
          question_id: number | null
          reinforcement_errors: number | null
          student_id: string | null
          study_plan_id: string | null
          topic: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
        ]
      }
      vw_block_performance: {
        Row: {
          block_id: string | null
          extra_correct: number | null
          extra_count: number | null
          extra_incorrect: number | null
          main_correct: number | null
          main_count: number | null
          main_incorrect: number | null
          official_score_pct: number | null
          reinforcement_correct: number | null
          reinforcement_count: number | null
          reinforcement_incorrect: number | null
          session_count: number | null
          student_id: string | null
          study_plan_id: string | null
          total_correct: number | null
          total_count: number | null
          total_incorrect: number | null
          total_score_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
        ]
      }
      vw_goal_performance: {
        Row: {
          correct_answers: number | null
          goal_id: string | null
          minutes_spent: number | null
          questions_answered: number | null
          status: Database["public"]["Enums"]["goal_status"] | null
          student_id: string | null
          study_plan_id: string | null
          teacher_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
        ]
      }
      vw_quiz_session_performance: {
        Row: {
          block_id: string | null
          duration_minutes: number | null
          extra_correct: number | null
          extra_count: number | null
          extra_incorrect: number | null
          goal_id: string | null
          main_correct: number | null
          main_count: number | null
          main_incorrect: number | null
          main_target: number | null
          quiz_session_id: string | null
          reinforcement_correct: number | null
          reinforcement_count: number | null
          reinforcement_incorrect: number | null
          status: Database["public"]["Enums"]["quiz_session_status"] | null
          student_id: string | null
          study_plan_id: string | null
          teacher_id: string | null
          total_correct: number | null
          total_count: number | null
          total_incorrect: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
          {
            foreignKeyName: "quiz_session_context_fk"
            columns: ["study_plan_id", "student_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id", "teacher_id"]
          },
          {
            foreignKeyName: "quiz_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "vw_goal_performance"
            referencedColumns: ["goal_id"]
          },
        ]
      }
      vw_seen_questions: {
        Row: {
          block_id: string | null
          correct_answers: number | null
          incorrect_answers: number | null
          last_seen_at: string | null
          question_id: number | null
          student_id: string | null
          study_plan_id: string | null
          times_seen: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_block_fk"
            columns: ["block_id", "study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plan_blocks"
            referencedColumns: ["id", "study_plan_id", "student_id"]
          },
        ]
      }
    }
    Functions: {
      activate_study_plan: {
        Args: { p_study_plan_id: string }
        Returns: {
          area: string | null
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          stage: string | null
          start_date: string
          status: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model: string | null
          target_exam: string | null
          teacher_id: string
          updated_at: string
          weekly_goals: number
        }
        SetofOptions: {
          from: "*"
          to: "study_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_study_plan_batch: {
        Args: {
          p_batch_id: string
          p_goals: Json
          p_mode: Database["public"]["Enums"]["batch_mode"]
          p_study_plan_id: string
          p_week: number
        }
        Returns: Json
      }
      can_view_context: {
        Args: { p_professor_id: string; p_student_id: string }
        Returns: boolean
      }
      finish_quiz_session: {
        Args: {
          p_cancel?: boolean
          p_outcomes: Json
          p_quiz_session_id: string
          p_request_id: string
        }
        Returns: {
          block_id: string
          cancelled_at: string | null
          completed_at: string | null
          completion_id: string | null
          duration_minutes: number | null
          execution_sequence: number
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quiz_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      is_teacher_of: { Args: { p_student_id: string }; Returns: boolean }
      record_quiz_session_time: {
        Args: {
          p_duration_minutes: number
          p_quiz_session_id: string
          p_request_id: string
        }
        Returns: {
          block_id: string
          cancelled_at: string | null
          completed_at: string | null
          completion_id: string | null
          duration_minutes: number | null
          execution_sequence: number
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quiz_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_reinforcement: {
        Args: {
          p_block_id: string
          p_outcomes: Json
          p_quiz_session_ids: string[]
          p_request_id: string
          p_study_plan_id: string
        }
        Returns: {
          block_id: string
          completed_at: string
          created_at: string
          cutoff: string
          id: string
          request_id: string
          source_score: number
          student_id: string
          study_plan_id: string
          teacher_id: string
        }
        SetofOptions: {
          from: "*"
          to: "reinforcements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_operation: {
        Args: {
          p_operation: string
          p_payload: string
          p_request_id: string
          p_target_id: string
        }
        Returns: Record<string, unknown>
      }
      start_quiz_session: {
        Args: { p_block_id: string; p_goal_id: string; p_study_plan_id: string }
        Returns: {
          block_id: string
          cancelled_at: string | null
          completed_at: string | null
          completion_id: string | null
          duration_minutes: number | null
          execution_sequence: number
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quiz_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_quiz_session: {
        Args: {
          p_quiz_session_id: string
          p_reason?: string
          p_request_id: string
        }
        Returns: {
          block_id: string
          cancelled_at: string | null
          completed_at: string | null
          completion_id: string | null
          duration_minutes: number | null
          execution_sequence: number
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quiz_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      access_status: "pending" | "active" | "suspended" | "expired"
      batch_mode: "append" | "replace" | "replan"
      goal_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "skipped"
        | "cancelled"
      goal_type: "theory" | "question_block" | "reinforcement" | "extra_study"
      question_outcome: "correct" | "incorrect"
      question_phase: "main" | "reinforcement" | "extra"
      quiz_session_origin: "goal" | "error_notebook"
      quiz_session_status:
        | "in_progress"
        | "awaiting_time"
        | "completed"
        | "cancelled"
        | "voided"
      study_plan_status: "draft" | "active" | "paused" | "archived"
      theme_preference: "light" | "dark"
      user_role: "student" | "teacher" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_status: ["pending", "active", "suspended", "expired"],
      batch_mode: ["append", "replace", "replan"],
      goal_status: [
        "pending",
        "in_progress",
        "completed",
        "skipped",
        "cancelled",
      ],
      goal_type: ["theory", "question_block", "reinforcement", "extra_study"],
      question_outcome: ["correct", "incorrect"],
      question_phase: ["main", "reinforcement", "extra"],
      quiz_session_origin: ["goal", "error_notebook"],
      quiz_session_status: [
        "in_progress",
        "awaiting_time",
        "completed",
        "cancelled",
        "voided",
      ],
      study_plan_status: ["draft", "active", "paused", "archived"],
      theme_preference: ["light", "dark"],
      user_role: ["student", "teacher", "admin"],
    },
  },
} as const

