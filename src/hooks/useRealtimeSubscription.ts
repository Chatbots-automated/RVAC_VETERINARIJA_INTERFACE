import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions {
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  enabled?: boolean;
}

export function useRealtimeSubscription({
  table,
  filter,
  event = '*',
  onInsert,
  onUpdate,
  onDelete,
  enabled = true,
}: UseRealtimeSubscriptionOptions) {
  useEffect(() => {
    if (!enabled) return;

    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase.channel(`${table}-changes-${Math.random()}`);

      if (filter) {
        channel = channel.on(
          'postgres_changes',
          {
            event,
            schema: 'public',
            table,
            filter,
          },
          (payload) => {
            handleChange(payload);
          }
        );
      } else {
        channel = channel.on(
          'postgres_changes',
          {
            event,
            schema: 'public',
            table,
          },
          (payload) => {
            handleChange(payload);
          }
        );
      }

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Subscribed to ${table}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`❌ Error subscribing to ${table}`);
        }
      });
    };

    const handleChange = (payload: any) => {
      console.log(`🔄 Change detected in ${table}:`, payload);

      switch (payload.eventType) {
        case 'INSERT':
          onInsert?.(payload);
          break;
        case 'UPDATE':
          onUpdate?.(payload);
          break;
        case 'DELETE':
          onDelete?.(payload);
          break;
      }
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
        console.log(`🔌 Unsubscribed from ${table}`);
      }
    };
  }, [table, filter, event, enabled]);
}
