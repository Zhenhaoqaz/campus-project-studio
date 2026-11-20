export const DEFAULT_PREFERENCES = Object.freeze({
  readingSize: 'standard',
  contrast: 'clear',
  sendShortcut: 'enter',
  autoScroll: true,
  sourcesVisible: true,
  reduceMotion: false,
});
const KEY = 'campus-preferences-v1';
export function normalizePreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const result = { ...DEFAULT_PREFERENCES };
  for (const [key, allowed] of Object.entries({
    readingSize: ['standard', 'large'],
    contrast: ['clear', 'soft'],
    sendShortcut: ['enter', 'mod-enter'],
  }))
    if (allowed.includes(input[key])) result[key] = input[key];
  for (const key of ['autoScroll', 'sourcesVisible', 'reduceMotion'])
    if (typeof input[key] === 'boolean') result[key] = input[key];
  return result;
}
export function readPreferences(storage) {
  try {
    return normalizePreferences(JSON.parse(storage.getItem(KEY) || 'null'));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
export function writePreferences(storage, value) {
  try {
    storage.setItem(KEY, JSON.stringify(normalizePreferences(value)));
    return true;
  } catch {
    return false;
  }
}
export function shouldSendKey(event, preferences) {
  if (
    event.key !== 'Enter' ||
    event.shiftKey ||
    event.altKey ||
    event.isComposing ||
    event.nativeEvent?.isComposing ||
    event.keyCode === 229
  )
    return false;
  return preferences.sendShortcut === 'mod-enter' ? !!(event.ctrlKey || event.metaKey) : true;
}
