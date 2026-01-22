import React, { useEffect, useMemo, useState } from 'react';
import axiosClient from '../services/axiosClient';

const safeJsonParse = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeStores = (stores) => {
  if (!Array.isArray(stores)) return [];
  return stores
    .map((s) => ({
      storeId: Number(s.storeId ?? s.id),
      code: s.code ?? '',
      name: s.name ?? '',
      isPrimary: Boolean(s.isPrimary),
    }))
    .filter((s) => Number.isFinite(s.storeId) && s.storeId > 0);
};

const readCachedProfile = () => {
  const user = safeJsonParse(localStorage.getItem('user'));
  const stores = normalizeStores(user?.stores);
  const primaryStoreId = user?.primaryStoreId ? Number(user.primaryStoreId) : null;
  return { stores, primaryStoreId };
};

const StoreSwitcher = ({ className = '' }) => {
  const [stores, setStores] = useState(() => readCachedProfile().stores);
  const [primaryStoreId, setPrimaryStoreId] = useState(() => readCachedProfile().primaryStoreId);
  const [activeStoreId, setActiveStoreId] = useState(() => {
    const raw = localStorage.getItem('activeStoreId');
    const val = raw ? Number(raw) : null;
    return Number.isFinite(val) ? val : null;
  });

  const options = useMemo(() => normalizeStores(stores), [stores]);

  useEffect(() => {
    // If no cached stores, try fetching /auth/me
    if (options.length > 0) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    let mounted = true;
    axiosClient
      .get('/auth/me')
      .then((res) => {
        const user = res?.data?.user;
        if (!mounted || !user) return;

        localStorage.setItem('user', JSON.stringify(user));
        const normalized = normalizeStores(user.stores);
        setStores(normalized);
        const primary = user?.primaryStoreId ? Number(user.primaryStoreId) : null;
        setPrimaryStoreId(Number.isFinite(primary) ? primary : null);
      })
      .catch(() => {
        // ignore
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Ensure activeStoreId exists and is allowed
    if (options.length === 0) return;

    const allowedIds = options.map((s) => s.storeId);
    const fallback =
      (primaryStoreId && allowedIds.includes(primaryStoreId) ? primaryStoreId : null) ??
      (allowedIds.includes(activeStoreId) ? activeStoreId : null) ??
      allowedIds[0];

    if (fallback && fallback !== activeStoreId) {
      setActiveStoreId(fallback);
      localStorage.setItem('activeStoreId', String(fallback));
    }
  }, [options, primaryStoreId, activeStoreId]);

  if (options.length <= 1) return null;

  const handleChange = (e) => {
    const nextId = Number(e.target.value);
    if (!Number.isFinite(nextId)) return;
    setActiveStoreId(nextId);
    localStorage.setItem('activeStoreId', String(nextId));
  };

  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mr-2">Cửa hàng</label>
      <select
        value={activeStoreId ?? ''}
        onChange={handleChange}
        className="rounded-md border px-2 py-1 text-sm bg-white"
      >
        {options.map((s) => (
          <option key={s.storeId} value={s.storeId}>
            {s.code ? `${s.code} - ${s.name}` : s.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default StoreSwitcher;
