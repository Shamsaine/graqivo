'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

type Category = { id: string; name: string; code: string };
type Filed = {
  referenceNumber: string;
  recordDate: string;
  confidentialityLevel: string;
  filingCategory: Category;
};

export function ResourceFilingForm({
  slug,
  resourceId,
  canEdit,
  filed,
  onComplete,
}: {
  slug: string;
  resourceId: string;
  canEdit: boolean;
  filed?: Filed;
  onComplete: () => void;
}) {
  const base = '/workspaces/' + encodeURIComponent(slug);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Category[]>(base + '/filing/categories')
      .then(setCategories)
      .catch((failure) => {
        setError(
          failure instanceof Error ? failure.message : 'Categories unavailable',
        );
      });
  }, [slug]);
  if (!canEdit) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(
        base + '/resources/' + encodeURIComponent(resourceId) + '/filing',
        {
          method: 'POST',
          body: {
            filingCategoryId: String(values.get('filingCategoryId')),
            recordDate: String(values.get('recordDate')),
            confidentialityLevel: String(values.get('confidentialityLevel')),
          },
        },
      );
      onComplete();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Filing failed');
    } finally {
      setBusy(false);
    }
  }
  async function unfile() {
    setBusy(true);
    try {
      await api(
        base + '/resources/' + encodeURIComponent(resourceId) + '/filing',
        { method: 'DELETE' },
      );
      onComplete();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unfiling failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="core-panel">
      <h3>Filing information</h3>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {filed && (
        <p>
          <strong>{filed.referenceNumber}</strong> · {filed.filingCategory.name}
        </p>
      )}
      <form className="core-form" onSubmit={submit}>
        <label>
          Filing category
          <select
            name="filingCategoryId"
            required
            defaultValue={filed?.filingCategory.id ?? ''}
          >
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.code} · {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Record date
          <input
            type="date"
            name="recordDate"
            defaultValue={
              filed?.recordDate.slice(0, 10) ??
              new Date().toISOString().slice(0, 10)
            }
            required
          />
        </label>
        <label>
          Confidentiality
          <select
            name="confidentialityLevel"
            defaultValue={filed?.confidentialityLevel ?? 'INTERNAL'}
          >
            <option value="PUBLIC">Public</option>
            <option value="INTERNAL">Internal</option>
            <option value="CONFIDENTIAL">Confidential</option>
            <option value="RESTRICTED">Restricted</option>
          </select>
        </label>
        <div className="form-grid">
          <button className="button" disabled={busy || !categories.length}>
            {filed ? 'Update filing' : 'Add to filing'}
          </button>
          {filed && (
            <button
              type="button"
              className="plain-button"
              disabled={busy}
              onClick={unfile}
            >
              Remove from filing
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
