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
  public: {
    Tables: {
      ai_usage: {
        Row: {
          action: string
          cached_tokens: number
          candidate_id: string | null
          cost_usd: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          org_id: string
          output_tokens: number
        }
        Insert: {
          action: string
          cached_tokens?: number
          candidate_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          org_id: string
          output_tokens?: number
        }
        Update: {
          action?: string
          cached_tokens?: number
          candidate_id?: string | null
          cost_usd?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          org_id?: string
          output_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: Database["public"]["Enums"]["actor_type"]
          actor_user_id: string | null
          candidate_id: string | null
          created_at: string
          decision: string | null
          event_type: string
          id: string
          input_ref: string | null
          metadata: Json
          model: string | null
          org_id: string
          output_ref: string | null
          prompt_version: string | null
          reason: string | null
        }
        Insert: {
          actor: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          candidate_id?: string | null
          created_at?: string
          decision?: string | null
          event_type: string
          id?: string
          input_ref?: string | null
          metadata?: Json
          model?: string | null
          org_id: string
          output_ref?: string | null
          prompt_version?: string | null
          reason?: string | null
        }
        Update: {
          actor?: Database["public"]["Enums"]["actor_type"]
          actor_user_id?: string | null
          candidate_id?: string | null
          created_at?: string
          decision?: string | null
          event_type?: string
          id?: string
          input_ref?: string | null
          metadata?: Json
          model?: string | null
          org_id?: string
          output_ref?: string | null
          prompt_version?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_enrollments: {
        Row: {
          campaign_id: string
          candidate_id: string
          completed_at: string | null
          current_step: number
          enrolled_at: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          unanswered_count: number
        }
        Insert: {
          campaign_id: string
          candidate_id: string
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          unanswered_count?: number
        }
        Update: {
          campaign_id?: string
          candidate_id?: string
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          unanswered_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_enrollments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_enrollments_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_steps: {
        Row: {
          campaign_id: string
          delay_days: number
          id: string
          message_type: Database["public"]["Enums"]["step_type"]
          org_id: string
          prompt_template_id: string | null
          step_number: number
          template_body: string | null
          template_subject: string | null
          use_ai: boolean
        }
        Insert: {
          campaign_id: string
          delay_days?: number
          id?: string
          message_type: Database["public"]["Enums"]["step_type"]
          org_id: string
          prompt_template_id?: string | null
          step_number: number
          template_body?: string | null
          template_subject?: string | null
          use_ai?: boolean
        }
        Update: {
          campaign_id?: string
          delay_days?: number
          id?: string
          message_type?: Database["public"]["Enums"]["step_type"]
          org_id?: string
          prompt_template_id?: string | null
          step_number?: number
          template_body?: string | null
          template_subject?: string | null
          use_ai?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaign_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_steps_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          daily_sender_limit: number
          id: string
          name: string
          objective: string | null
          org_id: string
          recontact_days: number
          sector: string | null
          send_days: number[] | null
          send_window_end: string | null
          send_window_start: string | null
          sender_ids: string[]
          status: Database["public"]["Enums"]["campaign_status"]
          target_audience: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          daily_sender_limit?: number
          id?: string
          name: string
          objective?: string | null
          org_id: string
          recontact_days?: number
          sector?: string | null
          send_days?: number[] | null
          send_window_end?: string | null
          send_window_start?: string | null
          sender_ids?: string[]
          status?: Database["public"]["Enums"]["campaign_status"]
          target_audience?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          daily_sender_limit?: number
          id?: string
          name?: string
          objective?: string | null
          org_id?: string
          recontact_days?: number
          sector?: string | null
          send_days?: number[] | null
          send_window_end?: string | null
          send_window_start?: string | null
          sender_ids?: string[]
          status?: Database["public"]["Enums"]["campaign_status"]
          target_audience?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_facts: {
        Row: {
          candidate_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          fact_type: string
          id: string
          org_id: string
          reported_at: string
          source: Database["public"]["Enums"]["fact_source"]
          source_message_id: string | null
          value_json: Json
          verified_at: string | null
        }
        Insert: {
          candidate_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          fact_type: string
          id?: string
          org_id: string
          reported_at?: string
          source: Database["public"]["Enums"]["fact_source"]
          source_message_id?: string | null
          value_json: Json
          verified_at?: string | null
        }
        Update: {
          candidate_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          fact_type?: string
          id?: string
          org_id?: string
          reported_at?: string
          source?: Database["public"]["Enums"]["fact_source"]
          source_message_id?: string | null
          value_json?: Json
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_facts_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_facts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_facts_source_message_fk"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          availability_date: string | null
          availability_precision: Database["public"]["Enums"]["availability_precision"]
          communication_status: Database["public"]["Enums"]["communication_status"]
          created_at: string
          current_company: string | null
          current_salary: Json | null
          current_title: string | null
          email: string
          email_normalized: string
          first_name: string | null
          id: string
          industry: string | null
          last_contacted_at: string | null
          last_name: string | null
          last_replied_at: string | null
          last_verified_at: string | null
          linkedin_url: string | null
          location: string | null
          market_status: Database["public"]["Enums"]["market_status"]
          memory_summary: string | null
          next_contact_at: string | null
          notes: string | null
          notice_period: string | null
          org_id: string
          owner_user_id: string | null
          phone: string | null
          phone_normalized: string | null
          preferred_locations: string[]
          preferred_roles: string[]
          remote_preference: string | null
          skills: string[]
          source: string | null
          source_reference: string | null
          target_salary: Json | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          availability_date?: string | null
          availability_precision?: Database["public"]["Enums"]["availability_precision"]
          communication_status?: Database["public"]["Enums"]["communication_status"]
          created_at?: string
          current_company?: string | null
          current_salary?: Json | null
          current_title?: string | null
          email: string
          email_normalized: string
          first_name?: string | null
          id?: string
          industry?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          last_replied_at?: string | null
          last_verified_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          market_status?: Database["public"]["Enums"]["market_status"]
          memory_summary?: string | null
          next_contact_at?: string | null
          notes?: string | null
          notice_period?: string | null
          org_id: string
          owner_user_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          preferred_locations?: string[]
          preferred_roles?: string[]
          remote_preference?: string | null
          skills?: string[]
          source?: string | null
          source_reference?: string | null
          target_salary?: Json | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          availability_date?: string | null
          availability_precision?: Database["public"]["Enums"]["availability_precision"]
          communication_status?: Database["public"]["Enums"]["communication_status"]
          created_at?: string
          current_company?: string | null
          current_salary?: Json | null
          current_title?: string | null
          email?: string
          email_normalized?: string
          first_name?: string | null
          id?: string
          industry?: string | null
          last_contacted_at?: string | null
          last_name?: string | null
          last_replied_at?: string | null
          last_verified_at?: string | null
          linkedin_url?: string | null
          location?: string | null
          market_status?: Database["public"]["Enums"]["market_status"]
          memory_summary?: string | null
          next_contact_at?: string | null
          notes?: string | null
          notice_period?: string | null
          org_id?: string
          owner_user_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          preferred_locations?: string[]
          preferred_roles?: string[]
          remote_preference?: string | null
          skills?: string[]
          source?: string | null
          source_reference?: string | null
          target_salary?: Json | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          campaign_id: string | null
          candidate_id: string
          created_at: string
          id: string
          last_message_at: string | null
          org_id: string
          sender_id: string | null
          status: string
          thread_token: string
        }
        Insert: {
          campaign_id?: string | null
          candidate_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id: string
          sender_id?: string | null
          status?: string
          thread_token: string
        }
        Update: {
          campaign_id?: string | null
          candidate_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id?: string
          sender_id?: string | null
          status?: string
          thread_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "senders"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          created_by: string | null
          created_count: number
          errors: Json
          filename: string
          id: string
          org_id: string
          row_count: number
          skipped_duplicate: number
          skipped_invalid: number
          skipped_suppressed: number
          updated_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          errors?: Json
          filename: string
          id?: string
          org_id: string
          row_count?: number
          skipped_duplicate?: number
          skipped_invalid?: number
          skipped_suppressed?: number
          updated_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_count?: number
          errors?: Json
          filename?: string
          id?: string
          org_id?: string
          row_count?: number
          skipped_duplicate?: number
          skipped_invalid?: number
          skipped_suppressed?: number
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      inbound_events: {
        Row: {
          error: string | null
          event_type: string
          id: string
          org_id: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type: string
          id?: string
          org_id?: string | null
          payload: Json
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string
          id?: string
          org_id?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inbound_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_generated: boolean
          ai_model: string | null
          approved_by: string | null
          campaign_id: string | null
          candidate_id: string
          conversation_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          from_address: string
          html_body: string | null
          id: string
          in_reply_to: string | null
          internet_message_id: string | null
          message_type: Database["public"]["Enums"]["message_kind"]
          org_id: string
          prompt_version: string | null
          provider: string
          provider_message_id: string | null
          provider_thread_id: string | null
          received_at: string | null
          reply_text: string | null
          sender_id: string | null
          sent_at: string | null
          step_number: number | null
          subject: string | null
          text_body: string | null
          to_address: string
        }
        Insert: {
          ai_generated?: boolean
          ai_model?: string | null
          approved_by?: string | null
          campaign_id?: string | null
          candidate_id: string
          conversation_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction: Database["public"]["Enums"]["message_direction"]
          from_address: string
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          message_type: Database["public"]["Enums"]["message_kind"]
          org_id: string
          prompt_version?: string | null
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          reply_text?: string | null
          sender_id?: string | null
          sent_at?: string | null
          step_number?: number | null
          subject?: string | null
          text_body?: string | null
          to_address: string
        }
        Update: {
          ai_generated?: boolean
          ai_model?: string | null
          approved_by?: string | null
          campaign_id?: string | null
          candidate_id?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction?: Database["public"]["Enums"]["message_direction"]
          from_address?: string
          html_body?: string | null
          id?: string
          in_reply_to?: string | null
          internet_message_id?: string | null
          message_type?: Database["public"]["Enums"]["message_kind"]
          org_id?: string
          prompt_version?: string | null
          provider?: string
          provider_message_id?: string | null
          provider_thread_id?: string | null
          received_at?: string | null
          reply_text?: string | null
          sender_id?: string | null
          sent_at?: string | null
          step_number?: number | null
          subject?: string | null
          text_body?: string | null
          to_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "senders"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          display_name: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          approval_required: boolean
          auto_threshold: number
          default_nurture_days: number
          default_timezone: string
          human_review_categories: string[]
          max_followups_per_sender_per_day: number
          max_new_per_sender_per_day: number
          max_outreach_per_day: number
          max_unanswered_per_sequence: number
          min_gap_hours: number
          models: Json
          org_id: string
          outreach_paused: boolean
          paused_at: string | null
          paused_by: string | null
          review_threshold: number
          send_days: number[]
          send_window_end: string
          send_window_start: string
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          auto_threshold?: number
          default_nurture_days?: number
          default_timezone?: string
          human_review_categories?: string[]
          max_followups_per_sender_per_day?: number
          max_new_per_sender_per_day?: number
          max_outreach_per_day?: number
          max_unanswered_per_sequence?: number
          min_gap_hours?: number
          models?: Json
          org_id: string
          outreach_paused?: boolean
          paused_at?: string | null
          paused_by?: string | null
          review_threshold?: number
          send_days?: number[]
          send_window_end?: string
          send_window_start?: string
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          auto_threshold?: number
          default_nurture_days?: number
          default_timezone?: string
          human_review_categories?: string[]
          max_followups_per_sender_per_day?: number
          max_new_per_sender_per_day?: number
          max_outreach_per_day?: number
          max_unanswered_per_sequence?: number
          min_gap_hours?: number
          models?: Json
          org_id?: string
          outreach_paused?: boolean
          paused_at?: string | null
          paused_by?: string | null
          review_threshold?: number
          send_days?: number[]
          send_window_end?: string
          send_window_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          allowed_email_domains: string[]
          brand: Json
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          allowed_email_domains?: string[]
          brand?: Json
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          allowed_email_domains?: string[]
          brand?: Json
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          active: boolean
          content: string
          created_at: string
          id: string
          name: string
          org_id: string | null
          version: number
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string
          id?: string
          name: string
          org_id?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      review_items: {
        Row: {
          ai_classification: Json | null
          candidate_id: string
          category: string
          conversation_id: string | null
          created_at: string
          draft_reply: string | null
          id: string
          inbound_message_id: string | null
          org_id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["review_status"]
        }
        Insert: {
          ai_classification?: Json | null
          candidate_id: string
          category: string
          conversation_id?: string | null
          created_at?: string
          draft_reply?: string | null
          id?: string
          inbound_message_id?: string | null
          org_id: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
        }
        Update: {
          ai_classification?: Json | null
          candidate_id?: string
          category?: string
          conversation_id?: string | null
          created_at?: string
          draft_reply?: string | null
          id?: string
          inbound_message_id?: string | null
          org_id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "review_items_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_items_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_items_inbound_message_id_fkey"
            columns: ["inbound_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["action_type"]
          attempt_count: number
          campaign_id: string | null
          candidate_id: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by_label: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          org_id: string
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["action_status"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["action_type"]
          attempt_count?: number
          campaign_id?: string | null
          candidate_id: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_label?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          org_id: string
          payload?: Json
          scheduled_for: string
          status?: Database["public"]["Enums"]["action_status"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["action_type"]
          attempt_count?: number
          campaign_id?: string | null
          candidate_id?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by_label?: string | null
          id?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          org_id?: string
          payload?: Json
          scheduled_for?: string
          status?: Database["public"]["Enums"]["action_status"]
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_actions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          name: string
        }
        Insert: {
          applied_at?: string
          name: string
        }
        Update: {
          applied_at?: string
          name?: string
        }
        Relationships: []
      }
      senders: {
        Row: {
          created_at: string
          daily_cap_followup: number
          daily_cap_new: number
          display_name: string
          email: string
          id: string
          org_id: string
          status: Database["public"]["Enums"]["sender_status"]
          warmup_started_at: string
        }
        Insert: {
          created_at?: string
          daily_cap_followup?: number
          daily_cap_new?: number
          display_name: string
          email: string
          id?: string
          org_id: string
          status?: Database["public"]["Enums"]["sender_status"]
          warmup_started_at?: string
        }
        Update: {
          created_at?: string
          daily_cap_followup?: number
          daily_cap_new?: number
          display_name?: string
          email?: string
          id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["sender_status"]
          warmup_started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "senders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          candidate_id: string | null
          channel: string
          created_at: string
          created_by: string | null
          created_by_label: string | null
          id: string
          identifier: string
          note: string | null
          org_id: string
          reason: Database["public"]["Enums"]["suppression_reason"]
        }
        Insert: {
          candidate_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          id?: string
          identifier: string
          note?: string | null
          org_id: string
          reason: Database["public"]["Enums"]["suppression_reason"]
        }
        Update: {
          candidate_id?: string | null
          channel?: string
          created_at?: string
          created_by?: string | null
          created_by_label?: string | null
          id?: string
          identifier?: string
          note?: string | null
          org_id?: string
          reason?: Database["public"]["Enums"]["suppression_reason"]
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppressions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_org_ids: { Args: never; Returns: string[] }
      auth_role_in: {
        Args: { p_org: string }
        Returns: Database["public"]["Enums"]["member_role"]
      }
      claim_scheduled_actions: {
        Args: { p_limit: number; p_worker: string }
        Returns: {
          action_type: Database["public"]["Enums"]["action_type"]
          attempt_count: number
          campaign_id: string | null
          candidate_id: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by_label: string | null
          id: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          org_id: string
          payload: Json
          scheduled_for: string
          status: Database["public"]["Enums"]["action_status"]
        }[]
        SetofOptions: {
          from: "*"
          to: "scheduled_actions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fill_candidate_blanks: {
        Args: { p_id: string; p_patch: Json }
        Returns: undefined
      }
      join_org_by_email_domain: {
        Args: never
        Returns: {
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      resolve_member_emails: {
        Args: { p_emails: string[]; p_org: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
    }
    Enums: {
      action_status:
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "FAILED"
        | "CANCELLED"
      action_type:
        | "SEND_INITIAL"
        | "SEND_FOLLOW_UP"
        | "SEND_FINAL"
        | "SEND_NURTURE"
        | "SEND_REPLY"
        | "RECONNECT"
        | "REFRESH_PROFILE"
        | "HUMAN_REVIEW"
      actor_type: "SYSTEM" | "AI" | "USER"
      availability_precision:
        | "DAY"
        | "WEEK"
        | "MONTH"
        | "MONTH_APPROXIMATE"
        | "QUARTER"
        | "YEAR"
        | "UNKNOWN"
      campaign_status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"
      communication_status:
        | "NOT_CONTACTED"
        | "SEQUENCE_ACTIVE"
        | "WAITING_FOR_REPLY"
        | "CONVERSATION_ACTIVE"
        | "NURTURE_SCHEDULED"
        | "HUMAN_REVIEW"
        | "CLOSED"
        | "SUPPRESSED"
      delivery_status:
        | "QUEUED"
        | "SENT"
        | "DELIVERED"
        | "BOUNCED"
        | "COMPLAINED"
        | "FAILED"
        | "RECEIVED"
      enrollment_status: "ENROLLED" | "COMPLETED" | "STOPPED" | "SUPPRESSED"
      fact_source: "EMAIL" | "CSV" | "USER" | "RESUME" | "SYSTEM"
      market_status:
        | "UNKNOWN"
        | "AVAILABLE_NOW"
        | "OPEN_TO_RIGHT_OPPORTUNITY"
        | "OPEN_LATER"
        | "PASSIVE"
        | "NOT_LOOKING"
        | "NOT_INTERESTED"
      member_role: "admin" | "recruiter" | "viewer"
      message_direction: "INBOUND" | "OUTBOUND"
      message_kind:
        | "INITIAL"
        | "FOLLOW_UP"
        | "FINAL"
        | "NURTURE"
        | "RECONNECT"
        | "REPLY"
        | "MANUAL"
      review_status:
        | "OPEN"
        | "APPROVED"
        | "SKIPPED"
        | "TAKEN_OVER"
        | "SUPPRESSED"
      sender_status: "WARMING" | "WARMED" | "PAUSED"
      step_type: "INITIAL" | "FOLLOW_UP" | "FINAL" | "NURTURE"
      suppression_reason:
        | "OPT_OUT"
        | "COMPLAINT"
        | "BOUNCE"
        | "MANUAL"
        | "LEGAL"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      action_status: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ],
      action_type: [
        "SEND_INITIAL",
        "SEND_FOLLOW_UP",
        "SEND_FINAL",
        "SEND_NURTURE",
        "SEND_REPLY",
        "RECONNECT",
        "REFRESH_PROFILE",
        "HUMAN_REVIEW",
      ],
      actor_type: ["SYSTEM", "AI", "USER"],
      availability_precision: [
        "DAY",
        "WEEK",
        "MONTH",
        "MONTH_APPROXIMATE",
        "QUARTER",
        "YEAR",
        "UNKNOWN",
      ],
      campaign_status: ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"],
      communication_status: [
        "NOT_CONTACTED",
        "SEQUENCE_ACTIVE",
        "WAITING_FOR_REPLY",
        "CONVERSATION_ACTIVE",
        "NURTURE_SCHEDULED",
        "HUMAN_REVIEW",
        "CLOSED",
        "SUPPRESSED",
      ],
      delivery_status: [
        "QUEUED",
        "SENT",
        "DELIVERED",
        "BOUNCED",
        "COMPLAINED",
        "FAILED",
        "RECEIVED",
      ],
      enrollment_status: ["ENROLLED", "COMPLETED", "STOPPED", "SUPPRESSED"],
      fact_source: ["EMAIL", "CSV", "USER", "RESUME", "SYSTEM"],
      market_status: [
        "UNKNOWN",
        "AVAILABLE_NOW",
        "OPEN_TO_RIGHT_OPPORTUNITY",
        "OPEN_LATER",
        "PASSIVE",
        "NOT_LOOKING",
        "NOT_INTERESTED",
      ],
      member_role: ["admin", "recruiter", "viewer"],
      message_direction: ["INBOUND", "OUTBOUND"],
      message_kind: [
        "INITIAL",
        "FOLLOW_UP",
        "FINAL",
        "NURTURE",
        "RECONNECT",
        "REPLY",
        "MANUAL",
      ],
      review_status: [
        "OPEN",
        "APPROVED",
        "SKIPPED",
        "TAKEN_OVER",
        "SUPPRESSED",
      ],
      sender_status: ["WARMING", "WARMED", "PAUSED"],
      step_type: ["INITIAL", "FOLLOW_UP", "FINAL", "NURTURE"],
      suppression_reason: ["OPT_OUT", "COMPLAINT", "BOUNCE", "MANUAL", "LEGAL"],
    },
  },
} as const
