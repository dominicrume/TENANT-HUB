export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          blockchain_hash: string
          created_at: string | null
          entry_method: string | null
          id: string
          prev_hash: string
          record_id: string | null
          record_snapshot: Json | null
          table_name: string
          tenant_id: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          blockchain_hash: string
          created_at?: string | null
          entry_method?: string | null
          id?: string
          prev_hash: string
          record_id?: string | null
          record_snapshot?: Json | null
          table_name: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          blockchain_hash?: string
          created_at?: string | null
          entry_method?: string | null
          id?: string
          prev_hash?: string
          record_id?: string | null
          record_snapshot?: Json | null
          table_name?: string
          tenant_id?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          channel: string
          content: string
          id: string
          message_type: string
          org_id: string
          sent_at: string
          sent_by: string
          tenant_id: string | null
        }
        Insert: {
          channel: string
          content: string
          id?: string
          message_type: string
          org_id: string
          sent_at?: string
          sent_by: string
          tenant_id?: string | null
        }
        Update: {
          channel?: string
          content?: string
          id?: string
          message_type?: string
          org_id?: string
          sent_at?: string
          sent_by?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      communications_log: {
        Row: {
          body: string
          created_at: string
          id: string
          org_id: string
          recipient: string
          sent_at: string | null
          status: string
          subject: string | null
          tenant_id: string | null
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          org_id: string
          recipient: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
          type: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          recipient?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "communications_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          canonical_hash: string | null
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          machine_state: Json
          step: number
          updated_at: string | null
        }
        Insert: {
          canonical_hash?: string | null
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          machine_state: Json
          step?: number
          updated_at?: string | null
        }
        Update: {
          canonical_hash?: string | null
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          machine_state?: Json
          step?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string
          id: string
          key: string
          name: string
          org_id: string
          schema: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          name: string
          org_id: string
          schema?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          name?: string
          org_id?: string
          schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          incident_date: string
          incident_type: string
          org_id: string
          reported_by: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          incident_date?: string
          incident_type: string
          org_id: string
          reported_by: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          incident_date?: string
          incident_type?: string
          org_id?: string
          reported_by?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "incident_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intake_checklists: {
        Row: {
          confidentiality_form: boolean | null
          created_at: string | null
          gp_registered: boolean | null
          housing_benefit_claim: boolean | null
          id: string
          initial_assessment: boolean | null
          key_worker_assigned: boolean | null
          missing_person_form: boolean | null
          personal_details_form: boolean | null
          risk_assessment: boolean | null
          service_charge_agreement: boolean | null
          tenant_id: string
          uc_claim_progressed: boolean | null
          updated_at: string | null
        }
        Insert: {
          confidentiality_form?: boolean | null
          created_at?: string | null
          gp_registered?: boolean | null
          housing_benefit_claim?: boolean | null
          id?: string
          initial_assessment?: boolean | null
          key_worker_assigned?: boolean | null
          missing_person_form?: boolean | null
          personal_details_form?: boolean | null
          risk_assessment?: boolean | null
          service_charge_agreement?: boolean | null
          tenant_id: string
          uc_claim_progressed?: boolean | null
          updated_at?: string | null
        }
        Update: {
          confidentiality_form?: boolean | null
          created_at?: string | null
          gp_registered?: boolean | null
          housing_benefit_claim?: boolean | null
          id?: string
          initial_assessment?: boolean | null
          key_worker_assigned?: boolean | null
          missing_person_form?: boolean | null
          personal_details_form?: boolean | null
          risk_assessment?: boolean | null
          service_charge_agreement?: boolean | null
          tenant_id?: string
          uc_claim_progressed?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intake_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "intake_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string
          id: string
          issue_type: string
          org_id: string
          photo_url: string | null
          reported_by: string
          room_number: string
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description: string
          id?: string
          issue_type: string
          org_id: string
          photo_url?: string | null
          reported_by: string
          room_number: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          id?: string
          issue_type?: string
          org_id?: string
          photo_url?: string | null
          reported_by?: string
          room_number?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "maintenance_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          brand: string
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_date: string
          payment_type: string
          recorded_by: string | null
          reference_note: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_date?: string
          payment_type: string
          recorded_by?: string | null
          reference_note?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_date?: string
          payment_type?: string
          recorded_by?: string | null
          reference_note?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rent_payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "rent_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      service_charges: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string
          entered_by: string | null
          id: string
          is_paid: boolean | null
          paid_date: string | null
          tenant_id: string
          week_label: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          due_date: string
          entered_by?: string | null
          id?: string
          is_paid?: boolean | null
          paid_date?: string | null
          tenant_id: string
          week_label: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string
          entered_by?: string | null
          id?: string
          is_paid?: boolean | null
          paid_date?: string | null
          tenant_id?: string
          week_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_charges_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "service_charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          blockchain_hash: string | null
          created_at: string | null
          entered_by: string | null
          entered_by_name: string | null
          id: string
          notes: string
          session_date: string
          session_type: string
          tenant_id: string
        }
        Insert: {
          blockchain_hash?: string | null
          created_at?: string | null
          entered_by?: string | null
          entered_by_name?: string | null
          id?: string
          notes: string
          session_date?: string
          session_type: string
          tenant_id: string
        }
        Update: {
          blockchain_hash?: string | null
          created_at?: string | null
          entered_by?: string | null
          entered_by_name?: string | null
          id?: string
          notes?: string
          session_date?: string
          session_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          brand: Database["public"]["Enums"]["brand"]
          id: string
          service_charge_default: number
          updated_at: string | null
        }
        Insert: {
          brand: Database["public"]["Enums"]["brand"]
          id?: string
          service_charge_default?: number
          updated_at?: string | null
        }
        Update: {
          brand?: Database["public"]["Enums"]["brand"]
          id?: string
          service_charge_default?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      shift_handovers: {
        Row: {
          created_at: string
          id: string
          notes: string
          org_id: string
          shift_date: string
          shift_type: string
          staff_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes: string
          org_id: string
          shift_date?: string
          shift_type: string
          staff_name: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string
          org_id?: string
          shift_date?: string
          shift_type?: string
          staff_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_notes: {
        Row: {
          author_name: string
          created_at: string
          id: string
          note_content: string
          org_id: string
          tenant_id: string | null
        }
        Insert: {
          author_name: string
          created_at?: string
          id?: string
          note_content: string
          org_id: string
          tenant_id?: string | null
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          note_content?: string
          org_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "staff_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_queue: {
        Row: {
          audit_hash: string
          created_at: string | null
          error: string | null
          id: string
          retry_count: number | null
          status: Database["public"]["Enums"]["stamp_status"] | null
          tenant_id: string | null
          tx_hash: string | null
          updated_at: string | null
        }
        Insert: {
          audit_hash: string
          created_at?: string | null
          error?: string | null
          id?: string
          retry_count?: number | null
          status?: Database["public"]["Enums"]["stamp_status"] | null
          tenant_id?: string | null
          tx_hash?: string | null
          updated_at?: string | null
        }
        Update: {
          audit_hash?: string
          created_at?: string | null
          error?: string | null
          id?: string
          retry_count?: number | null
          status?: Database["public"]["Enums"]["stamp_status"] | null
          tenant_id?: string | null
          tx_hash?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stamp_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "stamp_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_documents: {
        Row: {
          created_at: string
          file_url: string
          id: string
          name: string
          tenant_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          name: string
          tenant_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          name?: string
          tenant_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_forms: {
        Row: {
          created_at: string
          data: Json
          id: string
          status: string
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          status?: string
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          status?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_forms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_goal_updates: {
        Row: {
          comment: string
          created_at: string
          entered_by: string
          goal_id: string
          id: string
        }
        Insert: {
          comment: string
          created_at?: string
          entered_by: string
          goal_id: string
          id?: string
        }
        Update: {
          comment?: string
          created_at?: string
          entered_by?: string
          goal_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_goal_updates_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "tenant_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_goals: {
        Row: {
          area: string
          created_at: string
          id: string
          review_date: string
          status: string
          sub_category: string
          tenant_id: string
        }
        Insert: {
          area: string
          created_at?: string
          id?: string
          review_date?: string
          status?: string
          sub_category: string
          tenant_id: string
        }
        Update: {
          area?: string
          created_at?: string
          id?: string
          review_date?: string
          status?: string
          sub_category?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant_arrears_balance"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "tenant_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          benefit_amount: number | null
          benefit_frequency: string | null
          benefit_type: string | null
          blockchain_hash: string | null
          brand: Database["public"]["Enums"]["brand"] | null
          created_at: string | null
          created_by: string | null
          date_entry_uk: string | null
          dob: string | null
          doctor: string | null
          email: string | null
          entry_method: Database["public"]["Enums"]["entry_method"] | null
          full_name: string
          id: string
          is_active: boolean | null
          is_archived: boolean | null
          languages: string | null
          mobile: string | null
          moved_in: string | null
          nationality: string | null
          nino: string | null
          nok_address: string | null
          nok_name: string | null
          nok_phone: string | null
          nok_relationship: string | null
          org_id: string | null
          photo_url: string | null
          postcode: string | null
          probation_officer: string | null
          room_number: string | null
          tenant_signature_hash: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          benefit_amount?: number | null
          benefit_frequency?: string | null
          benefit_type?: string | null
          blockchain_hash?: string | null
          brand?: Database["public"]["Enums"]["brand"] | null
          created_at?: string | null
          created_by?: string | null
          date_entry_uk?: string | null
          dob?: string | null
          doctor?: string | null
          email?: string | null
          entry_method?: Database["public"]["Enums"]["entry_method"] | null
          full_name: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean | null
          languages?: string | null
          mobile?: string | null
          moved_in?: string | null
          nationality?: string | null
          nino?: string | null
          nok_address?: string | null
          nok_name?: string | null
          nok_phone?: string | null
          nok_relationship?: string | null
          org_id?: string | null
          photo_url?: string | null
          postcode?: string | null
          probation_officer?: string | null
          room_number?: string | null
          tenant_signature_hash?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          benefit_amount?: number | null
          benefit_frequency?: string | null
          benefit_type?: string | null
          blockchain_hash?: string | null
          brand?: Database["public"]["Enums"]["brand"] | null
          created_at?: string | null
          created_by?: string | null
          date_entry_uk?: string | null
          dob?: string | null
          doctor?: string | null
          email?: string | null
          entry_method?: Database["public"]["Enums"]["entry_method"] | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          is_archived?: boolean | null
          languages?: string | null
          mobile?: string | null
          moved_in?: string | null
          nationality?: string | null
          nino?: string | null
          nok_address?: string | null
          nok_name?: string | null
          nok_phone?: string | null
          nok_relationship?: string | null
          org_id?: string | null
          photo_url?: string | null
          postcode?: string | null
          probation_officer?: string | null
          room_number?: string | null
          tenant_signature_hash?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      tenant_arrears_balance: {
        Row: {
          balance: number | null
          org_id: string | null
          tenant_id: string | null
          total_charged: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_my_org_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_assigned_to_tenant: { Args: { t_id: string }; Returns: boolean }
      seed_default_form_templates: {
        Args: { target_org_id: string }
        Returns: undefined
      }
      write_with_audit: {
        Args: { p_audit: Json; p_record: Json; p_table: string }
        Returns: Json
      }
    }
    Enums: {
      audit_action:
        | "CREATE"
        | "UPDATE"
        | "DELETE"
        | "VERIFY"
        | "SIGN"
        | "EXPORT"
        | "LOGIN"
      brand: "mattys_place" | "ash_shahada" | "reliance" | "tenant_hub"
      entry_method: "manual" | "ocr" | "voice"
      stamp_status: "pending" | "processing" | "done" | "failed" | "dead_letter"
      user_role: "manager" | "support_worker" | "tenant"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      audit_action: [
        "CREATE",
        "UPDATE",
        "DELETE",
        "VERIFY",
        "SIGN",
        "EXPORT",
        "LOGIN",
      ],
      brand: ["mattys_place", "ash_shahada", "reliance", "tenant_hub"],
      entry_method: ["manual", "ocr", "voice"],
      stamp_status: ["pending", "processing", "done", "failed", "dead_letter"],
      user_role: ["manager", "support_worker", "tenant"],
    },
  },
} as const
