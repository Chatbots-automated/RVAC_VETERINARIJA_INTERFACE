import { useState, useEffect } from 'react';
import { X, Save, Eye, EyeOff, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface VICCredential {
  id: string;
  vic_username: string;
  vic_password: string;
  is_active: boolean;
}

interface VICCredentialsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function VICCredentials({ isOpen, onClose }: VICCredentialsProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [existingCredential, setExistingCredential] = useState<VICCredential | null>(null);
  const [formData, setFormData] = useState({
    vic_username: '',
    vic_password: '',
  });

  useEffect(() => {
    if (isOpen) {
      loadVICCredentials();
    }
  }, [isOpen]);

  const loadVICCredentials = async () => {
    try {
      setLoading(true);
      // Get the first active VIC credential (organization-wide)
      const { data, error } = await supabase
        .from('vic_credentials')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingCredential(data);
        setFormData({
          vic_username: data.vic_username || '',
          vic_password: data.vic_password || '',
        });
      } else {
        setExistingCredential(null);
        setFormData({
          vic_username: '',
          vic_password: '',
        });
      }
    } catch (error) {
      console.error('Error loading VIC credentials:', error);
      alert('Klaida kraunant VIC duomenis');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (!formData.vic_username || !formData.vic_password) {
        alert('VIC vartotojo vardas ir slaptažodis yra privalomi');
        return;
      }

      if (existingCredential) {
        // Update existing credential
        const { error } = await supabase
          .from('vic_credentials')
          .update({
            vic_username: formData.vic_username,
            vic_password: formData.vic_password,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          })
          .eq('id', existingCredential.id);

        if (error) throw error;
      } else {
        // Create new credential
        const { error } = await supabase
          .from('vic_credentials')
          .insert({
            vic_username: formData.vic_username,
            vic_password: formData.vic_password,
            is_active: true,
            created_by: user?.id,
            updated_by: user?.id,
          });

        if (error) throw error;
      }

      alert('VIC duomenys sėkmingai išsaugoti!');
      onClose();
    } catch (error: any) {
      console.error('Error saving VIC credentials:', error);
      alert(`Klaida išsaugant VIC duomenis: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">VIC Duomenys</h2>
              <p className="text-sm text-gray-500">Veterinarijos informacijos centras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Organizacijos lygmens duomenys:</strong> Šie VIC prisijungimo duomenys bus naudojami visiems ūkiams ir visiems vartotojams automatiškai.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VIC Vartotojo vardas *
                </label>
                <input
                  type="text"
                  value={formData.vic_username}
                  onChange={(e) => setFormData({ ...formData, vic_username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Įveskite VIC vartotojo vardą"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  VIC Slaptažodis *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.vic_password}
                    onChange={(e) => setFormData({ ...formData, vic_password: e.target.value })}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Įveskite VIC slaptažodį"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Išsaugoma...' : 'Išsaugoti'}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Atšaukti
          </button>
        </div>
      </div>
    </div>
  );
}
