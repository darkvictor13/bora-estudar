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
      access_grants: {
        Row: {
          action: Database["public"]["Enums"]["access_grant_action"]
          created_at: string
          expires_at: string | null
          id: string
          months: number | null
          request_id: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["access_grant_action"]
          created_at?: string
          expires_at?: string | null
          id?: string
          months?: number | null
          request_id: string
          student_id: string
          teacher_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["access_grant_action"]
          created_at?: string
          expires_at?: string | null
          id?: string
          months?: number | null
          request_id?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_blocks: {
        Row: {
          active: boolean
          active_questions: number
          block_name: string
          block_number: number
          catalog_id: string
          catalog_key: string
          catalog_subject_key: string
          created_at: string
          description: string | null
          question_slots: number
          subject_name: string
          topics: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_questions: number
          block_name: string
          block_number: number
          catalog_id: string
          catalog_key: string
          catalog_subject_key: string
          created_at?: string
          description?: string | null
          question_slots: number
          subject_name: string
          topics: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_questions?: number
          block_name?: string
          block_number?: number
          catalog_id?: string
          catalog_key?: string
          catalog_subject_key?: string
          created_at?: string
          description?: string | null
          question_slots?: number
          subject_name?: string
          topics?: number
          updated_at?: string
        }
        Relationships: []
      }
      class_students: {
        Row: {
          class_id: string
          created_at: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_students_class_fk"
            columns: ["class_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "class_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_students_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          teacher_id: string
          theory_catalog_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          teacher_id: string
          theory_catalog_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          teacher_id?: string
          theory_catalog_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_theory_catalog_fk"
            columns: ["theory_catalog_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_catalogs"
            referencedColumns: ["id", "teacher_id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          months_granted: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          months_granted?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          months_granted?: number
          updated_at?: string
        }
        Relationships: []
      }
      exam_notice_items: {
        Row: {
          norm_id: string
          notice_id: string
          position: number
          scope: string
          section_position: number
        }
        Insert: {
          norm_id: string
          notice_id: string
          position: number
          scope: string
          section_position: number
        }
        Update: {
          norm_id?: string
          notice_id?: string
          position?: number
          scope?: string
          section_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_notice_items_norm_id_fkey"
            columns: ["norm_id"]
            isOneToOne: false
            referencedRelation: "legal_norms"
            referencedColumns: ["canonical_id"]
          },
          {
            foreignKeyName: "exam_notice_items_notice_id_section_position_fkey"
            columns: ["notice_id", "section_position"]
            isOneToOne: false
            referencedRelation: "exam_notice_sections"
            referencedColumns: ["notice_id", "position"]
          },
        ]
      }
      exam_notice_sections: {
        Row: {
          notice_id: string
          position: number
          title: string
        }
        Insert: {
          notice_id: string
          position: number
          title: string
        }
        Update: {
          notice_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_notice_sections_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "exam_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_notices: {
        Row: {
          accent: string
          base_date: string
          canonical_id: string
          created_at: string
          id: string
          position: number
          short_name: string
          title: string
          updated_at: string
        }
        Insert: {
          accent: string
          base_date: string
          canonical_id: string
          created_at?: string
          id: string
          position: number
          short_name: string
          title: string
          updated_at?: string
        }
        Update: {
          accent?: string
          base_date?: string
          canonical_id?: string
          created_at?: string
          id?: string
          position?: number
          short_name?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      flashcard_marks: {
        Row: {
          card_kind: Database["public"]["Enums"]["flashcard_card_kind"]
          color: Database["public"]["Enums"]["law_mark_color"]
          created_at: string
          end_offset: number
          id: string
          lesson_card_id: string | null
          lesson_id: string | null
          library_card_id: string | null
          library_deck_id: string | null
          personal_card_id: string | null
          personal_deck_id: string | null
          prefix: string
          quote: string
          side: Database["public"]["Enums"]["flashcard_side"]
          start_offset: number
          student_id: string
          style: Database["public"]["Enums"]["law_mark_style"]
          suffix: string
          updated_at: string
        }
        Insert: {
          card_kind: Database["public"]["Enums"]["flashcard_card_kind"]
          color: Database["public"]["Enums"]["law_mark_color"]
          created_at?: string
          end_offset: number
          id: string
          lesson_card_id?: string | null
          lesson_id?: string | null
          library_card_id?: string | null
          library_deck_id?: string | null
          personal_card_id?: string | null
          personal_deck_id?: string | null
          prefix?: string
          quote: string
          side: Database["public"]["Enums"]["flashcard_side"]
          start_offset: number
          student_id: string
          style: Database["public"]["Enums"]["law_mark_style"]
          suffix?: string
          updated_at?: string
        }
        Update: {
          card_kind?: Database["public"]["Enums"]["flashcard_card_kind"]
          color?: Database["public"]["Enums"]["law_mark_color"]
          created_at?: string
          end_offset?: number
          id?: string
          lesson_card_id?: string | null
          lesson_id?: string | null
          library_card_id?: string | null
          library_deck_id?: string | null
          personal_card_id?: string | null
          personal_deck_id?: string | null
          prefix?: string
          quote?: string
          side?: Database["public"]["Enums"]["flashcard_side"]
          start_offset?: number
          student_id?: string
          style?: Database["public"]["Enums"]["law_mark_style"]
          suffix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_marks_lesson_card_fk"
            columns: ["lesson_card_id", "lesson_id"]
            isOneToOne: false
            referencedRelation: "theory_lesson_flashcards"
            referencedColumns: ["id", "theory_lesson_id"]
          },
          {
            foreignKeyName: "flashcard_marks_library_card_fk"
            columns: ["library_deck_id", "library_card_id"]
            isOneToOne: false
            referencedRelation: "library_flashcards"
            referencedColumns: ["deck_id", "id"]
          },
          {
            foreignKeyName: "flashcard_marks_personal_card_fk"
            columns: ["personal_card_id", "personal_deck_id", "student_id"]
            isOneToOne: false
            referencedRelation: "personal_flashcards"
            referencedColumns: ["id", "deck_id", "student_id"]
          },
          {
            foreignKeyName: "flashcard_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_reviews: {
        Row: {
          card_id: string
          difficulty: number
          due_at: string
          interval_minutes: number
          lapses: number
          last_grade: string
          last_reviewed_at: string
          review_count: number
          stability: number
          state: string
          step: number
          student_id: string
          theory_lesson_id: string
          updated_at: string
        }
        Insert: {
          card_id: string
          difficulty?: number
          due_at: string
          interval_minutes: number
          lapses?: number
          last_grade: string
          last_reviewed_at?: string
          review_count: number
          stability?: number
          state?: string
          step?: number
          student_id: string
          theory_lesson_id: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          difficulty?: number
          due_at?: string
          interval_minutes?: number
          lapses?: number
          last_grade?: string
          last_reviewed_at?: string
          review_count?: number
          stability?: number
          state?: string
          step?: number
          student_id?: string
          theory_lesson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_reviews_card_id_theory_lesson_id_fkey"
            columns: ["card_id", "theory_lesson_id"]
            isOneToOne: false
            referencedRelation: "theory_lesson_flashcards"
            referencedColumns: ["id", "theory_lesson_id"]
          },
          {
            foreignKeyName: "flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_batches: {
        Row: {
          created_at: string
          id: string
          student_id: string
          study_plan_id: string
          teacher_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id: string
          student_id: string
          study_plan_id: string
          teacher_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          study_plan_id?: string
          teacher_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_batches_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
        ]
      }
      goal_entries: {
        Row: {
          correct_answers: number
          created_at: string
          goal_id: string
          id: string
          manual_lesson: string | null
          minutes: number
          note: string | null
          questions: number
          request_id: string | null
          score: number | null
          student_id: string
          studied_on: string | null
          teacher_id: string
          theory_lesson_id: string | null
          theory_stage: Database["public"]["Enums"]["theory_stage"] | null
          wrong_answers: number | null
        }
        Insert: {
          correct_answers?: number
          created_at?: string
          goal_id: string
          id?: string
          manual_lesson?: string | null
          minutes?: number
          note?: string | null
          questions?: number
          request_id?: string | null
          score?: number | null
          student_id: string
          studied_on?: string | null
          teacher_id: string
          theory_lesson_id?: string | null
          theory_stage?: Database["public"]["Enums"]["theory_stage"] | null
          wrong_answers?: number | null
        }
        Update: {
          correct_answers?: number
          created_at?: string
          goal_id?: string
          id?: string
          manual_lesson?: string | null
          minutes?: number
          note?: string | null
          questions?: number
          request_id?: string | null
          score?: number | null
          student_id?: string
          studied_on?: string | null
          teacher_id?: string
          theory_lesson_id?: string | null
          theory_stage?: Database["public"]["Enums"]["theory_stage"] | null
          wrong_answers?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goal_entries_goal_fk"
            columns: ["goal_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
          {
            foreignKeyName: "goal_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_entries_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_entries_theory_lesson_fk"
            columns: ["theory_lesson_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_lessons"
            referencedColumns: ["id", "teacher_id"]
          },
        ]
      }
      goals: {
        Row: {
          block: string | null
          completed_at: string | null
          correct_answers: number | null
          created_at: string
          day_position: number
          description: string | null
          due_on: string | null
          id: string
          lesson: string | null
          notebook_block_id: string | null
          planned_minutes: number
          questions_answered: number | null
          spent_minutes: number | null
          status: Database["public"]["Enums"]["goal_status"]
          student_id: string
          study_plan_id: string
          subject: string
          teacher_id: string
          title: string
          type: Database["public"]["Enums"]["goal_type"]
          updated_at: string
          week_number: number
          weekday: number
          weekday_name: string
        }
        Insert: {
          block?: string | null
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string
          day_position?: number
          description?: string | null
          due_on?: string | null
          id?: string
          lesson?: string | null
          notebook_block_id?: string | null
          planned_minutes?: number
          questions_answered?: number | null
          spent_minutes?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          student_id: string
          study_plan_id: string
          subject: string
          teacher_id: string
          title: string
          type: Database["public"]["Enums"]["goal_type"]
          updated_at?: string
          week_number?: number
          weekday: number
          weekday_name: string
        }
        Update: {
          block?: string | null
          completed_at?: string | null
          correct_answers?: number | null
          created_at?: string
          day_position?: number
          description?: string | null
          due_on?: string | null
          id?: string
          lesson?: string | null
          notebook_block_id?: string | null
          planned_minutes?: number
          questions_answered?: number | null
          spent_minutes?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          student_id?: string
          study_plan_id?: string
          subject?: string
          teacher_id?: string
          title?: string
          type?: Database["public"]["Enums"]["goal_type"]
          updated_at?: string
          week_number?: number
          weekday?: number
          weekday_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_notebook_block_fk"
            columns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "notebook_block_id",
            ]
            isOneToOne: false
            referencedRelation: "study_plan_notebooks"
            referencedColumns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
            ]
          },
          {
            foreignKeyName: "goals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
          {
            foreignKeyName: "goals_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      law_articles: {
        Row: {
          created_at: string
          id: string
          label: string
          law_id: string
          paragraphs: string[]
          position: number
          retired_at: string | null
          section: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          label: string
          law_id: string
          paragraphs: string[]
          position: number
          retired_at?: string | null
          section: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          law_id?: string
          paragraphs?: string[]
          position?: number
          retired_at?: string | null
          section?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_articles_law_id_fkey"
            columns: ["law_id"]
            isOneToOne: false
            referencedRelation: "laws"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "law_articles_law_id_fkey"
            columns: ["law_id"]
            isOneToOne: false
            referencedRelation: "vw_law_library"
            referencedColumns: ["law_id"]
          },
        ]
      }
      law_marks: {
        Row: {
          article_id: string
          color: Database["public"]["Enums"]["law_mark_color"]
          created_at: string
          end_offset: number
          id: string
          law_id: string
          paragraph_index: number
          prefix: string
          quote: string
          start_offset: number
          student_id: string
          style: Database["public"]["Enums"]["law_mark_style"]
          suffix: string
          updated_at: string
        }
        Insert: {
          article_id: string
          color: Database["public"]["Enums"]["law_mark_color"]
          created_at?: string
          end_offset: number
          id: string
          law_id: string
          paragraph_index: number
          prefix?: string
          quote: string
          start_offset: number
          student_id: string
          style: Database["public"]["Enums"]["law_mark_style"]
          suffix?: string
          updated_at?: string
        }
        Update: {
          article_id?: string
          color?: Database["public"]["Enums"]["law_mark_color"]
          created_at?: string
          end_offset?: number
          id?: string
          law_id?: string
          paragraph_index?: number
          prefix?: string
          quote?: string
          start_offset?: number
          student_id?: string
          style?: Database["public"]["Enums"]["law_mark_style"]
          suffix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "law_marks_law_id_article_id_fkey"
            columns: ["law_id", "article_id"]
            isOneToOne: false
            referencedRelation: "law_articles"
            referencedColumns: ["law_id", "id"]
          },
          {
            foreignKeyName: "law_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      law_subjects: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          position: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      laws: {
        Row: {
          created_at: string
          id: string
          norm_id: string
          norm_label: string
          official_url: string
          position: number
          source_date: string | null
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          norm_id: string
          norm_label: string
          official_url: string
          position: number
          source_date?: string | null
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          norm_id?: string
          norm_label?: string
          official_url?: string
          position?: number
          source_date?: string | null
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "laws_norm_id_fkey"
            columns: ["norm_id"]
            isOneToOne: true
            referencedRelation: "legal_norms"
            referencedColumns: ["canonical_id"]
          },
          {
            foreignKeyName: "laws_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "law_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_norms: {
        Row: {
          canonical_id: string
          created_at: string
          sphere: Database["public"]["Enums"]["legal_norm_sphere"] | null
          title: string
          updated_at: string
          verification_status:
            | Database["public"]["Enums"]["legal_norm_verification"]
            | null
        }
        Insert: {
          canonical_id: string
          created_at?: string
          sphere?: Database["public"]["Enums"]["legal_norm_sphere"] | null
          title: string
          updated_at?: string
          verification_status?:
            | Database["public"]["Enums"]["legal_norm_verification"]
            | null
        }
        Update: {
          canonical_id?: string
          created_at?: string
          sphere?: Database["public"]["Enums"]["legal_norm_sphere"] | null
          title?: string
          updated_at?: string
          verification_status?:
            | Database["public"]["Enums"]["legal_norm_verification"]
            | null
        }
        Relationships: []
      }
      library_flashcard_aliases: {
        Row: {
          card_id: string
          created_at: string
          deck_id: string
          old_card_id: string
          old_deck_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          deck_id: string
          old_card_id: string
          old_deck_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          deck_id?: string
          old_card_id?: string
          old_deck_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_flashcard_aliases_deck_id_card_id_fkey"
            columns: ["deck_id", "card_id"]
            isOneToOne: false
            referencedRelation: "library_flashcards"
            referencedColumns: ["deck_id", "id"]
          },
          {
            foreignKeyName: "library_flashcard_aliases_old_deck_id_old_card_id_fkey"
            columns: ["old_deck_id", "old_card_id"]
            isOneToOne: true
            referencedRelation: "library_flashcards"
            referencedColumns: ["deck_id", "id"]
          },
        ]
      }
      library_flashcard_decks: {
        Row: {
          created_at: string
          historical: boolean
          id: string
          number: string | null
          position: number | null
          subject_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          historical?: boolean
          id: string
          number?: string | null
          position?: number | null
          subject_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          historical?: boolean
          id?: string
          number?: string | null
          position?: number | null
          subject_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_flashcard_decks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      library_flashcard_origins: {
        Row: {
          id: string
        }
        Insert: {
          id: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
      library_flashcard_reviews: {
        Row: {
          card_id: string
          deck_id: string
          difficulty: number
          due_at: string
          interval_minutes: number
          lapses: number
          last_grade: string
          last_reviewed_at: string
          review_count: number
          stability: number
          state: string
          step: number
          student_id: string
          updated_at: string
        }
        Insert: {
          card_id: string
          deck_id: string
          difficulty?: number
          due_at: string
          interval_minutes: number
          lapses?: number
          last_grade: string
          last_reviewed_at?: string
          review_count: number
          stability?: number
          state?: string
          step?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          deck_id?: string
          difficulty?: number
          due_at?: string
          interval_minutes?: number
          lapses?: number
          last_grade?: string
          last_reviewed_at?: string
          review_count?: number
          stability?: number
          state?: string
          step?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_flashcard_reviews_card_fk"
            columns: ["deck_id", "card_id"]
            isOneToOne: false
            referencedRelation: "library_flashcards"
            referencedColumns: ["deck_id", "id"]
          },
          {
            foreignKeyName: "library_flashcard_reviews_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_flashcard_reviews_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "vw_library_flashcard_decks"
            referencedColumns: ["deck_id"]
          },
          {
            foreignKeyName: "library_flashcard_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_flashcard_statuses: {
        Row: {
          editorial_notice:
            | Database["public"]["Enums"]["library_flashcard_notice"]
            | null
          id: string
        }
        Insert: {
          editorial_notice?:
            | Database["public"]["Enums"]["library_flashcard_notice"]
            | null
          id: string
        }
        Update: {
          editorial_notice?:
            | Database["public"]["Enums"]["library_flashcard_notice"]
            | null
          id?: string
        }
        Relationships: []
      }
      library_flashcard_subjects: {
        Row: {
          audit_label: string
          audit_partial: boolean
          created_at: string
          id: string
          name: string
          position: number
          source_file: string
          updated_at: string
        }
        Insert: {
          audit_label: string
          audit_partial?: boolean
          created_at?: string
          id: string
          name: string
          position: number
          source_file: string
          updated_at?: string
        }
        Update: {
          audit_label?: string
          audit_partial?: boolean
          created_at?: string
          id?: string
          name?: string
          position?: number
          source_file?: string
          updated_at?: string
        }
        Relationships: []
      }
      library_flashcards: {
        Row: {
          back: string
          created_at: string
          deck_id: string
          front: string
          id: string
          origin_id: string
          position: number
          retired_at: string | null
          source_number: string | null
          status_id: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          back: string
          created_at?: string
          deck_id: string
          front: string
          id: string
          origin_id: string
          position: number
          retired_at?: string | null
          source_number?: string | null
          status_id?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          back?: string
          created_at?: string
          deck_id?: string
          front?: string
          id?: string
          origin_id?: string
          position?: number
          retired_at?: string | null
          source_number?: string | null
          status_id?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_decks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "vw_library_flashcard_decks"
            referencedColumns: ["deck_id"]
          },
          {
            foreignKeyName: "library_flashcards_origin_id_fkey"
            columns: ["origin_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_origins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_flashcards_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exam_results: {
        Row: {
          exam_id: string
          score: number | null
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          exam_id: string
          score?: number | null
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          exam_id?: string
          score?: number | null
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_exam_results_exam_id_teacher_id_fkey"
            columns: ["exam_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "mock_exams"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "mock_exam_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exam_subject_results: {
        Row: {
          correct_answers: number
          exam_id: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Insert: {
          correct_answers: number
          exam_id: string
          student_id: string
          subject: string
          teacher_id: string
        }
        Update: {
          correct_answers?: number
          exam_id?: string
          student_id?: string
          subject?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_exam_subject_results_exam_id_teacher_id_subject_fkey"
            columns: ["exam_id", "teacher_id", "subject"]
            isOneToOne: false
            referencedRelation: "mock_exam_subjects"
            referencedColumns: ["exam_id", "teacher_id", "subject"]
          },
          {
            foreignKeyName: "mock_exam_subject_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_exam_subjects: {
        Row: {
          exam_id: string
          question_count: number
          subject: string
          teacher_id: string
        }
        Insert: {
          exam_id: string
          question_count: number
          subject: string
          teacher_id: string
        }
        Update: {
          exam_id?: string
          question_count?: number
          subject?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_exam_subjects_exam_id_teacher_id_fkey"
            columns: ["exam_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "mock_exams"
            referencedColumns: ["id", "teacher_id"]
          },
        ]
      }
      mock_exams: {
        Row: {
          class_id: string
          created_at: string
          exam_date: string
          id: string
          max_score: number
          published: boolean
          teacher_id: string
          title: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          exam_date: string
          id: string
          max_score: number
          published?: boolean
          teacher_id: string
          title: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          exam_date?: string
          id?: string
          max_score?: number
          published?: boolean
          teacher_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mock_exams_class_id_teacher_id_fkey"
            columns: ["class_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "mock_exams_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_flashcard_decks: {
        Row: {
          created_at: string
          id: string
          student_id: string
          subject: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          student_id: string
          subject: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          student_id?: string
          subject?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_flashcard_decks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_flashcard_reviews: {
        Row: {
          card_id: string
          deck_id: string
          difficulty: number
          due_at: string
          interval_minutes: number
          lapses: number
          last_grade: string
          last_reviewed_at: string
          review_count: number
          stability: number
          state: string
          step: number
          student_id: string
          updated_at: string
        }
        Insert: {
          card_id: string
          deck_id: string
          difficulty?: number
          due_at: string
          interval_minutes: number
          lapses?: number
          last_grade: string
          last_reviewed_at?: string
          review_count: number
          stability?: number
          state?: string
          step?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          deck_id?: string
          difficulty?: number
          due_at?: string
          interval_minutes?: number
          lapses?: number
          last_grade?: string
          last_reviewed_at?: string
          review_count?: number
          stability?: number
          state?: string
          step?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_flashcard_reviews_card_id_deck_id_student_id_fkey"
            columns: ["card_id", "deck_id", "student_id"]
            isOneToOne: false
            referencedRelation: "personal_flashcards"
            referencedColumns: ["id", "deck_id", "student_id"]
          },
        ]
      }
      personal_flashcards: {
        Row: {
          back: string
          created_at: string
          deck_id: string
          front: string
          id: string
          student_id: string
          topic: string
          updated_at: string
        }
        Insert: {
          back: string
          created_at?: string
          deck_id: string
          front: string
          id: string
          student_id: string
          topic?: string
          updated_at?: string
        }
        Update: {
          back?: string
          created_at?: string
          deck_id?: string
          front?: string
          id?: string
          student_id?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_flashcards_deck_id_student_id_fkey"
            columns: ["deck_id", "student_id"]
            isOneToOne: false
            referencedRelation: "personal_flashcard_decks"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      profiles: {
        Row: {
          access_expires_at: string | null
          access_origin: string | null
          access_status: Database["public"]["Enums"]["access_status"]
          coupon_used: string | null
          created_at: string
          id: string
          name: string | null
          plan: string | null
          role: Database["public"]["Enums"]["user_role"]
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          access_origin?: string | null
          access_status?: Database["public"]["Enums"]["access_status"]
          coupon_used?: string | null
          created_at?: string
          id: string
          name?: string | null
          plan?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          access_origin?: string | null
          access_status?: Database["public"]["Enums"]["access_status"]
          coupon_used?: string | null
          created_at?: string
          id?: string
          name?: string | null
          plan?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_session_questions: {
        Row: {
          answered_at: string
          block_id: string
          created_at: string
          execution_order: number
          id: string
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          quiz_session_id: string
          round: number
          source_question_id: number | null
          student_id: string
          study_plan_id: string
          teacher_id: string
        }
        Insert: {
          answered_at?: string
          block_id: string
          created_at?: string
          execution_order: number
          id?: string
          outcome: Database["public"]["Enums"]["question_outcome"]
          phase: Database["public"]["Enums"]["question_phase"]
          question_id: number
          quiz_session_id: string
          round?: number
          source_question_id?: number | null
          student_id: string
          study_plan_id: string
          teacher_id: string
        }
        Update: {
          answered_at?: string
          block_id?: string
          created_at?: string
          execution_order?: number
          id?: string
          outcome?: Database["public"]["Enums"]["question_outcome"]
          phase?: Database["public"]["Enums"]["question_phase"]
          question_id?: number
          quiz_session_id?: string
          round?: number
          source_question_id?: number | null
          student_id?: string
          study_plan_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_session_questions_session_fk"
            columns: [
              "quiz_session_id",
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
            ]
            isOneToOne: false
            referencedRelation: "quiz_sessions"
            referencedColumns: [
              "id",
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
            ]
          },
          {
            foreignKeyName: "quiz_session_questions_session_fk"
            columns: [
              "quiz_session_id",
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
            ]
            isOneToOne: false
            referencedRelation: "vw_quiz_session_performance"
            referencedColumns: [
              "quiz_session_id",
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
            ]
          },
          {
            foreignKeyName: "quiz_session_questions_source_fk"
            columns: ["quiz_session_id", "source_question_id"]
            isOneToOne: false
            referencedRelation: "quiz_session_questions"
            referencedColumns: ["quiz_session_id", "question_id"]
          },
        ]
      }
      quiz_sessions: {
        Row: {
          block_id: string
          cancelled_at: string | null
          catalog_key: string
          completed_at: string | null
          created_at: string
          duration_minutes: number | null
          execution_order: number
          finish_payload: Json | null
          finish_request_id: string | null
          finished_at: string | null
          goal_id: string | null
          id: string
          main_target: number
          origin: Database["public"]["Enums"]["quiz_session_origin"]
          origin_goal_id: string | null
          session_number: number | null
          started_at: string
          status: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          subject_key: string
          teacher_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          block_id: string
          cancelled_at?: string | null
          catalog_key: string
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          execution_order: number
          finish_payload?: Json | null
          finish_request_id?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          main_target?: number
          origin?: Database["public"]["Enums"]["quiz_session_origin"]
          origin_goal_id?: string | null
          session_number?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          student_id: string
          study_plan_id: string
          subject_key: string
          teacher_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          block_id?: string
          cancelled_at?: string | null
          catalog_key?: string
          completed_at?: string | null
          created_at?: string
          duration_minutes?: number | null
          execution_order?: number
          finish_payload?: Json | null
          finish_request_id?: string | null
          finished_at?: string | null
          goal_id?: string | null
          id?: string
          main_target?: number
          origin?: Database["public"]["Enums"]["quiz_session_origin"]
          origin_goal_id?: string | null
          session_number?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["quiz_session_status"]
          student_id?: string
          study_plan_id?: string
          subject_key?: string
          teacher_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_notebook_fk"
            columns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
              "subject_key",
              "catalog_key",
            ]
            isOneToOne: false
            referencedRelation: "study_plan_notebooks"
            referencedColumns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
              "subject_key",
              "catalog_key",
            ]
          },
          {
            foreignKeyName: "quiz_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
          {
            foreignKeyName: "quiz_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      reinforcement_cycles: {
        Row: {
          block_id: string
          catalog_key: string
          completed_at: string
          created_at: string
          cutoff: string
          cycle_key: string
          id: string
          main_questions: number
          reinforcement_result: Json
          request_id: string
          source_errors: number
          source_score: number
          source_session_ids: string[]
          student_id: string
          study_plan_id: string
          subject_key: string
          teacher_id: string
          unique_questions: number
        }
        Insert: {
          block_id: string
          catalog_key: string
          completed_at?: string
          created_at?: string
          cutoff: string
          cycle_key: string
          id?: string
          main_questions: number
          reinforcement_result: Json
          request_id: string
          source_errors: number
          source_score: number
          source_session_ids: string[]
          student_id: string
          study_plan_id: string
          subject_key: string
          teacher_id: string
          unique_questions: number
        }
        Update: {
          block_id?: string
          catalog_key?: string
          completed_at?: string
          created_at?: string
          cutoff?: string
          cycle_key?: string
          id?: string
          main_questions?: number
          reinforcement_result?: Json
          request_id?: string
          source_errors?: number
          source_score?: number
          source_session_ids?: string[]
          student_id?: string
          study_plan_id?: string
          subject_key?: string
          teacher_id?: string
          unique_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "reinforcement_cycles_notebook_fk"
            columns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
              "subject_key",
              "catalog_key",
            ]
            isOneToOne: false
            referencedRelation: "study_plan_notebooks"
            referencedColumns: [
              "teacher_id",
              "student_id",
              "study_plan_id",
              "block_id",
              "subject_key",
              "catalog_key",
            ]
          },
          {
            foreignKeyName: "reinforcement_cycles_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
        ]
      }
      study_plan_notebooks: {
        Row: {
          active: boolean
          block_id: string
          catalog_key: string | null
          created_at: string
          deleted: boolean
          id: string
          notebook_key: string
          notebook_link: string
          notebook_name: string
          notebook_position: number
          student_id: string
          study_plan_id: string
          subject_color: string
          subject_key: string
          subject_name: string
          subject_position: number
          subject_target: number
          teacher_id: string
          total_questions: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          block_id?: string
          catalog_key?: string | null
          created_at?: string
          deleted?: boolean
          id?: string
          notebook_key: string
          notebook_link?: string
          notebook_name: string
          notebook_position?: number
          student_id: string
          study_plan_id: string
          subject_color?: string
          subject_key: string
          subject_name: string
          subject_position?: number
          subject_target?: number
          teacher_id: string
          total_questions?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          block_id?: string
          catalog_key?: string | null
          created_at?: string
          deleted?: boolean
          id?: string
          notebook_key?: string
          notebook_link?: string
          notebook_name?: string
          notebook_position?: number
          student_id?: string
          study_plan_id?: string
          subject_color?: string
          subject_key?: string
          subject_name?: string
          subject_position?: number
          subject_target?: number
          teacher_id?: string
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_notebooks_catalog_key_fkey"
            columns: ["catalog_key"]
            isOneToOne: false
            referencedRelation: "catalog_blocks"
            referencedColumns: ["catalog_key"]
          },
          {
            foreignKeyName: "study_plan_notebooks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_notebooks_study_plan_id_fkey"
            columns: ["study_plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_notebooks_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plan_theory_catalogs: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          student_id: string
          study_plan_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          student_id?: string
          study_plan_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_plan_theory_catalogs_catalog_fk"
            columns: ["catalog_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_catalogs"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "study_plan_theory_catalogs_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_plan_theory_catalogs_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
          {
            foreignKeyName: "study_plan_theory_catalogs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_plans: {
        Row: {
          area: string
          class_id: string | null
          created_at: string
          exam_date: string | null
          id: string
          name: string
          stage: string
          starts_on: string
          status: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model: string
          target_exam: string | null
          teacher_id: string
          updated_at: string
          weekly_goals: number
        }
        Insert: {
          area?: string
          class_id?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          name: string
          stage?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model?: string
          target_exam?: string | null
          teacher_id: string
          updated_at?: string
          weekly_goals?: number
        }
        Update: {
          area?: string
          class_id?: string | null
          created_at?: string
          exam_date?: string | null
          id?: string
          name?: string
          stage?: string
          starts_on?: string
          status?: Database["public"]["Enums"]["study_plan_status"]
          student_id?: string
          study_model?: string
          target_exam?: string | null
          teacher_id?: string
          updated_at?: string
          weekly_goals?: number
        }
        Relationships: [
          {
            foreignKeyName: "study_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
      subject_blocks: {
        Row: {
          created_at: string
          id: string
          link: string | null
          name: string
          position: number | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          name: string
          position?: number | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          name?: string
          position?: number | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_blocks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_lessons: {
        Row: {
          created_at: string
          id: string
          link: string | null
          name: string
          position: number | null
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          name: string
          position?: number | null
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          name?: string
          position?: number | null
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_lessons_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          id: string
          name: string
          target_score: number
          teacher_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          name: string
          target_score?: number
          teacher_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          target_score?: number
          teacher_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_catalog_subject_rules: {
        Row: {
          active: boolean
          catalog_id: string
          created_at: string
          id: string
          initial_questions: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_id: string
          created_at?: string
          id?: string
          initial_questions?: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_id?: string
          created_at?: string
          id?: string
          initial_questions?: number
          subject?: string
          subject_key?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_catalog_subject_rules_catalog_fk"
            columns: ["catalog_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_catalogs"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "theory_catalog_subject_rules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_catalogs: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          key: string
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key: string
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_catalogs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_lesson_flashcards: {
        Row: {
          back: string
          created_at: string
          deleted: boolean
          front: string
          id: string
          position: number
          teacher_id: string
          theory_lesson_id: string
          topic: string
          updated_at: string
        }
        Insert: {
          back: string
          created_at?: string
          deleted?: boolean
          front: string
          id: string
          position: number
          teacher_id: string
          theory_lesson_id: string
          topic?: string
          updated_at?: string
        }
        Update: {
          back?: string
          created_at?: string
          deleted?: boolean
          front?: string
          id?: string
          position?: number
          teacher_id?: string
          theory_lesson_id?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_lesson_flashcards_theory_lesson_id_teacher_id_fkey"
            columns: ["theory_lesson_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_lessons"
            referencedColumns: ["id", "teacher_id"]
          },
        ]
      }
      theory_lessons: {
        Row: {
          active: boolean
          catalog_id: string | null
          created_at: string
          final_questions_start: number | null
          flash_summary_url: string | null
          flashcards_url: string | null
          has_theory: boolean
          id: string
          lesson_code: string
          material_blocks: Json
          note: string | null
          pdf_file: string
          pdf_total_pages: number | null
          pdf_url: string | null
          position: number
          published: boolean
          qc_questions_url: string | null
          subject: string
          subject_key: string
          teacher_id: string
          tec_notebooks: Json
          tec_questions_url: string | null
          theory_end_page: number | null
          theory_start_page: number | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_id?: string | null
          created_at?: string
          final_questions_start?: number | null
          flash_summary_url?: string | null
          flashcards_url?: string | null
          has_theory?: boolean
          id?: string
          lesson_code: string
          material_blocks?: Json
          note?: string | null
          pdf_file: string
          pdf_total_pages?: number | null
          pdf_url?: string | null
          position?: number
          published?: boolean
          qc_questions_url?: string | null
          subject: string
          subject_key: string
          teacher_id: string
          tec_notebooks?: Json
          tec_questions_url?: string | null
          theory_end_page?: number | null
          theory_start_page?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_id?: string | null
          created_at?: string
          final_questions_start?: number | null
          flash_summary_url?: string | null
          flashcards_url?: string | null
          has_theory?: boolean
          id?: string
          lesson_code?: string
          material_blocks?: Json
          note?: string | null
          pdf_file?: string
          pdf_total_pages?: number | null
          pdf_url?: string | null
          position?: number
          published?: boolean
          qc_questions_url?: string | null
          subject?: string
          subject_key?: string
          teacher_id?: string
          tec_notebooks?: Json
          tec_questions_url?: string | null
          theory_end_page?: number | null
          theory_start_page?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_lessons_catalog_fk"
            columns: ["catalog_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_catalogs"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "theory_lessons_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_progress: {
        Row: {
          created_at: string
          current_page: number
          id: string
          initial_questions_complete: boolean
          initial_questions_complete_at: string | null
          initial_questions_done: number
          lesson_done: boolean
          lesson_done_at: string | null
          student_id: string
          study_plan_id: string
          theory_done: boolean
          theory_done_at: string | null
          theory_lesson_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_page?: number
          id?: string
          initial_questions_complete?: boolean
          initial_questions_complete_at?: string | null
          initial_questions_done?: number
          lesson_done?: boolean
          lesson_done_at?: string | null
          student_id: string
          study_plan_id: string
          theory_done?: boolean
          theory_done_at?: string | null
          theory_lesson_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_page?: number
          id?: string
          initial_questions_complete?: boolean
          initial_questions_complete_at?: string | null
          initial_questions_done?: number
          lesson_done?: boolean
          lesson_done_at?: string | null
          student_id?: string
          study_plan_id?: string
          theory_done?: boolean
          theory_done_at?: string | null
          theory_lesson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theory_progress_study_plan_fk"
            columns: ["study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "theory_progress_theory_lesson_id_fkey"
            columns: ["theory_lesson_id"]
            isOneToOne: false
            referencedRelation: "theory_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_review_entries: {
        Row: {
          correct_answers: number
          created_at: string
          id: string
          questions: number
          request_id: string
          student_id: string
          theory_review_id: string
        }
        Insert: {
          correct_answers: number
          created_at?: string
          id?: string
          questions: number
          request_id: string
          student_id: string
          theory_review_id: string
        }
        Update: {
          correct_answers?: number
          created_at?: string
          id?: string
          questions?: number
          request_id?: string
          student_id?: string
          theory_review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_review_entries_review_fk"
            columns: ["theory_review_id", "student_id"]
            isOneToOne: false
            referencedRelation: "theory_reviews"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      theory_review_rules: {
        Row: {
          active: boolean
          catalog_id: string
          created_at: string
          id: string
          lesson_spacing: number
          minimum_questions: number
          review_number: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          catalog_id: string
          created_at?: string
          id?: string
          lesson_spacing: number
          minimum_questions?: number
          review_number: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          catalog_id?: string
          created_at?: string
          id?: string
          lesson_spacing?: number
          minimum_questions?: number
          review_number?: number
          subject?: string
          subject_key?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_review_rules_catalog_fk"
            columns: ["catalog_id", "teacher_id"]
            isOneToOne: false
            referencedRelation: "theory_catalogs"
            referencedColumns: ["id", "teacher_id"]
          },
          {
            foreignKeyName: "theory_review_rules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_reviews: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          minimum_questions: number
          questions_answered: number
          review_number: number
          started_at: string | null
          status: Database["public"]["Enums"]["theory_review_status"]
          student_id: string
          study_plan_id: string
          theory_lesson_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          minimum_questions?: number
          questions_answered?: number
          review_number: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["theory_review_status"]
          student_id: string
          study_plan_id: string
          theory_lesson_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          minimum_questions?: number
          questions_answered?: number
          review_number?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["theory_review_status"]
          student_id?: string
          study_plan_id?: string
          theory_lesson_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_reviews_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theory_reviews_study_plan_fk"
            columns: ["study_plan_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "student_id"]
          },
          {
            foreignKeyName: "theory_reviews_theory_lesson_id_fkey"
            columns: ["theory_lesson_id"]
            isOneToOne: false
            referencedRelation: "theory_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      theory_subject_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          initial_questions: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          initial_questions?: number
          subject: string
          subject_key: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          initial_questions?: number
          subject?: string
          subject_key?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "theory_subject_rules_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
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
          interest_area: string
          name: string
          status: Database["public"]["Enums"]["waitlist_status"]
          student_id: string
          target_exam: string
          teacher_id: string | null
          timezone: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email: string
          interest_area: string
          name: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          student_id: string
          target_exam: string
          teacher_id?: string | null
          timezone?: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string
          interest_area?: string
          name?: string
          status?: Database["public"]["Enums"]["waitlist_status"]
          student_id?: string
          target_exam?: string
          teacher_id?: string | null
          timezone?: string
          updated_at?: string
          whatsapp?: string
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
      vw_law_library: {
        Row: {
          article_count: number | null
          law_id: string | null
          norm_id: string | null
          norm_label: string | null
          official_url: string | null
          position: number | null
          source_date: string | null
          subject_id: string | null
          title: string | null
        }
        Insert: {
          article_count?: never
          law_id?: string | null
          norm_id?: string | null
          norm_label?: string | null
          official_url?: string | null
          position?: number | null
          source_date?: string | null
          subject_id?: string | null
          title?: string | null
        }
        Update: {
          article_count?: never
          law_id?: string | null
          norm_id?: string | null
          norm_label?: string | null
          official_url?: string | null
          position?: number | null
          source_date?: string | null
          subject_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "laws_norm_id_fkey"
            columns: ["norm_id"]
            isOneToOne: true
            referencedRelation: "legal_norms"
            referencedColumns: ["canonical_id"]
          },
          {
            foreignKeyName: "laws_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "law_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_library_flashcard_decks: {
        Row: {
          active_cards: number | null
          card_ids: string[] | null
          deck_id: string | null
          historical: boolean | null
          number: string | null
          position: number | null
          subject_id: string | null
          title: string | null
          topics: string[] | null
        }
        Insert: {
          active_cards?: never
          card_ids?: never
          deck_id?: string | null
          historical?: boolean | null
          number?: string | null
          position?: number | null
          subject_id?: string | null
          title?: string | null
          topics?: never
        }
        Update: {
          active_cards?: never
          card_ids?: never
          deck_id?: string | null
          historical?: boolean | null
          number?: string | null
          position?: number | null
          subject_id?: string | null
          title?: string | null
          topics?: never
        }
        Relationships: [
          {
            foreignKeyName: "library_flashcard_decks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "library_flashcard_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_quiz_session_performance: {
        Row: {
          block_id: string | null
          extra_correct: number | null
          extra_incorrect: number | null
          extra_total: number | null
          main_correct: number | null
          main_incorrect: number | null
          main_target: number | null
          main_total: number | null
          quiz_session_id: string | null
          reinforcement_correct: number | null
          reinforcement_incorrect: number | null
          reinforcement_total: number | null
          status: Database["public"]["Enums"]["quiz_session_status"] | null
          student_id: string | null
          study_plan_id: string | null
          teacher_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_sessions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_sessions_study_plan_fk"
            columns: ["study_plan_id", "teacher_id", "student_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id", "teacher_id", "student_id"]
          },
          {
            foreignKeyName: "quiz_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_study_plan: {
        Args: { p_study_plan_id: string }
        Returns: {
          area: string
          class_id: string | null
          created_at: string
          exam_date: string | null
          id: string
          name: string
          stage: string
          starts_on: string
          status: Database["public"]["Enums"]["study_plan_status"]
          student_id: string
          study_model: string
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
      can_access_teacher: { Args: { p_teacher: string }; Returns: boolean }
      clear_pending_goals: {
        Args: { p_study_plan_id: string; p_week_number: number }
        Returns: number
      }
      find_student_by_email: {
        Args: { p_email: string }
        Returns: {
          has_teacher: boolean
          is_mine: boolean
          name: string
          student_id: string
        }[]
      }
      generate_week: {
        Args: {
          p_goals: Json
          p_request_id: string
          p_study_plan_id: string
          p_week_number: number
        }
        Returns: boolean
      }
      has_active_access: { Args: never; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      is_teacher_of: { Args: { p_student: string }; Returns: boolean }
      link_student: { Args: { p_student_id: string }; Returns: undefined }
      mock_exam_scoreboard: {
        Args: { p_exam_id: string }
        Returns: {
          is_self: boolean
          participant: number
          score: number
          subject: string
        }[]
      }
      my_teacher: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      record_extra_study: {
        Args: {
          p_correct_answers: number
          p_date: string
          p_kind: string
          p_minutes: number
          p_note?: string
          p_questions: number
          p_request_id: string
          p_study_plan_id: string
          p_subject: string
        }
        Returns: string
      }
      record_goal_entry: {
        Args: {
          p_correct_answers: number
          p_goal_id: string
          p_manual_lesson?: string
          p_minutes: number
          p_note?: string
          p_questions: number
          p_request_id: string
          p_theory_stage?: Database["public"]["Enums"]["theory_stage"]
        }
        Returns: string
      }
      record_initial_questions: {
        Args: {
          p_correct_answers: number
          p_goal_id: string
          p_lesson_id: string
          p_questions: number
          p_request_id: string
        }
        Returns: {
          current_page: number
          initial_questions_done: number
          initial_questions_required: number
          lesson_done: boolean
          theory_done: boolean
        }[]
      }
      record_review_questions: {
        Args: {
          p_correct_answers: number
          p_questions: number
          p_request_id: string
          p_review_id: string
        }
        Returns: {
          questions_answered: number
          status: Database["public"]["Enums"]["theory_review_status"]
          study_plan_id: string
        }[]
      }
      set_student_access: {
        Args: {
          p_action: Database["public"]["Enums"]["access_grant_action"]
          p_months: number
          p_request_id: string
          p_student_id: string
        }
        Returns: {
          access_expires_at: string
          access_status: Database["public"]["Enums"]["access_status"]
        }[]
      }
      student_question_comparison: {
        Args: { p_year: number }
        Returns: {
          box_max: number
          box_min: number
          lower_whisker: number
          median: number
          minimum_questions: number
          percentile: number
          q1: number
          q3: number
          sample_size: number
          student_questions: number
          student_score: number
          upper_whisker: number
        }[]
      }
      student_subject_peer_comparison: {
        Args: { p_year: number }
        Returns: {
          minimum_questions: number
          peer_average: number
          sample_size: number
          student_score: number
          subject: string
        }[]
      }
      student_weekly_question_comparison: {
        Args: { p_year: number }
        Returns: {
          box_max: number
          box_min: number
          lower_whisker: number
          median: number
          minimum_questions: number
          percentile: number
          q1: number
          q3: number
          sample_size: number
          student_questions: number
          student_score: number
          upper_whisker: number
          week_number: number
        }[]
      }
      week_replacement_preview: {
        Args: { p_study_plan_id: string; p_week_number: number }
        Returns: {
          goals_preserved: number
          goals_total: number
        }[]
      }
    }
    Enums: {
      access_grant_action: "grant" | "suspend"
      access_status: "pending" | "active" | "suspended" | "expired"
      flashcard_card_kind: "library" | "lesson" | "personal"
      flashcard_side: "front" | "back"
      goal_status: "pending" | "in_progress" | "completed" | "skipped"
      goal_type:
        | "theory"
        | "question_block"
        | "review"
        | "reinforcement"
        | "mock_exam"
        | "extra"
      law_mark_color:
        | "yellow"
        | "mint"
        | "blue"
        | "pink"
        | "lilac"
        | "peach"
        | "salmon"
      law_mark_style: "highlight" | "underline" | "strike" | "outline"
      legal_norm_sphere: "constitutional" | "federal" | "state"
      legal_norm_verification: "pending_official_source"
      library_flashcard_notice:
        | "revoked"
        | "pending_check"
        | "future_effect"
        | "version_caveat"
      question_outcome: "correct" | "incorrect"
      question_phase: "main" | "reinforcement" | "extra"
      quiz_session_origin: "goal" | "error_notebook"
      quiz_session_status:
        | "in_progress"
        | "awaiting_time"
        | "completed"
        | "cancelled"
        | "voided"
      study_plan_status: "active" | "paused" | "completed" | "archived"
      theory_review_status: "pending" | "in_progress" | "completed"
      theory_stage:
        | "reading"
        | "pdf_done"
        | "questions_in_progress"
        | "questions_done"
      user_role: "teacher" | "student"
      waitlist_status: "waiting" | "released" | "declined"
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
      access_grant_action: ["grant", "suspend"],
      access_status: ["pending", "active", "suspended", "expired"],
      flashcard_card_kind: ["library", "lesson", "personal"],
      flashcard_side: ["front", "back"],
      goal_status: ["pending", "in_progress", "completed", "skipped"],
      goal_type: [
        "theory",
        "question_block",
        "review",
        "reinforcement",
        "mock_exam",
        "extra",
      ],
      law_mark_color: [
        "yellow",
        "mint",
        "blue",
        "pink",
        "lilac",
        "peach",
        "salmon",
      ],
      law_mark_style: ["highlight", "underline", "strike", "outline"],
      legal_norm_sphere: ["constitutional", "federal", "state"],
      legal_norm_verification: ["pending_official_source"],
      library_flashcard_notice: [
        "revoked",
        "pending_check",
        "future_effect",
        "version_caveat",
      ],
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
      study_plan_status: ["active", "paused", "completed", "archived"],
      theory_review_status: ["pending", "in_progress", "completed"],
      theory_stage: [
        "reading",
        "pdf_done",
        "questions_in_progress",
        "questions_done",
      ],
      user_role: ["teacher", "student"],
      waitlist_status: ["waiting", "released", "declined"],
    },
  },
} as const

