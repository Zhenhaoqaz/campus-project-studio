const unavailable = {
  getItem() {
    return null;
  },
  setItem() {
    throw new Error('浏览器存储不可用');
  },
  removeItem() {
    throw new Error('浏览器存储不可用');
  },
};

export function resolveBrowserStorage(browser) {
  try {
    return browser?.localStorage || unavailable;
  } catch {
    return unavailable;
  }
}

export const workspaceStorage = resolveBrowserStorage(
  typeof window === 'undefined' ? null : window,
);

export function readStoredValue(storage, key, fallback = '') {
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function normalizeView(view) {
  return ['overview', 'chat', 'tasks', 'library'].includes(view) ? view : 'overview';
}
