import React, { useState, useEffect, useRef } from 'react';
import { X, StickyNote } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface NotepadProps {
  isOpen: boolean;
  onClose: () => void;
  farmId: string | undefined;
  onHasContent?: (hasContent: boolean) => void;
  onContentPreview?: (preview: string) => void;
}

export default function Notepad({ isOpen, onClose, farmId, onHasContent, onContentPreview }: NotepadProps) {
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [noteId, setNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  // Load note when farm changes (even if not open, for preview)
  useEffect(() => {
    if (farmId) {
      loadNote();
    }
  }, [farmId]);

  // Reload when opened
  useEffect(() => {
    if (isOpen && farmId) {
      loadNote();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !farmId) return;

    const channel = supabase
      .channel('shared_notepad_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_notepad',
          filter: `farm_id=eq.${farmId}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const newData = payload.new as any;
            // Only update if it was edited by someone else (or if we don't know who edited it)
            if (user && newData.last_edited_by !== user.id && newData.farm_id === farmId) {
              setContent(newData.content || '');
              setLastSaved(new Date(newData.updated_at));
              setNoteId(newData.id);
            } else if (!user && newData.farm_id === farmId) {
              // If no user context, just update
              setContent(newData.content || '');
              setLastSaved(new Date(newData.updated_at));
              setNoteId(newData.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, farmId, user]);

  const loadNote = async () => {
    if (!farmId) {
      setError('Nepasirinktas ūkis');
      return;
    }

    setError(null);

    const { data, error } = await supabase
      .from('shared_notepad')
      .select('*')
      .eq('farm_id', farmId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading note:', error);
      setError('Klaida įkeliant užrašus: ' + error.message);
      return;
    }

    if (data) {
      setNoteId(data.id);
      setContent(data.content || '');
      setLastSaved(new Date(data.updated_at));
      const hasContent = !!data.content && data.content.trim().length > 0;
      if (onHasContent) {
        onHasContent(hasContent);
      }
      if (onContentPreview && hasContent) {
        // Send first 100 characters as preview
        const preview = data.content.trim().substring(0, 100);
        onContentPreview(preview);
      }
    } else {
      if (onHasContent) {
        onHasContent(false);
      }
      if (onContentPreview) {
        onContentPreview('');
      }
    }
  };

  const saveNote = async (newContent: string) => {
    if (!farmId) {
      setError('Nepasirinktas ūkis');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (noteId) {
        // Update existing note - don't update last_edited_by to avoid FK constraint issues
        const { error } = await supabase
          .from('shared_notepad')
          .update({
            content: newContent
          })
          .eq('id', noteId)
          .eq('farm_id', farmId);

        if (error) throw error;
      } else {
        // Insert new note - don't set last_edited_by to avoid FK constraint issues
        const { data, error } = await supabase
          .from('shared_notepad')
          .insert({
            farm_id: farmId,
            content: newContent
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setNoteId(data.id);
      }

      setLastSaved(new Date());
      setError(null);
      if (onHasContent) {
        onHasContent(!!newContent && newContent.trim().length > 0);
      }
    } catch (error: any) {
      console.error('Error saving note:', error);
      setError('Klaida išsaugant: ' + (error.message || 'Nežinoma klaida'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveNote(newContent);
    }, 1000);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-yellow-50">
          <div className="flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Bendros užrašinės</h2>
              <p className="text-xs text-gray-600">Matoma visiems vartotojams</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex-1 p-4 overflow-hidden">
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder="Rašykite čia savo užrašus..."
            className="w-full h-full p-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col gap-2">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-2">
                {isSaving ? (
                  <span className="text-amber-600">Išsaugoma...</span>
                ) : lastSaved ? (
                  <span>
                    Išsaugota: {lastSaved.toLocaleTimeString('lt-LT', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                ) : (
                  <span>Nėra išsaugotų užrašų</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
