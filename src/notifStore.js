import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@ggcwork/last-seen';

export async function loadLastSeen() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export async function saveLastSeen(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}
