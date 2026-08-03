import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@ggcwork/page:';

export async function getCachedPage(path) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + path);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.data || !parsed.ts) return null;
    return parsed.data;
  } catch (e) {
    return null;
  }
}

export async function saveCachedPage(path, data) {
  try {
    await AsyncStorage.setItem(
      PREFIX + path,
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch (e) {}
}

export async function clearPageCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const pageKeys = keys.filter((k) => k.startsWith(PREFIX));
    if (pageKeys.length) await AsyncStorage.multiRemove(pageKeys);
  } catch (e) {}
}