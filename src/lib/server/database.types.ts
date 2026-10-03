export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      streamers: {
        Row: { id: string; slug: string; name: string; enabled: boolean; created_at: string };
        Insert: { id?: string; slug: string; name: string; enabled?: boolean; created_at?: string };
        Update: { name?: string; enabled?: boolean };
        Relationships: [];
      };
      streamer_members: {
        Row: { streamer_id: string; user_id: string; created_at: string };
        Insert: { streamer_id: string; user_id: string; created_at?: string };
        Update: { streamer_id?: string; user_id?: string };
        Relationships: [];
      };
      platform_admins: {
        Row: { user_id: string };
        Insert: { user_id: string };
        Update: { user_id?: string };
        Relationships: [];
      };

      request_rate_limits: {
        Row: {
          client_key: string;
          request_count: number;
          reset_at: string;
        };
        Insert: {
          client_key: string;
          request_count: number;
          reset_at: string;
        };
        Update: {
          client_key?: string;
          request_count?: number;
          reset_at?: string;
        };
        Relationships: [];
      };
      requests: {
        Row: {
          streamer_id: string;
          artist: string;
          created_at: string;
          id: string;
          language: Database['public']['Enums']['song_language'];
          matched_song_id: string | null;
          message: string;
          requester_name: string | null;
          song_title: string;
          status: Database['public']['Enums']['request_status'];
        };
        Insert: {
          streamer_id: string;
          artist?: string;
          created_at?: string;
          id?: string;
          language: Database['public']['Enums']['song_language'];
          matched_song_id?: string | null;
          message: string;
          requester_name?: string | null;
          song_title: string;
          status?: Database['public']['Enums']['request_status'];
        };
        Update: {
          streamer_id?: string;
          artist?: string;
          created_at?: string;
          id?: string;
          language?: Database['public']['Enums']['song_language'];
          matched_song_id?: string | null;
          message?: string;
          requester_name?: string | null;
          song_title?: string;
          status?: Database['public']['Enums']['request_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'requests_song_scope_fkey';
            columns: ['streamer_id', 'matched_song_id'];
            isOneToOne: false;
            referencedRelation: 'songs';
            referencedColumns: ['streamer_id', 'id'];
          }
        ];
      };
      settings: {
        Row: {
          streamer_id: string;
          key: string;
          value: string;
        };
        Insert: {
          streamer_id: string;
          key: string;
          value: string;
        };
        Update: {
          streamer_id?: string;
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      songs: {
        Row: {
          streamer_id: string;
          artist: string;
          created_at: string;
          id: string;
          is_public: boolean;
          language: Database['public']['Enums']['song_language'];
          status: Database['public']['Enums']['song_status'];
          tags: string[];
          title: string;
        };
        Insert: {
          streamer_id: string;
          artist: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          language: Database['public']['Enums']['song_language'];
          status: Database['public']['Enums']['song_status'];
          tags?: string[];
          title: string;
        };
        Update: {
          streamer_id?: string;
          artist?: string;
          created_at?: string;
          id?: string;
          is_public?: boolean;
          language?: Database['public']['Enums']['song_language'];
          status?: Database['public']['Enums']['song_status'];
          tags?: string[];
          title?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_streamer: { Args: { p_streamer_id: string }; Returns: Json };
      create_streamer: { Args: { p_id: string; p_slug: string; p_name: string }; Returns: undefined };
      accept_song_request: { Args: { request_id: string; p_streamer_id: string }; Returns: string };
      consume_request_rate_limit: {
        Args: {
          p_client_key: string;
          p_max_requests: number;
          p_window_seconds: number;
        };
        Returns: boolean;
      };
      create_song_request: {
        Args: {
          p_streamer_id: string;
          p_artist: string;
          p_language: Database['public']['Enums']['song_language'];
          p_message: string;
          p_requester_name: string;
          p_song_title: string;
        };
        Returns: undefined;
      };
      reset_admin_data: { Args: { p_settings: Json; p_streamer_id: string }; Returns: undefined };
      restore_admin_data: {
        Args: { p_requests: Json; p_settings: Json; p_songs: Json; p_streamer_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      request_status: 'pending' | 'accepted' | 'refused';
      song_language: '中文' | '英语' | '日语' | '其他';
      song_status: 'ready' | 'learning' | 'resting';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      request_status: ['pending', 'accepted', 'refused'],
      song_language: ['中文', '英语', '日语', '其他'],
      song_status: ['ready', 'learning', 'resting']
    }
  }
} as const;
