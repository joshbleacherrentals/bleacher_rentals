export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      AccountManagers: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          user_uuid: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          user_uuid?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          user_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "AccountManagers_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      Addresses: {
        Row: {
          city: string;
          created_at: string;
          id: string;
          state_province: string;
          street: string;
          zip_postal: string | null;
        };
        Insert: {
          city: string;
          created_at?: string;
          id?: string;
          state_province: string;
          street: string;
          zip_postal?: string | null;
        };
        Update: {
          city?: string;
          created_at?: string;
          id?: string;
          state_province?: string;
          street?: string;
          zip_postal?: string | null;
        };
        Relationships: [];
      };
      BleacherEvents: {
        Row: {
          bleacher_uuid: string | null;
          created_at: string;
          event_uuid: string | null;
          id: string;
          setup_confirmed: boolean;
          setup_text: string | null;
          teardown_confirmed: boolean;
          teardown_text: string | null;
        };
        Insert: {
          bleacher_uuid?: string | null;
          created_at?: string;
          event_uuid?: string | null;
          id?: string;
          setup_confirmed?: boolean;
          setup_text?: string | null;
          teardown_confirmed?: boolean;
          teardown_text?: string | null;
        };
        Update: {
          bleacher_uuid?: string | null;
          created_at?: string;
          event_uuid?: string | null;
          id?: string;
          setup_confirmed?: boolean;
          setup_text?: string | null;
          teardown_confirmed?: boolean;
          teardown_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "BleacherEvents_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "BleacherEvents_event_uuid_fkey";
            columns: ["event_uuid"];
            isOneToOne: false;
            referencedRelation: "Events";
            referencedColumns: ["id"];
          },
        ];
      };
      BleacherMaintEvents: {
        Row: {
          bleacher_uuid: string;
          created_at: string;
          id: string;
          maintenance_event_uuid: string;
        };
        Insert: {
          bleacher_uuid: string;
          created_at?: string;
          id?: string;
          maintenance_event_uuid: string;
        };
        Update: {
          bleacher_uuid?: string;
          created_at?: string;
          id?: string;
          maintenance_event_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "BleacherMaintEvents_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "BleacherMaintEvents_maintenance_event_uuid_fkey";
            columns: ["maintenance_event_uuid"];
            isOneToOne: false;
            referencedRelation: "MaintenanceEvents";
            referencedColumns: ["id"];
          },
        ];
      };
      Bleachers: {
        Row: {
          bleacher_number: number;
          bleacher_rows: number;
          bleacher_seats: number;
          created_at: string;
          created_by: string | null;
          deleted: boolean;
          gvwr: number | null;
          height_folded_ft: number | null;
          hitch_type: string | null;
          id: string;
          linxup_device_id: string | null;
          manufacturer: string | null;
          nvis_pdf_path: string | null;
          opening_direction: Database["public"]["Enums"]["bleacher_opening_dir"] | null;
          summer_account_manager_uuid: string | null;
          summer_home_base_uuid: string | null;
          tag_number: string | null;
          trailer_height_in: number | null;
          trailer_length: number | null;
          trailer_length_in: number | null;
          updated_at: string | null;
          updated_by: string | null;
          vin_number: string | null;
          winter_account_manager_uuid: string | null;
          winter_home_base_uuid: string | null;
        };
        Insert: {
          bleacher_number: number;
          bleacher_rows: number;
          bleacher_seats: number;
          created_at?: string;
          created_by?: string | null;
          deleted?: boolean;
          gvwr?: number | null;
          height_folded_ft?: number | null;
          hitch_type?: string | null;
          id?: string;
          linxup_device_id?: string | null;
          manufacturer?: string | null;
          nvis_pdf_path?: string | null;
          opening_direction?: Database["public"]["Enums"]["bleacher_opening_dir"] | null;
          summer_account_manager_uuid?: string | null;
          summer_home_base_uuid?: string | null;
          tag_number?: string | null;
          trailer_height_in?: number | null;
          trailer_length?: number | null;
          trailer_length_in?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          vin_number?: string | null;
          winter_account_manager_uuid?: string | null;
          winter_home_base_uuid?: string | null;
        };
        Update: {
          bleacher_number?: number;
          bleacher_rows?: number;
          bleacher_seats?: number;
          created_at?: string;
          created_by?: string | null;
          deleted?: boolean;
          gvwr?: number | null;
          height_folded_ft?: number | null;
          hitch_type?: string | null;
          id?: string;
          linxup_device_id?: string | null;
          manufacturer?: string | null;
          nvis_pdf_path?: string | null;
          opening_direction?: Database["public"]["Enums"]["bleacher_opening_dir"] | null;
          summer_account_manager_uuid?: string | null;
          summer_home_base_uuid?: string | null;
          tag_number?: string | null;
          trailer_height_in?: number | null;
          trailer_length?: number | null;
          trailer_length_in?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          vin_number?: string | null;
          winter_account_manager_uuid?: string | null;
          winter_home_base_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "Bleachers_summer_account_manager_uuid_fkey";
            columns: ["summer_account_manager_uuid"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bleachers_summer_home_base_uuid_fkey";
            columns: ["summer_home_base_uuid"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "Bleachers_winter_account_manager_uuid_fkey";
            columns: ["winter_account_manager_uuid"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bleachers_winter_home_base_uuid_fkey";
            columns: ["winter_home_base_uuid"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["id"];
          },
        ];
      };
      BleacherUsers: {
        Row: {
          bleacher_uuid: string | null;
          created_at: string;
          id: string;
          season: string;
          user_uuid: string | null;
        };
        Insert: {
          bleacher_uuid?: string | null;
          created_at?: string;
          id?: string;
          season: string;
          user_uuid?: string | null;
        };
        Update: {
          bleacher_uuid?: string | null;
          created_at?: string;
          id?: string;
          season?: string;
          user_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "BleacherUsers_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "BleacherUsers_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      Blocks: {
        Row: {
          bleacher_uuid: string | null;
          created_at: string;
          date: string | null;
          id: string;
          text: string | null;
        };
        Insert: {
          bleacher_uuid?: string | null;
          created_at?: string;
          date?: string | null;
          id?: string;
          text?: string | null;
        };
        Update: {
          bleacher_uuid?: string | null;
          created_at?: string;
          date?: string | null;
          id?: string;
          text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "Blocks_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
        ];
      };
      BlueBook: {
        Row: {
          created_at: string;
          description: string | null;
          document_path: string | null;
          id: string;
          is_active: boolean;
          link: string | null;
          name: string;
          region: Database["public"]["Enums"]["bluebook_region"];
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          document_path?: string | null;
          id?: string;
          is_active?: boolean;
          link?: string | null;
          name: string;
          region?: Database["public"]["Enums"]["bluebook_region"];
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          document_path?: string | null;
          id?: string;
          is_active?: boolean;
          link?: string | null;
          name?: string;
          region?: Database["public"]["Enums"]["bluebook_region"];
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      DamageReportPhotos: {
        Row: {
          created_at: string;
          damage_report_uuid: string;
          id: string;
          photo_path: string;
        };
        Insert: {
          created_at?: string;
          damage_report_uuid: string;
          id?: string;
          photo_path: string;
        };
        Update: {
          created_at?: string;
          damage_report_uuid?: string;
          id?: string;
          photo_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "DamageReportPhotos_damage_report_uuid_fkey";
            columns: ["damage_report_uuid"];
            isOneToOne: false;
            referencedRelation: "DamageReports";
            referencedColumns: ["id"];
          },
        ];
      };
      DamageReports: {
        Row: {
          bleacher_uuid: string;
          created_at: string;
          id: string;
          inspection_uuid: string;
          is_safe_to_haul: boolean;
          is_safe_to_sit: boolean;
          maintenance_event_uuid: string | null;
          note: string | null;
          resolved_at: string | null;
        };
        Insert: {
          bleacher_uuid: string;
          created_at?: string;
          id?: string;
          inspection_uuid: string;
          is_safe_to_haul?: boolean;
          is_safe_to_sit?: boolean;
          maintenance_event_uuid?: string | null;
          note?: string | null;
          resolved_at?: string | null;
        };
        Update: {
          bleacher_uuid?: string;
          created_at?: string;
          id?: string;
          inspection_uuid?: string;
          is_safe_to_haul?: boolean;
          is_safe_to_sit?: boolean;
          maintenance_event_uuid?: string | null;
          note?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "DamageReports_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "DamageReports_inspection_uuid_fkey";
            columns: ["inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "DamageReports_maintenance_event_uuid_fkey";
            columns: ["maintenance_event_uuid"];
            isOneToOne: false;
            referencedRelation: "MaintenanceEvents";
            referencedColumns: ["id"];
          },
        ];
      };
      DashboardFilterSettings: {
        Row: {
          account_manager_uuid: string | null;
          created_at: string;
          id: string;
          only_show_my_events: boolean;
          optimization_mode: boolean;
          rows: string;
          rows_quick_filter: number | null;
          season: string | null;
          show_address_tooltip: boolean;
          state_provinces: string;
          summer_home_base_uuids: string;
          updated_at: string;
          user_uuid: string;
          winter_home_base_uuids: string;
          y_axis: string;
        };
        Insert: {
          account_manager_uuid?: string | null;
          created_at?: string;
          id?: string;
          only_show_my_events?: boolean;
          optimization_mode?: boolean;
          rows?: string;
          rows_quick_filter?: number | null;
          season?: string | null;
          show_address_tooltip?: boolean;
          state_provinces?: string;
          summer_home_base_uuids?: string;
          updated_at?: string;
          user_uuid: string;
          winter_home_base_uuids?: string;
          y_axis?: string;
        };
        Update: {
          account_manager_uuid?: string | null;
          created_at?: string;
          id?: string;
          only_show_my_events?: boolean;
          optimization_mode?: boolean;
          rows?: string;
          rows_quick_filter?: number | null;
          season?: string | null;
          show_address_tooltip?: boolean;
          state_provinces?: string;
          summer_home_base_uuids?: string;
          updated_at?: string;
          user_uuid?: string;
          winter_home_base_uuids?: string;
          y_axis?: string;
        };
        Relationships: [
          {
            foreignKeyName: "DashboardFilterSettings_account_manager_uuid_fkey";
            columns: ["account_manager_uuid"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "DashboardFilterSettings_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: true;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      Developers: {
        Row: {
          auto_subscribe_to_new_tickets: boolean;
          created_at: string;
          id: string;
          is_active: boolean;
          user_uuid: string;
        };
        Insert: {
          auto_subscribe_to_new_tickets?: boolean;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          user_uuid: string;
        };
        Update: {
          auto_subscribe_to_new_tickets?: boolean;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          user_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "Developers_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      Drivers: {
        Row: {
          account_manager_uuid: string | null;
          address_uuid: string | null;
          created_at: string;
          id: string;
          insurance_photo_path: string | null;
          is_active: boolean;
          license_photo_path: string | null;
          medical_card_photo_path: string | null;
          pay_currency: Database["public"]["Enums"]["pay_currency_type"];
          pay_per_unit: Database["public"]["Enums"]["pay_per_unit_type"];
          pay_rate_cents: number;
          phone_number: string | null;
          tax: number;
          user_uuid: string | null;
          vehicle_uuid: string | null;
          vendor_uuid: string | null;
        };
        Insert: {
          account_manager_uuid?: string | null;
          address_uuid?: string | null;
          created_at?: string;
          id?: string;
          insurance_photo_path?: string | null;
          is_active?: boolean;
          license_photo_path?: string | null;
          medical_card_photo_path?: string | null;
          pay_currency?: Database["public"]["Enums"]["pay_currency_type"];
          pay_per_unit?: Database["public"]["Enums"]["pay_per_unit_type"];
          pay_rate_cents?: number;
          phone_number?: string | null;
          tax?: number;
          user_uuid?: string | null;
          vehicle_uuid?: string | null;
          vendor_uuid?: string | null;
        };
        Update: {
          account_manager_uuid?: string | null;
          address_uuid?: string | null;
          created_at?: string;
          id?: string;
          insurance_photo_path?: string | null;
          is_active?: boolean;
          license_photo_path?: string | null;
          medical_card_photo_path?: string | null;
          pay_currency?: Database["public"]["Enums"]["pay_currency_type"];
          pay_per_unit?: Database["public"]["Enums"]["pay_per_unit_type"];
          pay_rate_cents?: number;
          phone_number?: string | null;
          tax?: number;
          user_uuid?: string | null;
          vehicle_uuid?: string | null;
          vendor_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "Drivers_account_manager_uuid_fkey";
            columns: ["account_manager_uuid"];
            isOneToOne: false;
            referencedRelation: "AccountManagers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "Drivers_address_uuid_fkey";
            columns: ["address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "Drivers_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "Drivers_vehicle_uuid_fkey";
            columns: ["vehicle_uuid"];
            isOneToOne: false;
            referencedRelation: "Vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drivers_vendor_uuid_fkey";
            columns: ["vendor_uuid"];
            isOneToOne: false;
            referencedRelation: "Vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      DriverScoreCardStats: {
        Row: {
          id: string;
          key: string;
          last_updated: string;
          value: number;
          year: number;
        };
        Insert: {
          id?: string;
          key: string;
          last_updated?: string;
          value?: number;
          year: number;
        };
        Update: {
          id?: string;
          key?: string;
          last_updated?: string;
          value?: number;
          year?: number;
        };
        Relationships: [];
      };
      DriverScorecardStatsPerDriver: {
        Row: {
          distance_meters: number;
          drive_minutes: number;
          driver_uuid: string;
          id: string;
          last_updated: string;
          pay_cents: number;
          trip_count: number;
          year: number;
        };
        Insert: {
          distance_meters?: number;
          drive_minutes?: number;
          driver_uuid: string;
          id?: string;
          last_updated?: string;
          pay_cents?: number;
          trip_count?: number;
          year: number;
        };
        Update: {
          distance_meters?: number;
          drive_minutes?: number;
          driver_uuid?: string;
          id?: string;
          last_updated?: string;
          pay_cents?: number;
          trip_count?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "DriverScorecardStatsPerDriver_driver_uuid_fkey";
            columns: ["driver_uuid"];
            isOneToOne: false;
            referencedRelation: "Drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      DriverUnavailability: {
        Row: {
          date_unavailable: string;
          driver_uuid: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          date_unavailable: string;
          driver_uuid?: string | null;
          id?: string;
          updated_at?: string;
        };
        Update: {
          date_unavailable?: string;
          driver_uuid?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "DriverUnavailability_driver_uuid_fkey";
            columns: ["driver_uuid"];
            isOneToOne: false;
            referencedRelation: "Drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      Events: {
        Row: {
          address_uuid: string | null;
          booked: boolean;
          booked_at: string | null;
          contract_revenue_cents: number | null;
          created_at: string;
          created_by_user_uuid: string | null;
          event_end: string;
          event_name: string;
          event_start: string;
          event_status: Database["public"]["Enums"]["event_status"] | null;
          fifteen_row: number | null;
          goodshuffle_url: string | null;
          hsl_hue: number | null;
          id: string;
          lenient: boolean;
          must_be_clean: boolean;
          notes: string | null;
          setup_start: string | null;
          seven_row: number | null;
          teardown_end: string | null;
          ten_row: number | null;
          total_seats: number | null;
        };
        Insert: {
          address_uuid?: string | null;
          booked?: boolean;
          booked_at?: string | null;
          contract_revenue_cents?: number | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          event_end: string;
          event_name: string;
          event_start: string;
          event_status?: Database["public"]["Enums"]["event_status"] | null;
          fifteen_row?: number | null;
          goodshuffle_url?: string | null;
          hsl_hue?: number | null;
          id?: string;
          lenient: boolean;
          must_be_clean?: boolean;
          notes?: string | null;
          setup_start?: string | null;
          seven_row?: number | null;
          teardown_end?: string | null;
          ten_row?: number | null;
          total_seats?: number | null;
        };
        Update: {
          address_uuid?: string | null;
          booked?: boolean;
          booked_at?: string | null;
          contract_revenue_cents?: number | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          event_end?: string;
          event_name?: string;
          event_start?: string;
          event_status?: Database["public"]["Enums"]["event_status"] | null;
          fifteen_row?: number | null;
          goodshuffle_url?: string | null;
          hsl_hue?: number | null;
          id?: string;
          lenient?: boolean;
          must_be_clean?: boolean;
          notes?: string | null;
          setup_start?: string | null;
          seven_row?: number | null;
          teardown_end?: string | null;
          ten_row?: number | null;
          total_seats?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "Events_address_uuid_fkey";
            columns: ["address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "Events_created_by_user_uuid_fkey";
            columns: ["created_by_user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      HomeBases: {
        Row: {
          created_at: string;
          home_base_name: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          home_base_name: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          home_base_name?: string;
          id?: string;
        };
        Relationships: [];
      };
      InspectionPhotos: {
        Row: {
          caption: string | null;
          created_at: string;
          id: string;
          inspection_uuid: string;
          storage_path: string;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          inspection_uuid: string;
          storage_path: string;
        };
        Update: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          inspection_uuid?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "InspectionPhotos_inspection_uuid_fkey";
            columns: ["inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["id"];
          },
        ];
      };
      InspectionQuestions: {
        Row: {
          id: string;
          is_active: boolean;
          question_text: string;
          question_type: Database["public"]["Enums"]["question_type"];
          required: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          question_text: string;
          question_type?: Database["public"]["Enums"]["question_type"];
          required?: boolean;
          sort_order?: number;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          question_text?: string;
          question_type?: Database["public"]["Enums"]["question_type"];
          required?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      MaintenanceEvents: {
        Row: {
          address_uuid: string | null;
          cost_cents: number | null;
          created_at: string;
          created_by_user_uuid: string | null;
          event_end: string;
          event_name: string;
          event_start: string;
          id: string;
          notes: string | null;
        };
        Insert: {
          address_uuid?: string | null;
          cost_cents?: number | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          event_end: string;
          event_name?: string;
          event_start: string;
          id?: string;
          notes?: string | null;
        };
        Update: {
          address_uuid?: string | null;
          cost_cents?: number | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          event_end?: string;
          event_name?: string;
          event_start?: string;
          id?: string;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "MaintenanceEvents_address_uuid_fkey";
            columns: ["address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "MaintenanceEvents_created_by_user_uuid_fkey";
            columns: ["created_by_user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      MaintenancePhotos: {
        Row: {
          created_at: string;
          id: string;
          maintenance_event_uuid: string;
          photo_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          maintenance_event_uuid: string;
          photo_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          maintenance_event_uuid?: string;
          photo_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "MaintenancePhotos_maintenance_event_uuid_fkey";
            columns: ["maintenance_event_uuid"];
            isOneToOne: false;
            referencedRelation: "MaintenanceEvents";
            referencedColumns: ["id"];
          },
        ];
      };
      Notifications: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          title: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          title?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "Notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      QboConnections: {
        Row: {
          display_name: string;
          encrypted_token_value: string;
          id: string;
          qbo_tax_code_id: string | null;
          realm_id: string | null;
        };
        Insert: {
          display_name: string;
          encrypted_token_value: string;
          id?: string;
          qbo_tax_code_id?: string | null;
          realm_id?: string | null;
        };
        Update: {
          display_name?: string;
          encrypted_token_value?: string;
          id?: string;
          qbo_tax_code_id?: string | null;
          realm_id?: string | null;
        };
        Relationships: [];
      };
      RoadmapAttachments: {
        Row: {
          created_at: string;
          file_name: string;
          file_size_bytes: number | null;
          id: string;
          mime_type: string | null;
          parent_id: string;
          parent_type: Database["public"]["Enums"]["roadmap_attachment_parent_type"];
          storage_bucket: string;
          storage_path: string;
          uploaded_by_user_uuid: string | null;
        };
        Insert: {
          created_at?: string;
          file_name: string;
          file_size_bytes?: number | null;
          id?: string;
          mime_type?: string | null;
          parent_id: string;
          parent_type: Database["public"]["Enums"]["roadmap_attachment_parent_type"];
          storage_bucket: string;
          storage_path: string;
          uploaded_by_user_uuid?: string | null;
        };
        Update: {
          created_at?: string;
          file_name?: string;
          file_size_bytes?: number | null;
          id?: string;
          mime_type?: string | null;
          parent_id?: string;
          parent_type?: Database["public"]["Enums"]["roadmap_attachment_parent_type"];
          storage_bucket?: string;
          storage_path?: string;
          uploaded_by_user_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapAttachments_uploaded_by_user_uuid_fkey";
            columns: ["uploaded_by_user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapFeatures: {
        Row: {
          completed_at: string | null;
          created_at: string;
          description: string | null;
          id: string;
          quarter_id: string;
          sort_order: number;
          status: Database["public"]["Enums"]["roadmap_feature_status"];
          title: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          quarter_id: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["roadmap_feature_status"];
          title: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          quarter_id?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["roadmap_feature_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapFeatures_quarter_id_fkey";
            columns: ["quarter_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapQuarters";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapFeatureSprintLabels: {
        Row: {
          created_at: string;
          feature_id: string;
          id: string;
          sprint_id: string;
        };
        Insert: {
          created_at?: string;
          feature_id: string;
          id?: string;
          sprint_id: string;
        };
        Update: {
          created_at?: string;
          feature_id?: string;
          id?: string;
          sprint_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapFeatureSprintLabels_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapFeatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapFeatureSprintLabels_sprint_id_fkey";
            columns: ["sprint_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapSprints";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapQuarters: {
        Row: {
          created_at: string;
          id: string;
          quarter: number;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          quarter: number;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          quarter?: number;
          year?: number;
        };
        Relationships: [];
      };
      RoadmapSprints: {
        Row: {
          created_at: string;
          end_date: string;
          id: string;
          quarter_id: string;
          sprint_number: number;
          start_date: string;
        };
        Insert: {
          created_at?: string;
          end_date: string;
          id?: string;
          quarter_id: string;
          sprint_number: number;
          start_date: string;
        };
        Update: {
          created_at?: string;
          end_date?: string;
          id?: string;
          quarter_id?: string;
          sprint_number?: number;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapSprints_quarter_id_fkey";
            columns: ["quarter_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapQuarters";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapTaskMessageReadReceipts: {
        Row: {
          id: string;
          message_id: string;
          read_at: string;
          user_uuid: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          read_at?: string;
          user_uuid: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          read_at?: string;
          user_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskMessageReadReceipts_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapTaskMessages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTaskMessageReadReceipts_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapTaskMessages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_system: boolean;
          task_id: string;
          user_uuid: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          task_id: string;
          user_uuid: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          task_id?: string;
          user_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskMessages_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapTasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTaskMessages_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapTasks: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by_user_uuid: string | null;
          deleted_at: string | null;
          description: string | null;
          developer_uuid: string | null;
          feature_id: string | null;
          id: string;
          is_backlog: boolean;
          sort_order: number;
          sprint_id: string | null;
          status: Database["public"]["Enums"]["roadmap_task_status"];
          title: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          developer_uuid?: string | null;
          feature_id?: string | null;
          id?: string;
          is_backlog?: boolean;
          sort_order?: number;
          sprint_id?: string | null;
          status?: Database["public"]["Enums"]["roadmap_task_status"];
          title: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by_user_uuid?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          developer_uuid?: string | null;
          feature_id?: string | null;
          id?: string;
          is_backlog?: boolean;
          sort_order?: number;
          sprint_id?: string | null;
          status?: Database["public"]["Enums"]["roadmap_task_status"];
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapTasks_created_by_user_uuid_fkey";
            columns: ["created_by_user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTasks_developer_uuid_fkey";
            columns: ["developer_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTasks_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapFeatures";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTasks_sprint_id_fkey";
            columns: ["sprint_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapSprints";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapTaskSubscriptions: {
        Row: {
          created_at: string;
          id: string;
          task_id: string;
          user_uuid: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          task_id: string;
          user_uuid: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          task_id?: string;
          user_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskSubscriptions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapTasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTaskSubscriptions_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      RoadmapTaskTypingIndicators: {
        Row: {
          id: string;
          is_typing: boolean;
          task_id: string;
          updated_at: string;
          user_uuid: string;
        };
        Insert: {
          id?: string;
          is_typing?: boolean;
          task_id: string;
          updated_at?: string;
          user_uuid: string;
        };
        Update: {
          id?: string;
          is_typing?: boolean;
          task_id?: string;
          updated_at?: string;
          user_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "RoadmapTaskTypingIndicators_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "RoadmapTasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "RoadmapTaskTypingIndicators_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      ScorecardTargets: {
        Row: {
          account_manager_uuid: string;
          created_at: string;
          gross_margin_percent_annually: number;
          gross_margin_percent_quarterly: number;
          gross_margin_percent_weekly: number;
          id: string;
          quotes_annually: number;
          quotes_quarterly: number;
          quotes_weekly: number;
          sales_annually: number;
          sales_quarterly: number;
          sales_weekly: number;
          updated_at: string;
          value_of_revenue_annually_cents: number;
          value_of_revenue_quarterly_cents: number;
          value_of_revenue_weekly_cents: number;
          value_of_sales_annually_cents: number;
          value_of_sales_quarterly_cents: number;
          value_of_sales_weekly_cents: number;
        };
        Insert: {
          account_manager_uuid: string;
          created_at?: string;
          gross_margin_percent_annually?: number;
          gross_margin_percent_quarterly?: number;
          gross_margin_percent_weekly?: number;
          id?: string;
          quotes_annually?: number;
          quotes_quarterly?: number;
          quotes_weekly?: number;
          sales_annually?: number;
          sales_quarterly?: number;
          sales_weekly?: number;
          updated_at?: string;
          value_of_revenue_annually_cents?: number;
          value_of_revenue_quarterly_cents?: number;
          value_of_revenue_weekly_cents?: number;
          value_of_sales_annually_cents?: number;
          value_of_sales_quarterly_cents?: number;
          value_of_sales_weekly_cents?: number;
        };
        Update: {
          account_manager_uuid?: string;
          created_at?: string;
          gross_margin_percent_annually?: number;
          gross_margin_percent_quarterly?: number;
          gross_margin_percent_weekly?: number;
          id?: string;
          quotes_annually?: number;
          quotes_quarterly?: number;
          quotes_weekly?: number;
          sales_annually?: number;
          sales_quarterly?: number;
          sales_weekly?: number;
          updated_at?: string;
          value_of_revenue_annually_cents?: number;
          value_of_revenue_quarterly_cents?: number;
          value_of_revenue_weekly_cents?: number;
          value_of_sales_annually_cents?: number;
          value_of_sales_quarterly_cents?: number;
          value_of_sales_weekly_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ScorecardTargets_account_manager_uuid_fkey";
            columns: ["account_manager_uuid"];
            isOneToOne: true;
            referencedRelation: "AccountManagers";
            referencedColumns: ["id"];
          },
        ];
      };
      Tasks: {
        Row: {
          created_at: string;
          created_by_user_uuid: string | null;
          description: string;
          id: string;
          name: string;
          status: Database["public"]["Enums"]["task_status"] | null;
          type: Database["public"]["Enums"]["task_type"] | null;
        };
        Insert: {
          created_at?: string;
          created_by_user_uuid?: string | null;
          description: string;
          id?: string;
          name: string;
          status?: Database["public"]["Enums"]["task_status"] | null;
          type?: Database["public"]["Enums"]["task_type"] | null;
        };
        Update: {
          created_at?: string;
          created_by_user_uuid?: string | null;
          description?: string;
          id?: string;
          name?: string;
          status?: Database["public"]["Enums"]["task_status"] | null;
          type?: Database["public"]["Enums"]["task_type"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "Tasks_created_by_user_uuid_fkey";
            columns: ["created_by_user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      UserHomeBases: {
        Row: {
          created_at: string;
          home_base_uuid: string | null;
          id: string;
          user_uuid: string | null;
        };
        Insert: {
          created_at?: string;
          home_base_uuid?: string | null;
          id?: string;
          user_uuid?: string | null;
        };
        Update: {
          created_at?: string;
          home_base_uuid?: string | null;
          id?: string;
          user_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "userhomebases_home_base_uuid_fkey";
            columns: ["home_base_uuid"];
            isOneToOne: false;
            referencedRelation: "HomeBases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "UserHomeBases_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
        ];
      };
      UserRoles: {
        Row: {
          created_at: string;
          id: string;
          role: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      Users: {
        Row: {
          avatar_image_url: string | null;
          clerk_user_id: string | null;
          created_at: string;
          email: string;
          expo_push_token: string | null;
          first_name: string | null;
          id: string;
          is_admin: boolean;
          last_name: string | null;
          phone: string | null;
          role: number | null;
          status_uuid: string | null;
        };
        Insert: {
          avatar_image_url?: string | null;
          clerk_user_id?: string | null;
          created_at?: string;
          email: string;
          expo_push_token?: string | null;
          first_name?: string | null;
          id?: string;
          is_admin?: boolean;
          last_name?: string | null;
          phone?: string | null;
          role?: number | null;
          status_uuid?: string | null;
        };
        Update: {
          avatar_image_url?: string | null;
          clerk_user_id?: string | null;
          created_at?: string;
          email?: string;
          expo_push_token?: string | null;
          first_name?: string | null;
          id?: string;
          is_admin?: boolean;
          last_name?: string | null;
          phone?: string | null;
          role?: number | null;
          status_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "Users_status_uuid_fkey";
            columns: ["status_uuid"];
            isOneToOne: false;
            referencedRelation: "UserStatuses";
            referencedColumns: ["id"];
          },
        ];
      };
      UserStatuses: {
        Row: {
          created_at: string;
          id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          status: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          status?: string;
        };
        Relationships: [];
      };
      Vehicles: {
        Row: {
          created_at: string;
          id: string;
          make: string;
          model: string;
          vin_number: string | null;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          make: string;
          model: string;
          vin_number?: string | null;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          make?: string;
          model?: string;
          vin_number?: string | null;
          year?: number;
        };
        Relationships: [];
      };
      Vendors: {
        Row: {
          created_at: string;
          display_name: string;
          ein: string | null;
          hst: string | null;
          id: string;
          is_active: boolean;
          logo_url: string | null;
          qbo_connection_uuid: string | null;
          qbo_vendor_id: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          ein?: string | null;
          hst?: string | null;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          qbo_connection_uuid?: string | null;
          qbo_vendor_id?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          ein?: string | null;
          hst?: string | null;
          id?: string;
          is_active?: boolean;
          logo_url?: string | null;
          qbo_connection_uuid?: string | null;
          qbo_vendor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "vendors_qbo_connection_uuid_fkey";
            columns: ["qbo_connection_uuid"];
            isOneToOne: false;
            referencedRelation: "QboConnections";
            referencedColumns: ["id"];
          },
        ];
      };
      WorkTrackerGroups: {
        Row: {
          created_at: string;
          driver_uuid: string;
          id: string;
          qbo_bill_id: string | null;
          status: Database["public"]["Enums"]["worktracker_group_status"];
          week_end: string;
          week_start: string;
        };
        Insert: {
          created_at?: string;
          driver_uuid: string;
          id?: string;
          qbo_bill_id?: string | null;
          status?: Database["public"]["Enums"]["worktracker_group_status"];
          week_end: string;
          week_start: string;
        };
        Update: {
          created_at?: string;
          driver_uuid?: string;
          id?: string;
          qbo_bill_id?: string | null;
          status?: Database["public"]["Enums"]["worktracker_group_status"];
          week_end?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worktrackergroups_driver_uuid_fkey";
            columns: ["driver_uuid"];
            isOneToOne: false;
            referencedRelation: "Drivers";
            referencedColumns: ["id"];
          },
        ];
      };
      WorkTrackerInspections: {
        Row: {
          answers_json: string | null;
          created_at: string;
          id: string;
          issue_description: string | null;
          issues_found: boolean;
          walk_around_complete: boolean;
        };
        Insert: {
          answers_json?: string | null;
          created_at?: string;
          id?: string;
          issue_description?: string | null;
          issues_found?: boolean;
          walk_around_complete?: boolean;
        };
        Update: {
          answers_json?: string | null;
          created_at?: string;
          id?: string;
          issue_description?: string | null;
          issues_found?: boolean;
          walk_around_complete?: boolean;
        };
        Relationships: [];
      };
      WorkTrackers: {
        Row: {
          accepted_at: string | null;
          bleacher_uuid: string | null;
          bol_number: string | null;
          completed_at: string | null;
          created_at: string;
          date: string | null;
          distance_meters: number | null;
          drive_minutes: number | null;
          driver_uuid: string | null;
          dropoff_address_uuid: string | null;
          dropoff_instructions: string | null;
          dropoff_poc: string | null;
          dropoff_time: string | null;
          id: string;
          internal_notes: string | null;
          notes: string | null;
          pay_cents: number | null;
          pickup_address_uuid: string | null;
          pickup_instructions: string | null;
          pickup_poc: string | null;
          pickup_time: string | null;
          post_inspection_uuid: string | null;
          pre_inspection_uuid: string | null;
          project_number: string | null;
          released_at: string | null;
          setup_required: boolean;
          started_at: string | null;
          status: Database["public"]["Enums"]["worktracker_status"];
          teardown_required: boolean;
          updated_at: string;
          user_uuid: string | null;
          work_tracker_type_uuid: string | null;
          worktracker_group_uuid: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          bleacher_uuid?: string | null;
          bol_number?: string | null;
          completed_at?: string | null;
          created_at?: string;
          date?: string | null;
          distance_meters?: number | null;
          drive_minutes?: number | null;
          driver_uuid?: string | null;
          dropoff_address_uuid?: string | null;
          dropoff_instructions?: string | null;
          dropoff_poc?: string | null;
          dropoff_time?: string | null;
          id?: string;
          internal_notes?: string | null;
          notes?: string | null;
          pay_cents?: number | null;
          pickup_address_uuid?: string | null;
          pickup_instructions?: string | null;
          pickup_poc?: string | null;
          pickup_time?: string | null;
          post_inspection_uuid?: string | null;
          pre_inspection_uuid?: string | null;
          project_number?: string | null;
          released_at?: string | null;
          setup_required?: boolean;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["worktracker_status"];
          teardown_required?: boolean;
          updated_at?: string;
          user_uuid?: string | null;
          work_tracker_type_uuid?: string | null;
          worktracker_group_uuid?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          bleacher_uuid?: string | null;
          bol_number?: string | null;
          completed_at?: string | null;
          created_at?: string;
          date?: string | null;
          distance_meters?: number | null;
          drive_minutes?: number | null;
          driver_uuid?: string | null;
          dropoff_address_uuid?: string | null;
          dropoff_instructions?: string | null;
          dropoff_poc?: string | null;
          dropoff_time?: string | null;
          id?: string;
          internal_notes?: string | null;
          notes?: string | null;
          pay_cents?: number | null;
          pickup_address_uuid?: string | null;
          pickup_instructions?: string | null;
          pickup_poc?: string | null;
          pickup_time?: string | null;
          post_inspection_uuid?: string | null;
          pre_inspection_uuid?: string | null;
          project_number?: string | null;
          released_at?: string | null;
          setup_required?: boolean;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["worktracker_status"];
          teardown_required?: boolean;
          updated_at?: string;
          user_uuid?: string | null;
          work_tracker_type_uuid?: string | null;
          worktracker_group_uuid?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "WorkTrackers_bleacher_uuid_fkey";
            columns: ["bleacher_uuid"];
            isOneToOne: false;
            referencedRelation: "Bleachers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "WorkTrackers_driver_uuid_fkey";
            columns: ["driver_uuid"];
            isOneToOne: false;
            referencedRelation: "Drivers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worktrackers_dropoff_address_uuid_fkey";
            columns: ["dropoff_address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worktrackers_pickup_address_uuid_fkey";
            columns: ["pickup_address_uuid"];
            isOneToOne: false;
            referencedRelation: "Addresses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "WorkTrackers_post_inspection_uuid_fkey";
            columns: ["post_inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "WorkTrackers_pre_inspection_uuid_fkey";
            columns: ["pre_inspection_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerInspections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "WorkTrackers_user_uuid_fkey";
            columns: ["user_uuid"];
            isOneToOne: false;
            referencedRelation: "Users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worktrackers_work_tracker_type_uuid_fkey";
            columns: ["work_tracker_type_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerTypes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worktrackers_worktracker_group_uuid_fkey";
            columns: ["worktracker_group_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerGroups";
            referencedColumns: ["id"];
          },
        ];
      };
      WorkTrackerTypeQboAccounts: {
        Row: {
          created_at: string;
          id: string;
          qbo_account_id: string;
          qbo_connection_uuid: string;
          work_tracker_type_uuid: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          qbo_account_id: string;
          qbo_connection_uuid: string;
          work_tracker_type_uuid: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          qbo_account_id?: string;
          qbo_connection_uuid?: string;
          work_tracker_type_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "worktrackertypeqboaccounts_conn_fkey";
            columns: ["qbo_connection_uuid"];
            isOneToOne: false;
            referencedRelation: "QboConnections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worktrackertypeqboaccounts_type_fkey";
            columns: ["work_tracker_type_uuid"];
            isOneToOne: false;
            referencedRelation: "WorkTrackerTypes";
            referencedColumns: ["id"];
          },
        ];
      };
      WorkTrackerTypes: {
        Row: {
          created_at: string;
          display_name: string;
          id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          id?: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          id?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      ZoneQboClasses: {
        Row: {
          created_at: string;
          id: string;
          qbo_class_id: string;
          qbo_connection_uuid: string;
          zone_uuid: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          qbo_class_id: string;
          qbo_connection_uuid: string;
          zone_uuid: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          qbo_class_id?: string;
          qbo_connection_uuid?: string;
          zone_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zoneqboclasses_qbo_connection_uuid_fkey";
            columns: ["qbo_connection_uuid"];
            isOneToOne: false;
            referencedRelation: "QboConnections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "zoneqboclasses_zone_uuid_fkey";
            columns: ["zone_uuid"];
            isOneToOne: false;
            referencedRelation: "Zones";
            referencedColumns: ["id"];
          },
        ];
      };
      Zones: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          id: string;
          photo_path: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          id?: string;
          photo_path?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          id?: string;
          photo_path?: string | null;
        };
        Relationships: [];
      };
      ZoneStateProvinces: {
        Row: {
          created_at: string;
          id: string;
          state_province: string;
          zone_uuid: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          state_province: string;
          zone_uuid: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          state_province?: string;
          zone_uuid?: string;
        };
        Relationships: [
          {
            foreignKeyName: "zonestateprovinces_zone_uuid_fkey";
            columns: ["zone_uuid"];
            isOneToOne: false;
            referencedRelation: "Zones";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_week_end: { Args: { input_date: string }; Returns: string };
      get_week_start: { Args: { input_date: string }; Returns: string };
      recompute_driver_scorecard_bucket: {
        Args: { p_driver: string; p_year: number };
        Returns: undefined;
      };
      recompute_maintenance_cost_per_year_bucket: {
        Args: { p_year: number };
        Returns: undefined;
      };
    };
    Enums: {
      bleacher_opening_dir: "driver" | "passenger";
      bluebook_region: "CAN" | "US" | "Both";
      event_status: "quoted" | "booked" | "lost";
      pay_currency_type: "CAD" | "USD";
      pay_per_unit_type: "KM" | "MI" | "HR";
      question_type: "text" | "checkbox" | "photo";
      roadmap_attachment_parent_type: "task" | "feature";
      roadmap_feature_status: "draft" | "locked_in" | "in_progress" | "completed";
      roadmap_task_status: "to_do" | "in_progress" | "completed";
      task_status: "in_progress" | "backlog" | "complete" | "approved" | "in_staging" | "paused";
      task_type: "feature" | "bug";
      worktracker_group_status:
        | "draft"
        | "qbo_bill_creating"
        | "qbo_bill_created"
        | "qbo_bill_error"
        | "no_bill_ready_for_payment";
      worktracker_status:
        | "draft"
        | "released"
        | "accepted"
        | "dest_pickup"
        | "pickup_inspection"
        | "dest_dropoff"
        | "dropoff_inspection"
        | "completed"
        | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      bleacher_opening_dir: ["driver", "passenger"],
      bluebook_region: ["CAN", "US", "Both"],
      event_status: ["quoted", "booked", "lost"],
      pay_currency_type: ["CAD", "USD"],
      pay_per_unit_type: ["KM", "MI", "HR"],
      question_type: ["text", "checkbox", "photo"],
      roadmap_attachment_parent_type: ["task", "feature"],
      roadmap_feature_status: ["draft", "locked_in", "in_progress", "completed"],
      roadmap_task_status: ["to_do", "in_progress", "completed"],
      task_status: ["in_progress", "backlog", "complete", "approved", "in_staging", "paused"],
      task_type: ["feature", "bug"],
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
      ],
    },
  },
} as const;
