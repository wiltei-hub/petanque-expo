import AsyncStorage from '@react-native-async-storage/async-storage';

export const Storage = {
  async get(key) {
    try {
      const val = await AsyncStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch (e) { return null; }
  },
  async set(key, value) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  },
  async remove(key) {
    try { await AsyncStorage.removeItem(key); } catch (e) {}
  }
};

export const TARGETS = {
  legen:     { w: 45, e: 35, s: 55, tol: 8 },
  schiessen: { w: 30, e: 50, s: 80, tol: 8 },
  sonstiges: { w: 45, e: 35, s: 55, tol: 10 },
};

export function buildFileName(athName, disc, date) {
  const d = date || new Date();
  const ts = String(d.getFullYear()) +
    String(d.getMonth()+1).padStart(2,'0') +
    String(d.getDate()).padStart(2,'0') + '_' +
    String(d.getHours()).padStart(2,'0') +
    String(d.getMinutes()).padStart(2,'0');
  const discLabel = { legen:'Legen', schiessen:'Schiessen', sonstiges:'Sonstiges' }[disc] || disc;
  const cleanName = athName.trim().replace(/\s+/g,'_');
  return `${cleanName}_${discLabel}_${ts}.mp4`;
}

export const COLORS = [
  '#00c8a0', '#3b8cff', '#f0a500', '#D4537E', '#639922'
];

export function getColor(idx) {
  return COLORS[idx % COLORS.length];
}
