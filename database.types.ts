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
      AccountManagers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          user_uuid: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "AccountManagers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      AccountManagerZones: {
        Row: {
          account_manager_uuid: string
          created_at: string
          id: string
          is_lead: boolean
          zone_uuid: string
        }
        Insert: {
          account_manager_uuid: string
          created_at?: string
          id?: string
          is_lead?: boolean
          zone_uuid: string
        }
        Update: {
          account_manager_uuid?: string
          created_at?: string
          id?: string
          is_lead?: boolean
          zone_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountmanagerzones_am_uuid_fkey"
            columns: ["account_manager_uuid"]
            isOneToOne: false
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountmanagerzones_zone_uuid_fkey"
            columns: ["zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
      Addresses: {
        Row: {
          city: string
          country: string | null
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          place_id: string | null
          state_province: string
          street: string
          zip_postal: string | null
        }
        Insert: {
          city: string
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          state_province: string
          street: string
          zip_postal?: string | null
        }
        Update: {
          city?: string
          country?: string | null
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          state_province?: string
          street?: string
          zip_postal?: string | null
        }
        Relationships: []
      }
      Alerts: {
        Row: {
          created_at: string
          entity_description: string | null
          entity_type: Database["public"]["Enums"]["alert_entity_type"]
          entity_uuid: string
          id: string
          message: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          entity_description?: string | null
          entity_type: Database["public"]["Enums"]["alert_entity_type"]
          entity_uuid: string
          id?: string
          message?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          entity_description?: string | null
          entity_type?: Database["public"]["Enums"]["alert_entity_type"]
          entity_uuid?: string
          id?: string
          message?: string | null
          title?: string | null
        }
        Relationships: []
      }
      AppVersionPolicy: {
        Row: {
          android_store_url: string
          environment: string
          id: string
          ios_store_url: string
          message: string | null
          recommended_version: string
          required_version: string
          soft_deadline: string | null
          updated_at: string
        }
        Insert: {
          android_store_url?: string
          environment: string
          id?: string
          ios_store_url?: string
          message?: string | null
          recommended_version: string
          required_version: string
          soft_deadline?: string | null
          updated_at?: string
        }
        Update: {
          android_store_url?: string
          environment?: string
          id?: string
          ios_store_url?: string
          message?: string | null
          recommended_version?: string
          required_version?: string
          soft_deadline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      BleacherAnnualInspections: {
        Row: {
          bleacher_uuid: string
          created_at: string
          created_by: string | null
          document_path: string | null
          id: string
          inspected_on: string | null
          next_due_on: string
          notes: string | null
        }
        Insert: {
          bleacher_uuid: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          id?: string
          inspected_on?: string | null
          next_due_on: string
          notes?: string | null
        }
        Update: {
          bleacher_uuid?: string
          created_at?: string
          created_by?: string | null
          document_path?: string | null
          id?: string
          inspected_on?: string | null
          next_due_on?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bleacher_annual_inspections_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bleacher_annual_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      BleacherEvents: {
        Row: {
          bleacher_uuid: string | null
          created_at: string
          event_uuid: string | null
          id: string
          setup_confirmed: boolean
          setup_text: string | null
          teardown_confirmed: boolean
          teardown_text: string | null
        }
        Insert: {
          bleacher_uuid?: string | null
          created_at?: string
          event_uuid?: string | null
          id?: string
          setup_confirmed?: boolean
          setup_text?: string | null
          teardown_confirmed?: boolean
          teardown_text?: string | null
        }
        Update: {
          bleacher_uuid?: string | null
          created_at?: string
          event_uuid?: string | null
          id?: string
          setup_confirmed?: boolean
          setup_text?: string | null
          teardown_confirmed?: boolean
          teardown_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "BleacherEvents_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "BleacherEvents_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
        ]
      }
      BleacherMaintEvents: {
        Row: {
          bleacher_uuid: string
          created_at: string
          id: string
          maintenance_event_uuid: string
        }
        Insert: {
          bleacher_uuid: string
          created_at?: string
          id?: string
          maintenance_event_uuid: string
        }
        Update: {
          bleacher_uuid?: string
          created_at?: string
          id?: string
          maintenance_event_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "BleacherMaintEvents_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "BleacherMaintEvents_maintenance_event_uuid_fkey"
            columns: ["maintenance_event_uuid"]
            isOneToOne: false
            referencedRelation: "MaintenanceEvents"
            referencedColumns: ["id"]
          },
        ]
      }
      Bleachers: {
        Row: {
          bleacher_number: number
          bleacher_rows: number
          bleacher_seats: number
          bleacher_type_uuid: string | null
          created_at: string
          created_by: string | null
          deleted: boolean
          gvwr: number | null
          height_folded_ft: number | null
          hitch_type: string | null
          id: string
          linxup_device_id: string | null
          manufacturer: string | null
          nvis_pdf_path: string | null
          opening_direction:
            | Database["public"]["Enums"]["bleacher_opening_dir"]
            | null
          storage_location_uuid: string | null
          summer_account_manager_uuid: string | null
          summer_home_base_uuid: string | null
          tag_number: string | null
          trailer_height_in: number | null
          trailer_length: number | null
          trailer_length_in: number | null
          updated_at: string | null
          updated_by: string | null
          vin_number: string | null
          winter_account_manager_uuid: string | null
          winter_home_base_uuid: string | null
          zone_uuid: string | null
        }
        Insert: {
          bleacher_number: number
          bleacher_rows: number
          bleacher_seats: number
          bleacher_type_uuid?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          gvwr?: number | null
          height_folded_ft?: number | null
          hitch_type?: string | null
          id?: string
          linxup_device_id?: string | null
          manufacturer?: string | null
          nvis_pdf_path?: string | null
          opening_direction?:
            | Database["public"]["Enums"]["bleacher_opening_dir"]
            | null
          storage_location_uuid?: string | null
          summer_account_manager_uuid?: string | null
          summer_home_base_uuid?: string | null
          tag_number?: string | null
          trailer_height_in?: number | null
          trailer_length?: number | null
          trailer_length_in?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vin_number?: string | null
          winter_account_manager_uuid?: string | null
          winter_home_base_uuid?: string | null
          zone_uuid?: string | null
        }
        Update: {
          bleacher_number?: number
          bleacher_rows?: number
          bleacher_seats?: number
          bleacher_type_uuid?: string | null
          created_at?: string
          created_by?: string | null
          deleted?: boolean
          gvwr?: number | null
          height_folded_ft?: number | null
          hitch_type?: string | null
          id?: string
          linxup_device_id?: string | null
          manufacturer?: string | null
          nvis_pdf_path?: string | null
          opening_direction?:
            | Database["public"]["Enums"]["bleacher_opening_dir"]
            | null
          storage_location_uuid?: string | null
          summer_account_manager_uuid?: string | null
          summer_home_base_uuid?: string | null
          tag_number?: string | null
          trailer_height_in?: number | null
          trailer_length?: number | null
          trailer_length_in?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vin_number?: string | null
          winter_account_manager_uuid?: string | null
          winter_home_base_uuid?: string | null
          zone_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Bleachers_bleacher_type_uuid_fkey"
            columns: ["bleacher_type_uuid"]
            isOneToOne: false
            referencedRelation: "BleacherTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Bleachers_storage_location_uuid_fkey"
            columns: ["storage_location_uuid"]
            isOneToOne: false
            referencedRelation: "StorageLocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Bleachers_summer_account_manager_uuid_fkey"
            columns: ["summer_account_manager_uuid"]
            isOneToOne: false
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bleachers_summer_home_base_uuid_fkey"
            columns: ["summer_home_base_uuid"]
            isOneToOne: false
            referencedRelation: "HomeBases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Bleachers_winter_account_manager_uuid_fkey"
            columns: ["winter_account_manager_uuid"]
            isOneToOne: false
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bleachers_winter_home_base_uuid_fkey"
            columns: ["winter_home_base_uuid"]
            isOneToOne: false
            referencedRelation: "HomeBases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Bleachers_zone_uuid_fkey"
            columns: ["zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
      BleacherTypes: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          id: string
          name: string
          roof_type: Database["public"]["Enums"]["roof_type"]
          row_count: number
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name: string
          roof_type?: Database["public"]["Enums"]["roof_type"]
          row_count: number
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name?: string
          roof_type?: Database["public"]["Enums"]["roof_type"]
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "BleacherTypes_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      BleacherUsers: {
        Row: {
          bleacher_uuid: string | null
          created_at: string
          id: string
          season: string
          user_uuid: string | null
        }
        Insert: {
          bleacher_uuid?: string | null
          created_at?: string
          id?: string
          season: string
          user_uuid?: string | null
        }
        Update: {
          bleacher_uuid?: string | null
          created_at?: string
          id?: string
          season?: string
          user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "BleacherUsers_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "BleacherUsers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Blocks: {
        Row: {
          bleacher_uuid: string | null
          created_at: string
          date: string | null
          id: string
          text: string | null
        }
        Insert: {
          bleacher_uuid?: string | null
          created_at?: string
          date?: string | null
          id?: string
          text?: string | null
        }
        Update: {
          bleacher_uuid?: string | null
          created_at?: string
          date?: string | null
          id?: string
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Blocks_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
        ]
      }
      BlueBook: {
        Row: {
          created_at: string
          description: string | null
          document_path: string | null
          id: string
          is_active: boolean
          link: string | null
          name: string
          region: Database["public"]["Enums"]["bluebook_region"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          document_path?: string | null
          id?: string
          is_active?: boolean
          link?: string | null
          name: string
          region?: Database["public"]["Enums"]["bluebook_region"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          document_path?: string | null
          id?: string
          is_active?: boolean
          link?: string | null
          name?: string
          region?: Database["public"]["Enums"]["bluebook_region"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      ChangeLog: {
        Row: {
          body_md: string
          id: string
          released_at: string
          version: string
        }
        Insert: {
          body_md: string
          id?: string
          released_at?: string
          version: string
        }
        Update: {
          body_md?: string
          id?: string
          released_at?: string
          version?: string
        }
        Relationships: []
      }
      Companies: {
        Row: {
          billing_address_uuid: string | null
          company_name: string
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          shipping_address_uuid: string | null
        }
        Insert: {
          billing_address_uuid?: string | null
          company_name: string
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address_uuid?: string | null
        }
        Update: {
          billing_address_uuid?: string | null
          company_name?: string
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Companies_billing_address_uuid_fkey"
            columns: ["billing_address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Companies_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Companies_shipping_address_uuid_fkey"
            columns: ["shipping_address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      Contacts: {
        Row: {
          company_uuid: string | null
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          preferred_language: Database["public"]["Enums"]["preferred_language"]
        }
        Insert: {
          company_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["preferred_language"]
        }
        Update: {
          company_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["preferred_language"]
        }
        Relationships: [
          {
            foreignKeyName: "Contacts_company_uuid_fkey"
            columns: ["company_uuid"]
            isOneToOne: false
            referencedRelation: "Companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Contacts_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      ContractSignatures: {
        Row: {
          created_at: string
          event_uuid: string
          id: string
          invalidated_at: string | null
          signed_at: string
          signed_contract_hash: string | null
          signed_pdf_path: string | null
          signer_name: string
          status: Database["public"]["Enums"]["contract_signature_status"]
          terms_and_conditions_uuid: string
        }
        Insert: {
          created_at?: string
          event_uuid: string
          id?: string
          invalidated_at?: string | null
          signed_at?: string
          signed_contract_hash?: string | null
          signed_pdf_path?: string | null
          signer_name: string
          status?: Database["public"]["Enums"]["contract_signature_status"]
          terms_and_conditions_uuid: string
        }
        Update: {
          created_at?: string
          event_uuid?: string
          id?: string
          invalidated_at?: string | null
          signed_at?: string
          signed_contract_hash?: string | null
          signed_pdf_path?: string | null
          signer_name?: string
          status?: Database["public"]["Enums"]["contract_signature_status"]
          terms_and_conditions_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "ContractSignatures_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ContractSignatures_terms_and_conditions_uuid_fkey"
            columns: ["terms_and_conditions_uuid"]
            isOneToOne: false
            referencedRelation: "TermsAndConditions"
            referencedColumns: ["id"]
          },
        ]
      }
      DamageReportAcknowledgements: {
        Row: {
          acknowledged_by_user_uuid: string
          created_at: string
          damage_report_uuid: string
          deleted: boolean
          id: string
          inspection_uuid: string | null
          report_resolved_at: string | null
          work_tracker_uuid: string | null
        }
        Insert: {
          acknowledged_by_user_uuid?: string
          created_at?: string
          damage_report_uuid: string
          deleted?: boolean
          id?: string
          inspection_uuid?: string | null
          report_resolved_at?: string | null
          work_tracker_uuid?: string | null
        }
        Update: {
          acknowledged_by_user_uuid?: string
          created_at?: string
          damage_report_uuid?: string
          deleted?: boolean
          id?: string
          inspection_uuid?: string | null
          report_resolved_at?: string | null
          work_tracker_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "damage_report_acks_inspection_fkey"
            columns: ["inspection_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerInspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_report_acks_report_fkey"
            columns: ["damage_report_uuid"]
            isOneToOne: false
            referencedRelation: "DamageReports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_report_acks_user_fkey"
            columns: ["acknowledged_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "damage_report_acks_work_tracker_fkey"
            columns: ["work_tracker_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackers"
            referencedColumns: ["id"]
          },
        ]
      }
      DamageReportPhotos: {
        Row: {
          created_at: string
          damage_report_uuid: string
          id: string
          photo_path: string
          thumbnail: string | null
          upload_status: string
        }
        Insert: {
          created_at?: string
          damage_report_uuid: string
          id?: string
          photo_path: string
          thumbnail?: string | null
          upload_status?: string
        }
        Update: {
          created_at?: string
          damage_report_uuid?: string
          id?: string
          photo_path?: string
          thumbnail?: string | null
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "DamageReportPhotos_damage_report_uuid_fkey"
            columns: ["damage_report_uuid"]
            isOneToOne: false
            referencedRelation: "DamageReports"
            referencedColumns: ["id"]
          },
        ]
      }
      DamageReports: {
        Row: {
          bleacher_uuid: string
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          fixed_at: string | null
          fixed_by_driver: boolean
          fixed_by_user_uuid: string | null
          haul_damage: Database["public"]["Enums"]["damage_severity"]
          id: string
          inspection_uuid: string | null
          is_safe_to_haul: boolean
          is_safe_to_sit: boolean
          maintenance_event_uuid: string | null
          note: string | null
          photos_uploaded: boolean
          resolved_at: string | null
          seat_damage: Database["public"]["Enums"]["damage_severity"]
        }
        Insert: {
          bleacher_uuid: string
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          fixed_at?: string | null
          fixed_by_driver?: boolean
          fixed_by_user_uuid?: string | null
          haul_damage?: Database["public"]["Enums"]["damage_severity"]
          id?: string
          inspection_uuid?: string | null
          is_safe_to_haul?: boolean
          is_safe_to_sit?: boolean
          maintenance_event_uuid?: string | null
          note?: string | null
          photos_uploaded?: boolean
          resolved_at?: string | null
          seat_damage?: Database["public"]["Enums"]["damage_severity"]
        }
        Update: {
          bleacher_uuid?: string
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          fixed_at?: string | null
          fixed_by_driver?: boolean
          fixed_by_user_uuid?: string | null
          haul_damage?: Database["public"]["Enums"]["damage_severity"]
          id?: string
          inspection_uuid?: string | null
          is_safe_to_haul?: boolean
          is_safe_to_sit?: boolean
          maintenance_event_uuid?: string | null
          note?: string | null
          photos_uploaded?: boolean
          resolved_at?: string | null
          seat_damage?: Database["public"]["Enums"]["damage_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "damage_reports_fixed_by_user_uuid_fkey"
            columns: ["fixed_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DamageReports_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DamageReports_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DamageReports_inspection_uuid_fkey"
            columns: ["inspection_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerInspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DamageReports_maintenance_event_uuid_fkey"
            columns: ["maintenance_event_uuid"]
            isOneToOne: false
            referencedRelation: "MaintenanceEvents"
            referencedColumns: ["id"]
          },
        ]
      }
      DashboardFilterSettings: {
        Row: {
          account_manager_uuid: string | null
          created_at: string
          id: string
          only_show_my_events: boolean
          optimization_mode: boolean
          rows: string
          rows_quick_filter: number | null
          season: string | null
          show_address_tooltip: boolean
          show_distance_tooltip: boolean
          show_unassigned_zone: boolean
          state_provinces: string
          summer_home_base_uuids: string
          updated_at: string
          user_uuid: string
          winter_home_base_uuids: string
          y_axis: string
          zone_uuids: string
        }
        Insert: {
          account_manager_uuid?: string | null
          created_at?: string
          id?: string
          only_show_my_events?: boolean
          optimization_mode?: boolean
          rows?: string
          rows_quick_filter?: number | null
          season?: string | null
          show_address_tooltip?: boolean
          show_distance_tooltip?: boolean
          show_unassigned_zone?: boolean
          state_provinces?: string
          summer_home_base_uuids?: string
          updated_at?: string
          user_uuid: string
          winter_home_base_uuids?: string
          y_axis?: string
          zone_uuids?: string
        }
        Update: {
          account_manager_uuid?: string | null
          created_at?: string
          id?: string
          only_show_my_events?: boolean
          optimization_mode?: boolean
          rows?: string
          rows_quick_filter?: number | null
          season?: string | null
          show_address_tooltip?: boolean
          show_distance_tooltip?: boolean
          show_unassigned_zone?: boolean
          state_provinces?: string
          summer_home_base_uuids?: string
          updated_at?: string
          user_uuid?: string
          winter_home_base_uuids?: string
          y_axis?: string
          zone_uuids?: string
        }
        Relationships: [
          {
            foreignKeyName: "DashboardFilterSettings_account_manager_uuid_fkey"
            columns: ["account_manager_uuid"]
            isOneToOne: false
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DashboardFilterSettings_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: true
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Developers: {
        Row: {
          auto_subscribe_to_new_tickets: boolean
          created_at: string
          id: string
          is_active: boolean
          user_uuid: string
        }
        Insert: {
          auto_subscribe_to_new_tickets?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid: string
        }
        Update: {
          auto_subscribe_to_new_tickets?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "Developers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverDocuments: {
        Row: {
          attempts: number
          created_at: string
          doc_type: string
          driver_uuid: string
          gallery_asset_id: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          photo_path: string
          upload_status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          doc_type: string
          driver_uuid: string
          gallery_asset_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          photo_path: string
          upload_status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          doc_type?: string
          driver_uuid?: string
          gallery_asset_id?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          photo_path?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "DriverDocuments_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverPayRanges: {
        Row: {
          created_at: string
          driver_uuid: string
          id: string
          max_value: number | null
          min_value: number
          rate: number
        }
        Insert: {
          created_at?: string
          driver_uuid: string
          id?: string
          max_value?: number | null
          min_value?: number
          rate?: number
        }
        Update: {
          created_at?: string
          driver_uuid?: string
          id?: string
          max_value?: number | null
          min_value?: number
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_pay_ranges_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      Drivers: {
        Row: {
          account_manager_uuid: string | null
          address_uuid: string | null
          app_platform: string | null
          app_version: string | null
          app_version_reported_at: string | null
          created_at: string
          deadhead_cents: number
          id: string
          insurance_expires_on: string | null
          insurance_photo_path: string | null
          is_active: boolean
          license_expires_on: string | null
          license_photo_path: string | null
          medical_card_expires_on: string | null
          medical_card_photo_path: string | null
          pay_currency: Database["public"]["Enums"]["pay_currency_type"]
          pay_per_unit: Database["public"]["Enums"]["pay_per_unit_type"]
          pay_rate_cents: number
          phone_number: string | null
          setup_cents: number
          tax: number
          tax_dec: number
          teardown_cents: number
          user_uuid: string | null
          vehicle_uuid: string | null
          vendor_uuid: string | null
        }
        Insert: {
          account_manager_uuid?: string | null
          address_uuid?: string | null
          app_platform?: string | null
          app_version?: string | null
          app_version_reported_at?: string | null
          created_at?: string
          deadhead_cents?: number
          id?: string
          insurance_expires_on?: string | null
          insurance_photo_path?: string | null
          is_active?: boolean
          license_expires_on?: string | null
          license_photo_path?: string | null
          medical_card_expires_on?: string | null
          medical_card_photo_path?: string | null
          pay_currency?: Database["public"]["Enums"]["pay_currency_type"]
          pay_per_unit?: Database["public"]["Enums"]["pay_per_unit_type"]
          pay_rate_cents?: number
          phone_number?: string | null
          setup_cents?: number
          tax?: number
          tax_dec?: number
          teardown_cents?: number
          user_uuid?: string | null
          vehicle_uuid?: string | null
          vendor_uuid?: string | null
        }
        Update: {
          account_manager_uuid?: string | null
          address_uuid?: string | null
          app_platform?: string | null
          app_version?: string | null
          app_version_reported_at?: string | null
          created_at?: string
          deadhead_cents?: number
          id?: string
          insurance_expires_on?: string | null
          insurance_photo_path?: string | null
          is_active?: boolean
          license_expires_on?: string | null
          license_photo_path?: string | null
          medical_card_expires_on?: string | null
          medical_card_photo_path?: string | null
          pay_currency?: Database["public"]["Enums"]["pay_currency_type"]
          pay_per_unit?: Database["public"]["Enums"]["pay_per_unit_type"]
          pay_rate_cents?: number
          phone_number?: string | null
          setup_cents?: number
          tax?: number
          tax_dec?: number
          teardown_cents?: number
          user_uuid?: string | null
          vehicle_uuid?: string | null
          vendor_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Drivers_account_manager_uuid_fkey"
            columns: ["account_manager_uuid"]
            isOneToOne: false
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Drivers_address_uuid_fkey"
            columns: ["address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Drivers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Drivers_vehicle_uuid_fkey"
            columns: ["vehicle_uuid"]
            isOneToOne: false
            referencedRelation: "Vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_vendor_uuid_fkey"
            columns: ["vendor_uuid"]
            isOneToOne: false
            referencedRelation: "Vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverScoreCardStats: {
        Row: {
          id: string
          key: string
          last_updated: string
          value: number
          year: number
        }
        Insert: {
          id?: string
          key: string
          last_updated?: string
          value?: number
          year: number
        }
        Update: {
          id?: string
          key?: string
          last_updated?: string
          value?: number
          year?: number
        }
        Relationships: []
      }
      DriverScorecardStatsPerDriver: {
        Row: {
          distance_meters: number
          drive_minutes: number
          driver_uuid: string
          id: string
          last_updated: string
          pay_cents: number
          trip_count: number
          year: number
        }
        Insert: {
          distance_meters?: number
          drive_minutes?: number
          driver_uuid: string
          id?: string
          last_updated?: string
          pay_cents?: number
          trip_count?: number
          year: number
        }
        Update: {
          distance_meters?: number
          drive_minutes?: number
          driver_uuid?: string
          id?: string
          last_updated?: string
          pay_cents?: number
          trip_count?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "DriverScorecardStatsPerDriver_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverSurveyQuestions: {
        Row: {
          created_at: string
          follow_up_max_score: number | null
          follow_up_prompt: string | null
          id: string
          is_active: boolean
          is_required: boolean
          kind: string
          prompt: string
          sort_order: number
          survey_uuid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          follow_up_max_score?: number | null
          follow_up_prompt?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          kind?: string
          prompt: string
          sort_order?: number
          survey_uuid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          follow_up_max_score?: number | null
          follow_up_prompt?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          kind?: string
          prompt?: string
          sort_order?: number
          survey_uuid?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "DriverSurveyQuestions_survey_uuid_fkey"
            columns: ["survey_uuid"]
            isOneToOne: false
            referencedRelation: "DriverSurveys"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverSurveyResponses: {
        Row: {
          app_platform: string | null
          app_version: string | null
          created_at: string
          driver_uuid: string
          id: string
          prompt_snapshot: string
          question_uuid: string
          reason_text: string | null
          score: number | null
          submission_uuid: string
          submitted_at: string
          survey_uuid: string
          user_uuid: string | null
        }
        Insert: {
          app_platform?: string | null
          app_version?: string | null
          created_at?: string
          driver_uuid: string
          id?: string
          prompt_snapshot: string
          question_uuid: string
          reason_text?: string | null
          score?: number | null
          submission_uuid: string
          submitted_at?: string
          survey_uuid: string
          user_uuid?: string | null
        }
        Update: {
          app_platform?: string | null
          app_version?: string | null
          created_at?: string
          driver_uuid?: string
          id?: string
          prompt_snapshot?: string
          question_uuid?: string
          reason_text?: string | null
          score?: number | null
          submission_uuid?: string
          submitted_at?: string
          survey_uuid?: string
          user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "DriverSurveyResponses_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DriverSurveyResponses_question_uuid_fkey"
            columns: ["question_uuid"]
            isOneToOne: false
            referencedRelation: "DriverSurveyQuestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DriverSurveyResponses_survey_uuid_fkey"
            columns: ["survey_uuid"]
            isOneToOne: false
            referencedRelation: "DriverSurveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "DriverSurveyResponses_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverSurveys: {
        Row: {
          created_at: string
          id: string
          interval_days: number
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_days?: number
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_days?: number
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      DriverUnavailability: {
        Row: {
          date_unavailable: string
          driver_uuid: string | null
          id: string
          updated_at: string
        }
        Insert: {
          date_unavailable: string
          driver_uuid?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          date_unavailable?: string
          driver_uuid?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "DriverUnavailability_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      DriverZones: {
        Row: {
          created_at: string
          driver_uuid: string
          id: string
          zone_uuid: string
        }
        Insert: {
          created_at?: string
          driver_uuid: string
          id?: string
          zone_uuid: string
        }
        Update: {
          created_at?: string
          driver_uuid?: string
          id?: string
          zone_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "driverzones_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driverzones_zone_uuid_fkey"
            columns: ["zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
      EmailTemplateAttachments: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          storage_path: string
          template_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          template_id: string
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "EmailTemplateAttachments_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EmailTemplateAttachments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "EmailTemplates"
            referencedColumns: ["id"]
          },
        ]
      }
      EmailTemplates: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          deleted_at: string | null
          edited_by_user_uuid: string | null
          error_message: string | null
          html_body: string
          id: string
          is_active: boolean
          name: string
          subject: string
          trigger_uuid: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted_at?: string | null
          edited_by_user_uuid?: string | null
          error_message?: string | null
          html_body?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          trigger_uuid: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted_at?: string | null
          edited_by_user_uuid?: string | null
          error_message?: string | null
          html_body?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          trigger_uuid?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "EmailTemplates_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EmailTemplates_edited_by_user_uuid_fkey"
            columns: ["edited_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EmailTemplates_trigger_uuid_fkey"
            columns: ["trigger_uuid"]
            isOneToOne: false
            referencedRelation: "EmailTriggerBindings"
            referencedColumns: ["id"]
          },
        ]
      }
      EmailTriggerBindings: {
        Row: {
          created_at: string
          id: string
          sales_office_uuid: string
          trigger: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          sales_office_uuid: string
          trigger: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          sales_office_uuid?: string
          trigger?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "EmailTriggerBindings_sales_office_uuid_fkey"
            columns: ["sales_office_uuid"]
            isOneToOne: false
            referencedRelation: "SalesOffices"
            referencedColumns: ["id"]
          },
        ]
      }
      EventAttachments: {
        Row: {
          created_at: string
          event_uuid: string
          file_name: string
          id: string
          storage_path: string
          uploaded_by_user_uuid: string | null
        }
        Insert: {
          created_at?: string
          event_uuid: string
          file_name: string
          id?: string
          storage_path: string
          uploaded_by_user_uuid?: string | null
        }
        Update: {
          created_at?: string
          event_uuid?: string
          file_name?: string
          id?: string
          storage_path?: string
          uploaded_by_user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "EventAttachments_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventAttachments_uploaded_by_user_uuid_fkey"
            columns: ["uploaded_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      EventChangeLog: {
        Row: {
          action_type: string
          changed_at: string
          changed_by_user_uuid: string | null
          event_uuid: string
          field_name: string | null
          id: string
          next_value: string | null
          prev_value: string | null
        }
        Insert: {
          action_type?: string
          changed_at?: string
          changed_by_user_uuid?: string | null
          event_uuid: string
          field_name?: string | null
          id?: string
          next_value?: string | null
          prev_value?: string | null
        }
        Update: {
          action_type?: string
          changed_at?: string
          changed_by_user_uuid?: string | null
          event_uuid?: string
          field_name?: string | null
          id?: string
          next_value?: string | null
          prev_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "EventChangeLog_changed_by_user_uuid_fkey"
            columns: ["changed_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventChangeLog_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
        ]
      }
      EventEmailLog: {
        Row: {
          event_uuid: string
          fired_at: string
          id: string
          reason: string | null
          status: Database["public"]["Enums"]["email_send_status"]
          template_id: string | null
          to_email: string | null
          trigger: string
        }
        Insert: {
          event_uuid: string
          fired_at?: string
          id?: string
          reason?: string | null
          status: Database["public"]["Enums"]["email_send_status"]
          template_id?: string | null
          to_email?: string | null
          trigger: string
        }
        Update: {
          event_uuid?: string
          fired_at?: string
          id?: string
          reason?: string | null
          status?: Database["public"]["Enums"]["email_send_status"]
          template_id?: string | null
          to_email?: string | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventEmailLog_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventEmailLog_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "EmailTemplates"
            referencedColumns: ["id"]
          },
        ]
      }
      EventFiles: {
        Row: {
          created_at: string
          event_uuid: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          source: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          event_uuid: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          source?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          event_uuid?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          source?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "EventFiles_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
        ]
      }
      EventLineItems: {
        Row: {
          bleacher_type_uuid: string | null
          created_at: string
          created_by_user_uuid: string | null
          currency: Database["public"]["Enums"]["currency"]
          deleted: boolean
          description: string | null
          event_uuid: string | null
          header: string
          id: string
          is_template: boolean
          quantity: number | null
          value_cents: number
        }
        Insert: {
          bleacher_type_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          currency: Database["public"]["Enums"]["currency"]
          deleted?: boolean
          description?: string | null
          event_uuid?: string | null
          header: string
          id?: string
          is_template?: boolean
          quantity?: number | null
          value_cents: number
        }
        Update: {
          bleacher_type_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          currency?: Database["public"]["Enums"]["currency"]
          deleted?: boolean
          description?: string | null
          event_uuid?: string | null
          header?: string
          id?: string
          is_template?: boolean
          quantity?: number | null
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "EventLineItems_bleacher_type_uuid_fkey"
            columns: ["bleacher_type_uuid"]
            isOneToOne: false
            referencedRelation: "BleacherTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventLineItems_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventLineItems_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
        ]
      }
      EventMessageMentions: {
        Row: {
          created_at: string
          id: string
          mentioned_user_uuid: string
          message_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_user_uuid: string
          message_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_user_uuid?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventMessageMentions_mentioned_user_uuid_fkey"
            columns: ["mentioned_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventMessageMentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "EventMessages"
            referencedColumns: ["id"]
          },
        ]
      }
      EventMessageReadReceipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_uuid: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_uuid: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventMessageReadReceipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "EventMessages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventMessageReadReceipts_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      EventMessages: {
        Row: {
          body: string
          created_at: string
          edited_at: string | null
          event_uuid: string
          id: string
          is_system: boolean
          reply_to_message_id: string | null
          user_uuid: string
        }
        Insert: {
          body: string
          created_at?: string
          edited_at?: string | null
          event_uuid: string
          id?: string
          is_system?: boolean
          reply_to_message_id?: string | null
          user_uuid: string
        }
        Update: {
          body?: string
          created_at?: string
          edited_at?: string | null
          event_uuid?: string
          id?: string
          is_system?: boolean
          reply_to_message_id?: string | null
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventMessages_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventMessages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "EventMessages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventMessages_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Events: {
        Row: {
          address_uuid: string | null
          booked_at: string | null
          contact_uuid: string | null
          content_hash: string | null
          contract_hash: string | null
          contract_revenue_cents: number | null
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          event_end: string
          event_name: string
          event_start: string
          event_status: Database["public"]["Enums"]["event_status"] | null
          event_type_uuid: string | null
          external_notes: string | null
          fifteen_row: number | null
          finance_contact_uuid: string | null
          goodshuffle_url: string | null
          hsl_hue: number | null
          id: string
          internal_notes: string | null
          invoice_number: number | null
          is_qbo: boolean
          lenient: boolean
          must_be_clean: boolean
          notes: string | null
          po_number: string | null
          quote_valid_till: string | null
          sales_office_uuid: string | null
          setup_start: string | null
          seven_row: number | null
          tax_amount_cents: number | null
          tax_percent: number | null
          teardown_end: string | null
          ten_row: number | null
          terms_and_conditions_uuid: string | null
          total_seats: number | null
        }
        Insert: {
          address_uuid?: string | null
          booked_at?: string | null
          contact_uuid?: string | null
          content_hash?: string | null
          contract_hash?: string | null
          contract_revenue_cents?: number | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          event_end: string
          event_name: string
          event_start: string
          event_status?: Database["public"]["Enums"]["event_status"] | null
          event_type_uuid?: string | null
          external_notes?: string | null
          fifteen_row?: number | null
          finance_contact_uuid?: string | null
          goodshuffle_url?: string | null
          hsl_hue?: number | null
          id?: string
          internal_notes?: string | null
          invoice_number?: number | null
          is_qbo?: boolean
          lenient: boolean
          must_be_clean?: boolean
          notes?: string | null
          po_number?: string | null
          quote_valid_till?: string | null
          sales_office_uuid?: string | null
          setup_start?: string | null
          seven_row?: number | null
          tax_amount_cents?: number | null
          tax_percent?: number | null
          teardown_end?: string | null
          ten_row?: number | null
          terms_and_conditions_uuid?: string | null
          total_seats?: number | null
        }
        Update: {
          address_uuid?: string | null
          booked_at?: string | null
          contact_uuid?: string | null
          content_hash?: string | null
          contract_hash?: string | null
          contract_revenue_cents?: number | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          event_end?: string
          event_name?: string
          event_start?: string
          event_status?: Database["public"]["Enums"]["event_status"] | null
          event_type_uuid?: string | null
          external_notes?: string | null
          fifteen_row?: number | null
          finance_contact_uuid?: string | null
          goodshuffle_url?: string | null
          hsl_hue?: number | null
          id?: string
          internal_notes?: string | null
          invoice_number?: number | null
          is_qbo?: boolean
          lenient?: boolean
          must_be_clean?: boolean
          notes?: string | null
          po_number?: string | null
          quote_valid_till?: string | null
          sales_office_uuid?: string | null
          setup_start?: string | null
          seven_row?: number | null
          tax_amount_cents?: number | null
          tax_percent?: number | null
          teardown_end?: string | null
          ten_row?: number | null
          terms_and_conditions_uuid?: string | null
          total_seats?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "Events_address_uuid_fkey"
            columns: ["address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_contact_uuid_fkey"
            columns: ["contact_uuid"]
            isOneToOne: false
            referencedRelation: "Contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_event_type_uuid_fkey"
            columns: ["event_type_uuid"]
            isOneToOne: false
            referencedRelation: "EventTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_finance_contact_uuid_fkey"
            columns: ["finance_contact_uuid"]
            isOneToOne: false
            referencedRelation: "Contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_sales_office_uuid_fkey"
            columns: ["sales_office_uuid"]
            isOneToOne: false
            referencedRelation: "SalesOffices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Events_terms_and_conditions_uuid_fkey"
            columns: ["terms_and_conditions_uuid"]
            isOneToOne: false
            referencedRelation: "TermsAndConditions"
            referencedColumns: ["id"]
          },
        ]
      }
      EventSubscriptions: {
        Row: {
          created_at: string
          event_uuid: string
          id: string
          unread: boolean
          user_uuid: string
        }
        Insert: {
          created_at?: string
          event_uuid: string
          id?: string
          unread?: boolean
          user_uuid: string
        }
        Update: {
          created_at?: string
          event_uuid?: string
          id?: string
          unread?: boolean
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventSubscriptions_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventSubscriptions_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      EventTypes: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventTypes_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      EventTypingIndicators: {
        Row: {
          event_uuid: string
          id: string
          is_typing: boolean
          updated_at: string
          user_uuid: string
        }
        Insert: {
          event_uuid: string
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_uuid: string
        }
        Update: {
          event_uuid?: string
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "EventTypingIndicators_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "EventTypingIndicators_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      HomeBases: {
        Row: {
          created_at: string
          home_base_name: string
          id: string
        }
        Insert: {
          created_at?: string
          home_base_name: string
          id?: string
        }
        Update: {
          created_at?: string
          home_base_name?: string
          id?: string
        }
        Relationships: []
      }
      InspectionPhotos: {
        Row: {
          attempts: number
          caption: string | null
          created_at: string
          gallery_asset_id: string | null
          id: string
          inspection_uuid: string
          last_attempt_at: string | null
          last_error: string | null
          storage_path: string
          upload_status: string
        }
        Insert: {
          attempts?: number
          caption?: string | null
          created_at?: string
          gallery_asset_id?: string | null
          id?: string
          inspection_uuid: string
          last_attempt_at?: string | null
          last_error?: string | null
          storage_path: string
          upload_status?: string
        }
        Update: {
          attempts?: number
          caption?: string | null
          created_at?: string
          gallery_asset_id?: string | null
          id?: string
          inspection_uuid?: string
          last_attempt_at?: string | null
          last_error?: string | null
          storage_path?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "InspectionPhotos_inspection_uuid_fkey"
            columns: ["inspection_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerInspections"
            referencedColumns: ["id"]
          },
        ]
      }
      InspectionQuestions: {
        Row: {
          id: string
          is_active: boolean
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          required: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          question_text: string
          question_type?: Database["public"]["Enums"]["question_type"]
          required?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          required?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      Maintainers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          user_uuid: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintainers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      MaintenanceEvents: {
        Row: {
          address_uuid: string | null
          cost_cents: number | null
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          event_end: string
          event_name: string
          event_start: string
          id: string
          notes: string | null
        }
        Insert: {
          address_uuid?: string | null
          cost_cents?: number | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          event_end: string
          event_name?: string
          event_start: string
          id?: string
          notes?: string | null
        }
        Update: {
          address_uuid?: string | null
          cost_cents?: number | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          event_end?: string
          event_name?: string
          event_start?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "MaintenanceEvents_address_uuid_fkey"
            columns: ["address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "MaintenanceEvents_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      MaintenancePhotos: {
        Row: {
          created_at: string
          id: string
          maintenance_event_uuid: string
          photo_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          maintenance_event_uuid: string
          photo_path: string
        }
        Update: {
          created_at?: string
          id?: string
          maintenance_event_uuid?: string
          photo_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "MaintenancePhotos_maintenance_event_uuid_fkey"
            columns: ["maintenance_event_uuid"]
            isOneToOne: false
            referencedRelation: "MaintenanceEvents"
            referencedColumns: ["id"]
          },
        ]
      }
      Notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          title?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "Notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      PaymentHistory: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          entry_source: string
          event_uuid: string
          id: string
          installment_id: string | null
          intended_installment_id: string | null
          notes: string | null
          paid_at: string | null
          payer_email: string | null
          payer_name: string
          payment_method_type: string | null
          recorded_by_user_uuid: string | null
          reference: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_connection_uuid: string | null
          stripe_payment_intent_id: string | null
          stripe_receipt_url: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          entry_source?: string
          event_uuid: string
          id?: string
          installment_id?: string | null
          intended_installment_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_name: string
          payment_method_type?: string | null
          recorded_by_user_uuid?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_connection_uuid?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          entry_source?: string
          event_uuid?: string
          id?: string
          installment_id?: string | null
          intended_installment_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payer_email?: string | null
          payer_name?: string
          payment_method_type?: string | null
          recorded_by_user_uuid?: string | null
          reference?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_connection_uuid?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "PaymentHistory_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "PaymentHistory_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "PaymentInstallments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "PaymentHistory_recorded_by_user_uuid_fkey"
            columns: ["recorded_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "PaymentHistory_stripe_connection_uuid_fkey"
            columns: ["stripe_connection_uuid"]
            isOneToOne: false
            referencedRelation: "StripeConnections"
            referencedColumns: ["id"]
          },
        ]
      }
      PaymentInstallments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: Database["public"]["Enums"]["currency"]
          due_date: string
          event_uuid: string
          id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency"]
          due_date: string
          event_uuid: string
          id?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency"]
          due_date?: string
          event_uuid?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "PaymentInstallments_event_uuid_fkey"
            columns: ["event_uuid"]
            isOneToOne: false
            referencedRelation: "Events"
            referencedColumns: ["id"]
          },
        ]
      }
      PriceDurations: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          id: string
          max_days: number
          min_days: number
          name: string
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          max_days: number
          min_days: number
          name: string
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          max_days?: number
          min_days?: number
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "PriceDurations_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      Prices: {
        Row: {
          bleacher_type_uuid: string
          created_at: string
          created_by_user_uuid: string | null
          currency: Database["public"]["Enums"]["currency"]
          deleted: boolean
          event_type_uuid: string
          id: string
          price_cents: number
          price_duration_uuid: string
        }
        Insert: {
          bleacher_type_uuid: string
          created_at?: string
          created_by_user_uuid?: string | null
          currency: Database["public"]["Enums"]["currency"]
          deleted?: boolean
          event_type_uuid: string
          id?: string
          price_cents: number
          price_duration_uuid: string
        }
        Update: {
          bleacher_type_uuid?: string
          created_at?: string
          created_by_user_uuid?: string | null
          currency?: Database["public"]["Enums"]["currency"]
          deleted?: boolean
          event_type_uuid?: string
          id?: string
          price_cents?: number
          price_duration_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "Prices_bleacher_type_uuid_fkey"
            columns: ["bleacher_type_uuid"]
            isOneToOne: false
            referencedRelation: "BleacherTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Prices_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Prices_event_type_uuid_fkey"
            columns: ["event_type_uuid"]
            isOneToOne: false
            referencedRelation: "EventTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "Prices_price_duration_uuid_fkey"
            columns: ["price_duration_uuid"]
            isOneToOne: false
            referencedRelation: "PriceDurations"
            referencedColumns: ["id"]
          },
        ]
      }
      QboConnections: {
        Row: {
          currency: string | null
          display_name: string
          encrypted_token_value: string
          id: string
          qbo_tax_code_id: string | null
          realm_id: string | null
        }
        Insert: {
          currency?: string | null
          display_name: string
          encrypted_token_value: string
          id?: string
          qbo_tax_code_id?: string | null
          realm_id?: string | null
        }
        Update: {
          currency?: string | null
          display_name?: string
          encrypted_token_value?: string
          id?: string
          qbo_tax_code_id?: string | null
          realm_id?: string | null
        }
        Relationships: []
      }
      RoadmapAttachments: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          parent_id: string
          parent_type: Database["public"]["Enums"]["roadmap_attachment_parent_type"]
          storage_bucket: string
          storage_path: string
          uploaded_by_user_uuid: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          parent_id: string
          parent_type: Database["public"]["Enums"]["roadmap_attachment_parent_type"]
          storage_bucket: string
          storage_path: string
          uploaded_by_user_uuid?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          parent_id?: string
          parent_type?: Database["public"]["Enums"]["roadmap_attachment_parent_type"]
          storage_bucket?: string
          storage_path?: string
          uploaded_by_user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapAttachments_uploaded_by_user_uuid_fkey"
            columns: ["uploaded_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapFeatures: {
        Row: {
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          quarter_id: string
          sort_order: number
          status: Database["public"]["Enums"]["roadmap_feature_status"]
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          quarter_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_feature_status"]
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          quarter_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["roadmap_feature_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapFeatures_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "RoadmapQuarters"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapFeatureSprintLabels: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          sprint_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          sprint_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          sprint_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapFeatureSprintLabels_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "RoadmapFeatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapFeatureSprintLabels_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "RoadmapSprints"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapQuarters: {
        Row: {
          created_at: string
          id: string
          quarter: number
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          quarter: number
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          quarter?: number
          year?: number
        }
        Relationships: []
      }
      RoadmapSprints: {
        Row: {
          created_at: string
          end_date: string
          id: string
          quarter_id: string
          sprint_number: number
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          quarter_id: string
          sprint_number: number
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          quarter_id?: string
          sprint_number?: number
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapSprints_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "RoadmapQuarters"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapTaskMessageReadReceipts: {
        Row: {
          id: string
          message_id: string
          read_at: string
          user_uuid: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string
          user_uuid: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskMessageReadReceipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "RoadmapTaskMessages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTaskMessageReadReceipts_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapTaskMessages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_system: boolean
          task_id: string
          user_uuid: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_system?: boolean
          task_id: string
          user_uuid: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_system?: boolean
          task_id?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskMessages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "RoadmapTasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTaskMessages_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapTasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_user_uuid: string | null
          deleted_at: string | null
          description: string | null
          developer_uuid: string | null
          feature_id: string | null
          id: string
          is_backlog: boolean
          sort_order: number
          sprint_id: string | null
          status: Database["public"]["Enums"]["roadmap_task_status"]
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted_at?: string | null
          description?: string | null
          developer_uuid?: string | null
          feature_id?: string | null
          id?: string
          is_backlog?: boolean
          sort_order?: number
          sprint_id?: string | null
          status?: Database["public"]["Enums"]["roadmap_task_status"]
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted_at?: string | null
          description?: string | null
          developer_uuid?: string | null
          feature_id?: string | null
          id?: string
          is_backlog?: boolean
          sort_order?: number
          sprint_id?: string | null
          status?: Database["public"]["Enums"]["roadmap_task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapTasks_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTasks_developer_uuid_fkey"
            columns: ["developer_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTasks_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "RoadmapFeatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "RoadmapSprints"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapTaskSubscriptions: {
        Row: {
          created_at: string
          id: string
          task_id: string
          user_uuid: string
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          user_uuid: string
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskSubscriptions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "RoadmapTasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTaskSubscriptions_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      RoadmapTaskTypingIndicators: {
        Row: {
          id: string
          is_typing: boolean
          task_id: string
          updated_at: string
          user_uuid: string
        }
        Insert: {
          id?: string
          is_typing?: boolean
          task_id: string
          updated_at?: string
          user_uuid: string
        }
        Update: {
          id?: string
          is_typing?: boolean
          task_id?: string
          updated_at?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskTypingIndicators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "RoadmapTasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "RoadmapTaskTypingIndicators_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      SalesOffices: {
        Row: {
          address_uuid: string | null
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          id: string
          name: string
          phone: string | null
          quickbook_uuid: string
          stripe_connection_uuid: string | null
        }
        Insert: {
          address_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name: string
          phone?: string | null
          quickbook_uuid: string
          stripe_connection_uuid?: string | null
        }
        Update: {
          address_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          id?: string
          name?: string
          phone?: string | null
          quickbook_uuid?: string
          stripe_connection_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "SalesOffices_address_uuid_fkey"
            columns: ["address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOffices_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOffices_quickbook_uuid_fkey"
            columns: ["quickbook_uuid"]
            isOneToOne: false
            referencedRelation: "QboConnections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "SalesOffices_stripe_connection_uuid_fkey"
            columns: ["stripe_connection_uuid"]
            isOneToOne: false
            referencedRelation: "StripeConnections"
            referencedColumns: ["id"]
          },
        ]
      }
      ScorecardTargets: {
        Row: {
          account_manager_uuid: string
          created_at: string
          gross_margin_percent_annually: number
          gross_margin_percent_quarterly: number
          gross_margin_percent_weekly: number
          id: string
          quotes_annually: number
          quotes_quarterly: number
          quotes_weekly: number
          sales_annually: number
          sales_quarterly: number
          sales_weekly: number
          updated_at: string
          value_of_revenue_annually_cents: number
          value_of_revenue_quarterly_cents: number
          value_of_revenue_weekly_cents: number
          value_of_sales_annually_cents: number
          value_of_sales_quarterly_cents: number
          value_of_sales_weekly_cents: number
        }
        Insert: {
          account_manager_uuid: string
          created_at?: string
          gross_margin_percent_annually?: number
          gross_margin_percent_quarterly?: number
          gross_margin_percent_weekly?: number
          id?: string
          quotes_annually?: number
          quotes_quarterly?: number
          quotes_weekly?: number
          sales_annually?: number
          sales_quarterly?: number
          sales_weekly?: number
          updated_at?: string
          value_of_revenue_annually_cents?: number
          value_of_revenue_quarterly_cents?: number
          value_of_revenue_weekly_cents?: number
          value_of_sales_annually_cents?: number
          value_of_sales_quarterly_cents?: number
          value_of_sales_weekly_cents?: number
        }
        Update: {
          account_manager_uuid?: string
          created_at?: string
          gross_margin_percent_annually?: number
          gross_margin_percent_quarterly?: number
          gross_margin_percent_weekly?: number
          id?: string
          quotes_annually?: number
          quotes_quarterly?: number
          quotes_weekly?: number
          sales_annually?: number
          sales_quarterly?: number
          sales_weekly?: number
          updated_at?: string
          value_of_revenue_annually_cents?: number
          value_of_revenue_quarterly_cents?: number
          value_of_revenue_weekly_cents?: number
          value_of_sales_annually_cents?: number
          value_of_sales_quarterly_cents?: number
          value_of_sales_weekly_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "ScorecardTargets_account_manager_uuid_fkey"
            columns: ["account_manager_uuid"]
            isOneToOne: true
            referencedRelation: "AccountManagers"
            referencedColumns: ["id"]
          },
        ]
      }
      StorageLocations: {
        Row: {
          address_uuid: string | null
          contact_phone_number: string | null
          created_at: string
          deleted: boolean
          gate_code: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          address_uuid?: string | null
          contact_phone_number?: string | null
          created_at?: string
          deleted?: boolean
          gate_code?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          address_uuid?: string | null
          contact_phone_number?: string | null
          created_at?: string
          deleted?: boolean
          gate_code?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storage_locations_address_uuid_fkey"
            columns: ["address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      StripeConnections: {
        Row: {
          charges_enabled: boolean
          created_at: string
          deleted_at: string | null
          details_submitted: boolean
          id: string
          livemode: boolean
          payouts_enabled: boolean
          stripe_account_id: string | null
          stripe_business_name: string | null
        }
        Insert: {
          charges_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          details_submitted?: boolean
          id?: string
          livemode?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          stripe_business_name?: string | null
        }
        Update: {
          charges_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          details_submitted?: boolean
          id?: string
          livemode?: boolean
          payouts_enabled?: boolean
          stripe_account_id?: string | null
          stripe_business_name?: string | null
        }
        Relationships: []
      }
      SubrentalEvents: {
        Row: {
          bleacher_uuid: string | null
          created_at: string
          created_by_user_uuid: string | null
          event_end: string
          event_start: string
          id: string
          notes: string | null
          requested_zone_uuid: string | null
          reviewed_at: string | null
          reviewed_by_user_uuid: string | null
          status: Database["public"]["Enums"]["bleacher_subrental_status"]
        }
        Insert: {
          bleacher_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          event_end: string
          event_start: string
          id?: string
          notes?: string | null
          requested_zone_uuid?: string | null
          reviewed_at?: string | null
          reviewed_by_user_uuid?: string | null
          status?: Database["public"]["Enums"]["bleacher_subrental_status"]
        }
        Update: {
          bleacher_uuid?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          event_end?: string
          event_start?: string
          id?: string
          notes?: string | null
          requested_zone_uuid?: string | null
          reviewed_at?: string | null
          reviewed_by_user_uuid?: string | null
          status?: Database["public"]["Enums"]["bleacher_subrental_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subrental_events_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subrental_events_requested_zone_uuid_fkey"
            columns: ["requested_zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
      Tasks: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          description: string
          id: string
          name: string
          status: Database["public"]["Enums"]["task_status"] | null
          type: Database["public"]["Enums"]["task_type"] | null
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          description: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["task_status"] | null
          type?: Database["public"]["Enums"]["task_type"] | null
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          description?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["task_status"] | null
          type?: Database["public"]["Enums"]["task_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "Tasks_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      TermsAndConditions: {
        Row: {
          created_at: string
          created_by_user_uuid: string | null
          deleted: boolean
          html_content: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          html_content?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by_user_uuid?: string | null
          deleted?: boolean
          html_content?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "TermsAndConditions_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      UserAlerts: {
        Row: {
          alert_uuid: string
          created_at: string
          dismissed: boolean
          dismissed_until: string | null
          id: string
          user_uuid: string
        }
        Insert: {
          alert_uuid: string
          created_at?: string
          dismissed?: boolean
          dismissed_until?: string | null
          id?: string
          user_uuid: string
        }
        Update: {
          alert_uuid?: string
          created_at?: string
          dismissed?: boolean
          dismissed_until?: string | null
          id?: string
          user_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "useralerts_alert_uuid_fkey"
            columns: ["alert_uuid"]
            isOneToOne: false
            referencedRelation: "Alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "useralerts_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      UserHomeBases: {
        Row: {
          created_at: string
          home_base_uuid: string | null
          id: string
          user_uuid: string | null
        }
        Insert: {
          created_at?: string
          home_base_uuid?: string | null
          id?: string
          user_uuid?: string | null
        }
        Update: {
          created_at?: string
          home_base_uuid?: string | null
          id?: string
          user_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "userhomebases_home_base_uuid_fkey"
            columns: ["home_base_uuid"]
            isOneToOne: false
            referencedRelation: "HomeBases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "UserHomeBases_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
        ]
      }
      UserRoles: {
        Row: {
          created_at: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      Users: {
        Row: {
          avatar_image_url: string | null
          changelog_last_read_at: string | null
          clerk_user_id: string | null
          created_at: string
          email: string
          expo_push_token: string | null
          first_name: string | null
          id: string
          inspection_queue_last_seen_at: string | null
          is_admin: boolean
          is_viewer: boolean
          last_name: string | null
          phone: string | null
          role: number | null
          status_uuid: string | null
        }
        Insert: {
          avatar_image_url?: string | null
          changelog_last_read_at?: string | null
          clerk_user_id?: string | null
          created_at?: string
          email: string
          expo_push_token?: string | null
          first_name?: string | null
          id?: string
          inspection_queue_last_seen_at?: string | null
          is_admin?: boolean
          is_viewer?: boolean
          last_name?: string | null
          phone?: string | null
          role?: number | null
          status_uuid?: string | null
        }
        Update: {
          avatar_image_url?: string | null
          changelog_last_read_at?: string | null
          clerk_user_id?: string | null
          created_at?: string
          email?: string
          expo_push_token?: string | null
          first_name?: string | null
          id?: string
          inspection_queue_last_seen_at?: string | null
          is_admin?: boolean
          is_viewer?: boolean
          last_name?: string | null
          phone?: string | null
          role?: number | null
          status_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Users_status_uuid_fkey"
            columns: ["status_uuid"]
            isOneToOne: false
            referencedRelation: "UserStatuses"
            referencedColumns: ["id"]
          },
        ]
      }
      UserStatuses: {
        Row: {
          created_at: string
          id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      Vehicles: {
        Row: {
          created_at: string
          id: string
          make: string
          model: string
          vin_number: string | null
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          make: string
          model: string
          vin_number?: string | null
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          make?: string
          model?: string
          vin_number?: string | null
          year?: number
        }
        Relationships: []
      }
      Vendors: {
        Row: {
          created_at: string
          display_name: string
          ein: string | null
          hst: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          qbo_connection_uuid: string | null
          qbo_vendor_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          ein?: string | null
          hst?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          qbo_connection_uuid?: string | null
          qbo_vendor_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          ein?: string | null
          hst?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          qbo_connection_uuid?: string | null
          qbo_vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_qbo_connection_uuid_fkey"
            columns: ["qbo_connection_uuid"]
            isOneToOne: false
            referencedRelation: "QboConnections"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackerGroups: {
        Row: {
          created_at: string
          driver_uuid: string
          id: string
          qbo_bill_id: string | null
          status: Database["public"]["Enums"]["worktracker_group_status"]
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string
          driver_uuid: string
          id?: string
          qbo_bill_id?: string | null
          status?: Database["public"]["Enums"]["worktracker_group_status"]
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string
          driver_uuid?: string
          id?: string
          qbo_bill_id?: string | null
          status?: Database["public"]["Enums"]["worktracker_group_status"]
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "worktrackergroups_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackerInspections: {
        Row: {
          answers_json: string | null
          bleacher_uuid: string | null
          created_at: string
          id: string
          issue_description: string | null
          issues_found: boolean
          walk_around_complete: boolean
        }
        Insert: {
          answers_json?: string | null
          bleacher_uuid?: string | null
          created_at?: string
          id?: string
          issue_description?: string | null
          issues_found?: boolean
          walk_around_complete?: boolean
        }
        Update: {
          answers_json?: string | null
          bleacher_uuid?: string | null
          created_at?: string
          id?: string
          issue_description?: string | null
          issues_found?: boolean
          walk_around_complete?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "WorkTrackerInspections_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackerLineItems: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_automatically_managed: boolean
          qty_decimal: number
          quantity: number
          type: Database["public"]["Enums"]["work_tracker_line_item_type"]
          unit_amt_cents: number
          work_tracker_uuid: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_automatically_managed?: boolean
          qty_decimal?: number
          quantity?: number
          type: Database["public"]["Enums"]["work_tracker_line_item_type"]
          unit_amt_cents?: number
          work_tracker_uuid: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_automatically_managed?: boolean
          qty_decimal?: number
          quantity?: number
          type?: Database["public"]["Enums"]["work_tracker_line_item_type"]
          unit_amt_cents?: number
          work_tracker_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tracker_line_items_work_tracker_uuid_fkey"
            columns: ["work_tracker_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackers"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackers: {
        Row: {
          abandoned_at: string | null
          accepted_at: string | null
          actual_bleacher_uuid: string | null
          bleacher_change_reason: string | null
          bleacher_uuid: string | null
          bol_number: string | null
          completed_at: string | null
          created_at: string
          created_by_user_uuid: string | null
          date: string | null
          declined_at: string | null
          distance_meters: number | null
          drive_minutes: number | null
          driver_uuid: string | null
          dropoff_address_uuid: string | null
          dropoff_instructions: string | null
          dropoff_poc: string | null
          dropoff_poc_contact_uuid: string | null
          dropoff_time: string | null
          dropoff_time_end: string | null
          dropoff_time_mode: Database["public"]["Enums"]["work_tracker_time_mode"]
          dropoff_time_start: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          pay_cents: number | null
          pickup_address_uuid: string | null
          pickup_instructions: string | null
          pickup_poc: string | null
          pickup_poc_contact_uuid: string | null
          pickup_time: string | null
          pickup_time_end: string | null
          pickup_time_mode: Database["public"]["Enums"]["work_tracker_time_mode"]
          pickup_time_start: string | null
          post_inspection_uuid: string | null
          pre_inspection_uuid: string | null
          project_number: string | null
          released_at: string | null
          setup_required: boolean
          started_at: string | null
          status: Database["public"]["Enums"]["worktracker_status"]
          teardown_required: boolean
          updated_at: string
          user_uuid: string | null
          work_tracker_type_uuid: string | null
          worktracker_group_uuid: string | null
        }
        Insert: {
          abandoned_at?: string | null
          accepted_at?: string | null
          actual_bleacher_uuid?: string | null
          bleacher_change_reason?: string | null
          bleacher_uuid?: string | null
          bol_number?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          date?: string | null
          declined_at?: string | null
          distance_meters?: number | null
          drive_minutes?: number | null
          driver_uuid?: string | null
          dropoff_address_uuid?: string | null
          dropoff_instructions?: string | null
          dropoff_poc?: string | null
          dropoff_poc_contact_uuid?: string | null
          dropoff_time?: string | null
          dropoff_time_end?: string | null
          dropoff_time_mode?: Database["public"]["Enums"]["work_tracker_time_mode"]
          dropoff_time_start?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          pay_cents?: number | null
          pickup_address_uuid?: string | null
          pickup_instructions?: string | null
          pickup_poc?: string | null
          pickup_poc_contact_uuid?: string | null
          pickup_time?: string | null
          pickup_time_end?: string | null
          pickup_time_mode?: Database["public"]["Enums"]["work_tracker_time_mode"]
          pickup_time_start?: string | null
          post_inspection_uuid?: string | null
          pre_inspection_uuid?: string | null
          project_number?: string | null
          released_at?: string | null
          setup_required?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["worktracker_status"]
          teardown_required?: boolean
          updated_at?: string
          user_uuid?: string | null
          work_tracker_type_uuid?: string | null
          worktracker_group_uuid?: string | null
        }
        Update: {
          abandoned_at?: string | null
          accepted_at?: string | null
          actual_bleacher_uuid?: string | null
          bleacher_change_reason?: string | null
          bleacher_uuid?: string | null
          bol_number?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_uuid?: string | null
          date?: string | null
          declined_at?: string | null
          distance_meters?: number | null
          drive_minutes?: number | null
          driver_uuid?: string | null
          dropoff_address_uuid?: string | null
          dropoff_instructions?: string | null
          dropoff_poc?: string | null
          dropoff_poc_contact_uuid?: string | null
          dropoff_time?: string | null
          dropoff_time_end?: string | null
          dropoff_time_mode?: Database["public"]["Enums"]["work_tracker_time_mode"]
          dropoff_time_start?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          pay_cents?: number | null
          pickup_address_uuid?: string | null
          pickup_instructions?: string | null
          pickup_poc?: string | null
          pickup_poc_contact_uuid?: string | null
          pickup_time?: string | null
          pickup_time_end?: string | null
          pickup_time_mode?: Database["public"]["Enums"]["work_tracker_time_mode"]
          pickup_time_start?: string | null
          post_inspection_uuid?: string | null
          pre_inspection_uuid?: string | null
          project_number?: string | null
          released_at?: string | null
          setup_required?: boolean
          started_at?: string | null
          status?: Database["public"]["Enums"]["worktracker_status"]
          teardown_required?: boolean
          updated_at?: string
          user_uuid?: string | null
          work_tracker_type_uuid?: string | null
          worktracker_group_uuid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "WorkTrackers_actual_bleacher_uuid_fkey"
            columns: ["actual_bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_bleacher_uuid_fkey"
            columns: ["bleacher_uuid"]
            isOneToOne: false
            referencedRelation: "Bleachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_created_by_user_uuid_fkey"
            columns: ["created_by_user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_driver_uuid_fkey"
            columns: ["driver_uuid"]
            isOneToOne: false
            referencedRelation: "Drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worktrackers_dropoff_address_uuid_fkey"
            columns: ["dropoff_address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_dropoff_poc_contact_uuid_fkey"
            columns: ["dropoff_poc_contact_uuid"]
            isOneToOne: false
            referencedRelation: "Contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worktrackers_pickup_address_uuid_fkey"
            columns: ["pickup_address_uuid"]
            isOneToOne: false
            referencedRelation: "Addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_pickup_poc_contact_uuid_fkey"
            columns: ["pickup_poc_contact_uuid"]
            isOneToOne: false
            referencedRelation: "Contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_post_inspection_uuid_fkey"
            columns: ["post_inspection_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerInspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_pre_inspection_uuid_fkey"
            columns: ["pre_inspection_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerInspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "WorkTrackers_user_uuid_fkey"
            columns: ["user_uuid"]
            isOneToOne: false
            referencedRelation: "Users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worktrackers_work_tracker_type_uuid_fkey"
            columns: ["work_tracker_type_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerTypes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worktrackers_worktracker_group_uuid_fkey"
            columns: ["worktracker_group_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerGroups"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackerTypeQboAccounts: {
        Row: {
          created_at: string
          id: string
          qbo_account_id: string
          qbo_connection_uuid: string
          work_tracker_type_uuid: string
        }
        Insert: {
          created_at?: string
          id?: string
          qbo_account_id: string
          qbo_connection_uuid: string
          work_tracker_type_uuid: string
        }
        Update: {
          created_at?: string
          id?: string
          qbo_account_id?: string
          qbo_connection_uuid?: string
          work_tracker_type_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "worktrackertypeqboaccounts_conn_fkey"
            columns: ["qbo_connection_uuid"]
            isOneToOne: false
            referencedRelation: "QboConnections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worktrackertypeqboaccounts_type_fkey"
            columns: ["work_tracker_type_uuid"]
            isOneToOne: false
            referencedRelation: "WorkTrackerTypes"
            referencedColumns: ["id"]
          },
        ]
      }
      WorkTrackerTypes: {
        Row: {
          code: Database["public"]["Enums"]["work_tracker_type_code"] | null
          created_at: string
          display_name: string
          id: string
          is_deleted: boolean
          sort_order: number
        }
        Insert: {
          code?: Database["public"]["Enums"]["work_tracker_type_code"] | null
          created_at?: string
          display_name: string
          id?: string
          is_deleted?: boolean
          sort_order?: number
        }
        Update: {
          code?: Database["public"]["Enums"]["work_tracker_type_code"] | null
          created_at?: string
          display_name?: string
          id?: string
          is_deleted?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      ZoneQboClasses: {
        Row: {
          created_at: string
          id: string
          qbo_class_id: string
          qbo_connection_uuid: string
          zone_uuid: string
        }
        Insert: {
          created_at?: string
          id?: string
          qbo_class_id: string
          qbo_connection_uuid: string
          zone_uuid: string
        }
        Update: {
          created_at?: string
          id?: string
          qbo_class_id?: string
          qbo_connection_uuid?: string
          zone_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoneqboclasses_qbo_connection_uuid_fkey"
            columns: ["qbo_connection_uuid"]
            isOneToOne: false
            referencedRelation: "QboConnections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoneqboclasses_zone_uuid_fkey"
            columns: ["zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
      Zones: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          photo_path: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          photo_path?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          photo_path?: string | null
        }
        Relationships: []
      }
      ZoneStateProvinces: {
        Row: {
          created_at: string
          id: string
          state_province: string
          zone_uuid: string
        }
        Insert: {
          created_at?: string
          id?: string
          state_province: string
          zone_uuid: string
        }
        Update: {
          created_at?: string
          id?: string
          state_province?: string
          zone_uuid?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonestateprovinces_zone_uuid_fkey"
            columns: ["zone_uuid"]
            isOneToOne: false
            referencedRelation: "Zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bleacher_change_reason_label: { Args: { code: string }; Returns: string }
      damage_reports_recompute_photos_uploaded: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      drivers_backfill_document: {
        Args: { p_doc_type: string; p_driver_id: string; p_photo_path: string }
        Returns: undefined
      }
      generate_invoice_number: { Args: never; Returns: number }
      get_current_account_manager_id: { Args: never; Returns: string }
      get_current_driver_id: { Args: never; Returns: string }
      get_current_user_uuid: { Args: never; Returns: string }
      get_user_roles: { Args: never; Returns: string[] }
      get_week_end: { Args: { input_date: string }; Returns: string }
      get_week_start: { Args: { input_date: string }; Returns: string }
      is_current_user_account_manager: { Args: never; Returns: boolean }
      is_current_user_active: { Args: never; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_subscribed_to_event: {
        Args: { p_event_uuid: string }
        Returns: boolean
      }
      recompute_driver_scorecard_bucket: {
        Args: { p_driver: string; p_year: number }
        Returns: undefined
      }
      recompute_maintenance_cost_per_year_bucket: {
        Args: { p_year: number }
        Returns: undefined
      }
      recompute_quote_hashes: {
        Args: { p_event_id: string }
        Returns: undefined
      }
      user_can_manage_zone: { Args: { p_zone_uuid: string }; Returns: boolean }
      user_shares_zone_with_driver: {
        Args: { p_driver_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      alert_entity_type: "event" | "bleacher_event" | "work_tracker"
      bleacher_opening_dir: "driver" | "passenger"
      bleacher_subrental_status: "pending" | "accepted" | "denied"
      bluebook_region: "CAN" | "US" | "Both"
      contract_signature_status: "active" | "invalidated"
      currency: "USD" | "CAD"
      damage_severity: "none" | "minor" | "major"
      email_send_status: "sent" | "failed"
      event_status: "quoted" | "booked" | "lost" | "draft"
      pay_currency_type: "CAD" | "USD"
      pay_per_unit_type: "KM" | "MI" | "HR"
      payment_installment_status: "unpaid" | "paid"
      preferred_language: "english" | "french"
      question_type: "text" | "checkbox" | "photo"
      roadmap_attachment_parent_type: "task" | "feature"
      roadmap_feature_status:
        | "draft"
        | "locked_in"
        | "in_progress"
        | "completed"
      roadmap_task_status: "to_do" | "in_progress" | "completed"
      roof_type: "canopy" | "none"
      task_status:
        | "in_progress"
        | "backlog"
        | "complete"
        | "approved"
        | "in_staging"
        | "paused"
      task_type: "feature" | "bug"
      work_tracker_line_item_type:
        | "hauling"
        | "deadhead"
        | "setup"
        | "teardown"
        | "maintenance"
        | "per_diem"
        | "custom"
      work_tracker_time_mode: "exact" | "flexible" | "any_time"
      work_tracker_type_code:
        | "trip"
        | "repair_maintenance"
        | "site_visit_cleaning_other"
      worktracker_group_status:
        | "draft"
        | "qbo_bill_creating"
        | "qbo_bill_created"
        | "qbo_bill_error"
        | "no_bill_ready_for_payment"
      worktracker_status:
        | "draft"
        | "released"
        | "accepted"
        | "dest_pickup"
        | "pickup_inspection"
        | "dest_dropoff"
        | "dropoff_inspection"
        | "completed"
        | "cancelled"
        | "declined"
        | "abandoned"
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
      alert_entity_type: ["event", "bleacher_event", "work_tracker"],
      bleacher_opening_dir: ["driver", "passenger"],
      bleacher_subrental_status: ["pending", "accepted", "denied"],
      bluebook_region: ["CAN", "US", "Both"],
      contract_signature_status: ["active", "invalidated"],
      currency: ["USD", "CAD"],
      damage_severity: ["none", "minor", "major"],
      email_send_status: ["sent", "failed"],
      event_status: ["quoted", "booked", "lost", "draft"],
      pay_currency_type: ["CAD", "USD"],
      pay_per_unit_type: ["KM", "MI", "HR"],
      payment_installment_status: ["unpaid", "paid"],
      preferred_language: ["english", "french"],
      question_type: ["text", "checkbox", "photo"],
      roadmap_attachment_parent_type: ["task", "feature"],
      roadmap_feature_status: [
        "draft",
        "locked_in",
        "in_progress",
        "completed",
      ],
      roadmap_task_status: ["to_do", "in_progress", "completed"],
      roof_type: ["canopy", "none"],
      task_status: [
        "in_progress",
        "backlog",
        "complete",
        "approved",
        "in_staging",
        "paused",
      ],
      task_type: ["feature", "bug"],
      work_tracker_line_item_type: [
        "hauling",
        "deadhead",
        "setup",
        "teardown",
        "maintenance",
        "per_diem",
        "custom",
      ],
      work_tracker_time_mode: ["exact", "flexible", "any_time"],
      work_tracker_type_code: [
        "trip",
        "repair_maintenance",
        "site_visit_cleaning_other",
      ],
      worktracker_group_status: [
        "draft",
        "qbo_bill_creating",
        "qbo_bill_created",
        "qbo_bill_error",
        "no_bill_ready_for_payment",
      ],
      worktracker_status: [
        "draft",
        "released",
        "accepted",
        "dest_pickup",
        "pickup_inspection",
        "dest_dropoff",
        "dropoff_inspection",
        "completed",
        "cancelled",
        "declined",
        "abandoned",
      ],
    },
  },
} as const

