import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Star, StarHalf, Package, Calendar, Plus, Search, X, Save } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  product_code: string | null;
  manufacturer: string | null;
}

interface ProductWithStats extends Product {
  avg_rating: number | null;
  reviews_count: number;
  last_review_date: string | null;
  schedule?: {
    id: string;
    interval_value: number;
    interval_type: string;
    next_due_date: string | null;
  } | null;
}

interface ReviewForm {
  product_id: string;
  rating: number;
  comment: string;
}

interface ScheduleForm {
  product_id: string;
  interval_value: string;
  interval_type: string;
}

export function ProductQuality() {
  const { user, logAction } = useAuth();
  const [products, setProducts] = useState<ProductWithStats[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithStats | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>({
    product_id: '',
    rating: 5,
    comment: '',
  });
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({
    product_id: '',
    interval_value: '3',
    interval_type: 'months',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load products
    const { data: productsRes, error: productsError } = await supabase
      .from('equipment_products')
      .select('id, name, product_code, manufacturer')
      .eq('is_active', true)
      .order('name');

    console.log('Loaded products:', productsRes);
    console.log('Products error:', productsError);

    if (!productsRes) {
      setProducts([]);
      return;
    }

    // For each product, load stats in one query using RPC-like pattern
    const productIds = productsRes.map(p => p.id);
    if (productIds.length === 0) {
      setProducts([]);
      return;
    }

    const { data: allReviews } = await supabase
      .from('product_quality_reviews')
      .select('product_id, rating, review_date')
      .in('product_id', productIds as any);

    const { data: schedules, error: schedulesError } = await supabase
      .from('product_quality_schedules')
      .select('id, product_id, interval_value, interval_type, next_due_date, is_active')
      .in('product_id', productIds as any)
      .eq('is_active', true);

    console.log('Loaded schedules:', schedules);
    console.log('Schedules error:', schedulesError);

    const reviewsByProduct: Record<string, any> = {};
    if (allReviews) {
      allReviews.forEach((review: any) => {
        if (!reviewsByProduct[review.product_id]) {
          reviewsByProduct[review.product_id] = {
            product_id: review.product_id,
            ratings: [],
            review_dates: []
          };
        }
        reviewsByProduct[review.product_id].ratings.push(review.rating);
        reviewsByProduct[review.product_id].review_dates.push(review.review_date);
      });

      Object.keys(reviewsByProduct).forEach(productId => {
        const data = reviewsByProduct[productId];
        const ratings = data.ratings;
        data.avg_rating = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
        data.reviews_count = ratings.length;
        data.last_review_date = data.review_dates.sort().reverse()[0];
      });
    }

    const scheduleByProduct: Record<string, any> = {};
    schedules?.forEach((s: any) => {
      scheduleByProduct[s.product_id] = s;
    });

    const combined: ProductWithStats[] = productsRes.map((p: any) => {
      const stats = reviewsByProduct[p.id];
      const sched = scheduleByProduct[p.id];
      return {
        id: p.id,
        name: p.name,
        product_code: p.product_code,
        manufacturer: p.manufacturer,
        avg_rating: stats ? parseFloat(stats.avg_rating) : null,
        reviews_count: stats ? parseInt(stats.reviews_count, 10) : 0,
        last_review_date: stats ? stats.last_review_date : null,
        schedule: sched
          ? {
              id: sched.id,
              interval_value: sched.interval_value,
              interval_type: sched.interval_type,
              next_due_date: sched.next_due_date,
            }
          : null,
      };
    });

    setProducts(combined);
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.product_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openReviewModal = (product: ProductWithStats) => {
    setSelectedProduct(product);
    setReviewForm({
      product_id: product.id,
      rating: 5,
      comment: '',
    });
    setShowReviewModal(true);
  };

  const openScheduleModal = (product: ProductWithStats) => {
    setSelectedProduct(product);
    setScheduleForm({
      product_id: product.id,
      interval_value: product.schedule ? product.schedule.interval_value.toString() : '3',
      interval_type: product.schedule ? product.schedule.interval_type : 'months',
    });
    setShowScheduleModal(true);
  };

  const handleSaveReview = async () => {
    if (!reviewForm.product_id || !reviewForm.rating) {
      alert('Prašome pasirinkti produktą ir įvertinimą');
      return;
    }

    try {
      const { error } = await supabase.from('product_quality_reviews').insert({
        product_id: reviewForm.product_id,
        rating: reviewForm.rating,
        comment: reviewForm.comment || null,
        created_by: user?.id || null,
      });

      if (error) throw error;
      await logAction('add_product_quality_review', 'product_quality_reviews', undefined, null, {
        product_id: reviewForm.product_id,
        rating: reviewForm.rating,
      });

      setShowReviewModal(false);
      setSelectedProduct(null);
      await loadData();
      alert('Kokybės įvertinimas išsaugotas');
    } catch (error: any) {
      console.error('Error saving review:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const handleSaveSchedule = async () => {
    if (!scheduleForm.product_id || !scheduleForm.interval_value) {
      alert('Prašome nurodyti intervalą');
      return;
    }

    const intervalValue = parseInt(scheduleForm.interval_value, 10);
    if (Number.isNaN(intervalValue) || intervalValue <= 0) {
      alert('Intervalas turi būti teigiamas skaičius');
      return;
    }

    try {
      const existing = products.find(p => p.id === scheduleForm.product_id)?.schedule;
      console.log('Existing schedule:', existing);

      const baseDate = existing?.next_due_date
        ? new Date(existing.next_due_date)
        : new Date();
      const nextDate = new Date(baseDate);

      if (scheduleForm.interval_type === 'days') {
        nextDate.setDate(nextDate.getDate() + intervalValue);
      } else if (scheduleForm.interval_type === 'months') {
        nextDate.setMonth(nextDate.getMonth() + intervalValue);
      } else if (scheduleForm.interval_type === 'years') {
        nextDate.setFullYear(nextDate.getFullYear() + intervalValue);
      }

      const payload = {
        product_id: scheduleForm.product_id,
        interval_value: intervalValue,
        interval_type: scheduleForm.interval_type,
        next_due_date: nextDate.toISOString().split('T')[0],
        is_active: true,
        created_by: user?.id || null,
      };

      console.log('Saving schedule payload:', payload);

      if (existing) {
        const { data, error } = await supabase
          .from('product_quality_schedules')
          .update({
            interval_value: payload.interval_value,
            interval_type: payload.interval_type,
            next_due_date: payload.next_due_date,
            is_active: true,
          })
          .eq('id', existing.id)
          .select();

        console.log('Update result:', { data, error });
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('product_quality_schedules')
          .insert(payload)
          .select();

        console.log('Insert result:', { data, error });
        if (error) throw error;
      }

      await logAction('save_product_quality_schedule', 'product_quality_schedules', undefined, null, {
        product_id: scheduleForm.product_id,
        interval_value: intervalValue,
        interval_type: scheduleForm.interval_type,
      });

      setShowScheduleModal(false);
      setSelectedProduct(null);
      await loadData();
      alert('Kokybės patikros intervalas išsaugotas');
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      alert(`Klaida: ${error.message}`);
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-gray-400 text-sm">Neįvertinta</span>;
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);

    return (
      <div className="flex items-center gap-1">
        {[...Array(full)].map((_, i) => (
          <Star key={`full-${i}`} className="w-4 h-4 text-yellow-500 fill-yellow-400" />
        ))}
        {half && <StarHalf className="w-4 h-4 text-yellow-500 fill-yellow-400" />}
        {[...Array(empty)].map((_, i) => (
          <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300" />
        ))}
        <span className="text-xs text-gray-600 ml-1">{rating.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-slate-600" />
            <h3 className="text-lg font-semibold text-gray-800">Produktų kokybės įvertinimai</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="w-4 h-4" />
            <span>Registruokite kokybės problemas ir periodines patikras</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Ieškoti produkto..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-slate-500"
            />
          </div>
        </div>

        <div className="space-y-3">
          {filteredProducts.map(product => {
            const overdue =
              product.schedule?.next_due_date &&
              new Date(product.schedule.next_due_date) < new Date();

            return (
              <div
                key={product.id}
                className={`border rounded-lg p-4 flex items-center justify-between ${
                  overdue ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Package className="w-5 h-5 text-slate-600 mt-1" />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{product.name}</p>
                      {product.product_code && (
                        <span className="text-xs text-gray-500">({product.product_code})</span>
                      )}
                    </div>
                    {product.manufacturer && (
                      <p className="text-xs text-gray-500 mb-1">Gamintojas: {product.manufacturer}</p>
                    )}
                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-gray-500">Vidutinis įvertinimas:</span>
                        {renderStars(product.avg_rating)}
                      </div>
                      <p className="text-xs text-gray-500">
                        Įvertinimų: {product.reviews_count}{' '}
                        {product.last_review_date &&
                          `· Paskutinis: ${new Date(product.last_review_date).toLocaleDateString('lt-LT')}`}
                      </p>
                      {product.schedule && (
                        <p className="text-xs text-gray-500">
                          Kokybės patikra kas {product.schedule.interval_value}{' '}
                          {product.schedule.interval_type === 'days'
                            ? 'd.'
                            : product.schedule.interval_type === 'months'
                            ? 'mėn.'
                            : 'm.'}
                          {product.schedule.next_due_date &&
                            ` · Kitas vertinimas: ${new Date(
                              product.schedule.next_due_date
                            ).toLocaleDateString('lt-LT')}`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => openReviewModal(product)}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 text-sm"
                  >
                    <Star className="w-4 h-4" />
                    Įvertinti dabar
                  </button>
                  <button
                    onClick={() => openScheduleModal(product)}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    <Calendar className="w-4 h-4" />
                    Nustatyti intervalą
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Produktų nerasta</p>
          </div>
        )}
      </div>

      {showReviewModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Įvertinti produktą: {selectedProduct.name}
              </h3>
              <button onClick={() => setShowReviewModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Įvertinimas (1–5)</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setReviewForm({ ...reviewForm, rating: value })}
                      className={`p-1 rounded-full hover:scale-110 transition-transform ${
                        reviewForm.rating >= value ? 'text-yellow-500' : 'text-gray-300'
                      }`}
                    >
                      <Star className={`w-6 h-6 ${reviewForm.rating >= value ? 'fill-yellow-400' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Komentaras</label>
                <textarea
                  value={reviewForm.comment}
                  onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Aprašykite problemą ar pastabas (pvz. 'Batai suplyšo po 2 savaičių')"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveReview}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Išsaugoti įvertinimą
              </button>
            </div>
          </div>
        </div>
      )}

      {showScheduleModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">
                Nustatyti kokybės patikros intervalą: {selectedProduct.name}
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Intervalas</label>
                  <input
                    type="number"
                    min="1"
                    value={scheduleForm.interval_value}
                    onChange={e => setScheduleForm({ ...scheduleForm, interval_value: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vienetai</label>
                  <select
                    value={scheduleForm.interval_type}
                    onChange={e => setScheduleForm({ ...scheduleForm, interval_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="days">Dienos</option>
                    <option value="months">Mėnesiai</option>
                    <option value="years">Metai</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Pvz.: kas 3 mėnesius peržiūrėti darbuotojų atsiliepimus apie batus, pirštines ir pan.
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Atšaukti
              </button>
              <button
                onClick={handleSaveSchedule}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Išsaugoti intervalą
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

