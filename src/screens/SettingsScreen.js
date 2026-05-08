import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Switch
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Storage } from '../utils/storage';

export default function SettingsScreen() {
  const [settings, setSettings] = useState({
    legen:     { w:'45', e:'35', s:'55', tol:'8' },
    schiessen: { w:'30', e:'50', s:'80', tol:'8' },
  });

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const s = await Storage.get('pc_settings');
    if (s) setSettings({
      legen:     { w:String(s.legen.w), e:String(s.legen.e), s:String(s.legen.s), tol:String(s.legen.tol) },
      schiessen: { w:String(s.schiessen.w), e:String(s.schiessen.e), s:String(s.schiessen.s), tol:String(s.schiessen.tol) },
    });
  }

  async function saveSettings() {
    const parsed = {
      legen:     { w:+settings.legen.w, e:+settings.legen.e, s:+settings.legen.s, tol:+settings.legen.tol },
      schiessen: { w:+settings.schiessen.w, e:+settings.schiessen.e, s:+settings.schiessen.s, tol:+settings.schiessen.tol },
    };
    await Storage.set('pc_settings', parsed);
    Alert.alert('Gespeichert', 'Einstellungen wurden gespeichert.');
  }

  function updateSetting(disc, field, val) {
    setSettings(prev => ({ ...prev, [disc]: { ...prev[disc], [field]: val } }));
  }

  async function exportData() {
    try {
      const athletes  = await Storage.get('pc_athletes')  || [];
      const sessions  = await Storage.get('pc_sessions')  || [];
      const s         = await Storage.get('pc_settings')  || {};
      const data = { version:'2.0', exported: new Date().toISOString(), athletes, sessions, settings: s };
      const json = JSON.stringify(data, null, 2);
      const date = new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\./g,'-');
      const path = FileSystem.documentDirectory + `petanque_backup_${date}.json`;
      await FileSystem.writeAsStringAsync(path, json);
      await Sharing.shareAsync(path, { mimeType:'application/json', dialogTitle:'Backup teilen' });
    } catch(e) { Alert.alert('Fehler', e.message); }
  }

  async function importData() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type:'application/json', copyToCacheDirectory:true });
      if (result.canceled || !result.assets?.length) return;
      const json = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const data = JSON.parse(json);
      if (!data.version || !data.athletes) { Alert.alert('Ungültige Datei','Kein PétanqueCoach-Backup.'); return; }

      Alert.alert('Import',
        `Backup vom ${new Date(data.exported).toLocaleDateString('de-DE')} gefunden:\n${data.athletes.length} Athleten, ${data.sessions.length} Analysen\n\nZusammenführen oder ersetzen?`,
        [
          { text:'Abbrechen', style:'cancel' },
          { text:'Zusammenführen', onPress: async () => {
            const existing = await Storage.get('pc_athletes') || [];
            const existSess = await Storage.get('pc_sessions') || [];
            const existIds = new Set(existing.map(a=>a.id));
            const existSessIds = new Set(existSess.map(s=>s.id));
            const merged = [...existing, ...data.athletes.filter(a=>!existIds.has(a.id))];
            const mergedSess = [...existSess, ...data.sessions.filter(s=>!existSessIds.has(s.id))];
            await Storage.set('pc_athletes', merged);
            await Storage.set('pc_sessions', mergedSess);
            Alert.alert('Fertig', `${merged.length-existing.length} neue Athleten, ${mergedSess.length-existSess.length} neue Analysen importiert.`);
          }},
          { text:'Ersetzen', style:'destructive', onPress: async () => {
            await Storage.set('pc_athletes', data.athletes);
            await Storage.set('pc_sessions', data.sessions);
            if (data.settings) await Storage.set('pc_settings', data.settings);
            Alert.alert('Fertig', 'Alle Daten ersetzt.');
          }},
        ]
      );
    } catch(e) { Alert.alert('Fehler', e.message); }
  }

  async function clearSessions() {
    Alert.alert('Analysen löschen','Alle Analysen löschen? Profile bleiben erhalten.',[
      { text:'Abbrechen', style:'cancel' },
      { text:'Löschen', style:'destructive', onPress: async () => {
        await Storage.set('pc_sessions', []);
        Alert.alert('Erledigt','Alle Analysen gelöscht.');
      }}
    ]);
  }

  async function clearAll() {
    Alert.alert('Alles löschen','ALLE Daten löschen? (Profile + Analysen)',[
      { text:'Abbrechen', style:'cancel' },
      { text:'Alles löschen', style:'destructive', onPress: async () => {
        await Storage.set('pc_athletes', []);
        await Storage.set('pc_sessions', []);
        await Storage.set('pc_settings', null);
        Alert.alert('Erledigt','Alle Daten gelöscht.');
      }}
    ]);
  }

  const AngleFields = ({ disc, color }) => (
    <View style={styles.angleSection}>
      <Text style={[styles.angleTitle, { color }]}>{disc === 'legen' ? 'Legen' : 'Schießen'}</Text>
      <View style={styles.angleRow}>
        {[['Handgelenk','w'],['Ellbogen','e'],['Schulter','s'],['Toleranz','tol']].map(([label,key]) => (
          <View key={key} style={styles.angleField}>
            <Text style={styles.angleLabel}>{label}</Text>
            <TextInput
              style={styles.angleInput}
              value={settings[disc][key]}
              onChangeText={v => updateSetting(disc, key, v)}
              keyboardType="numeric"
              placeholderTextColor="#555"
            />
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding:12, gap:12 }}>

      {/* GLOBAL TARGETS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Globale Winkel-Vorgaben</Text>
        <Text style={styles.cardSub}>Standard für alle Athleten — überschreibbar pro Athlet-Profil</Text>
        <AngleFields disc="legen" color="#00c8a0" />
        <AngleFields disc="schiessen" color="#3b8cff" />
        <TouchableOpacity style={styles.saveBtn} onPress={saveSettings}>
          <Text style={styles.saveBtnTxt}>Einstellungen speichern</Text>
        </TouchableOpacity>
      </View>

      {/* EXPORT / IMPORT */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daten Export / Import</Text>
        <View style={styles.row}>
          <View style={{flex:1}}>
            <Text style={styles.rowLabel}>Alle Daten exportieren</Text>
            <Text style={styles.rowSub}>Athleten, Analysen, Einstellungen als JSON</Text>
          </View>
          <TouchableOpacity style={styles.actionBtn} onPress={exportData}>
            <Text style={styles.actionBtnTxt}>↑ Export</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.row, {marginTop:10}]}>
          <View style={{flex:1}}>
            <Text style={styles.rowLabel}>Daten importieren</Text>
            <Text style={styles.rowSub}>JSON-Backup aus alter Version laden</Text>
          </View>
          <TouchableOpacity style={[styles.actionBtn,{borderColor:'rgba(59,140,255,.4)',backgroundColor:'rgba(59,140,255,.1)'}]} onPress={importData}>
            <Text style={[styles.actionBtnTxt,{color:'#3b8cff'}]}>↓ Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DATA MANAGEMENT */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Daten verwalten</Text>
        <View style={styles.row}>
          <View style={{flex:1}}>
            <Text style={styles.rowLabel}>Analysen löschen</Text>
            <Text style={styles.rowSub}>Profile bleiben erhalten</Text>
          </View>
          <TouchableOpacity style={[styles.actionBtn,{borderColor:'rgba(226,75,74,.3)'}]} onPress={clearSessions}>
            <Text style={[styles.actionBtnTxt,{color:'#e24b4a'}]}>Löschen</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.row,{marginTop:10}]}>
          <View style={{flex:1}}>
            <Text style={styles.rowLabel}>Alle Daten zurücksetzen</Text>
            <Text style={styles.rowSub}>Profile + Analysen werden gelöscht</Text>
          </View>
          <TouchableOpacity style={[styles.actionBtn,{backgroundColor:'#e24b4a',borderColor:'#e24b4a'}]} onPress={clearAll}>
            <Text style={[styles.actionBtnTxt,{color:'#fff'}]}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* INFO */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>App-Info</Text>
        <Text style={styles.info}>PétanqueCoach v2.0</Text>
        <Text style={styles.info}>Expo / React Native — native Android-App</Text>
        <Text style={styles.info}>Alle Daten werden lokal auf dem Gerät gespeichert</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0d1117' },
  card:        { backgroundColor:'#161b22', borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,.09)', padding:14 },
  cardTitle:   { fontSize:13, fontWeight:'700', color:'#e6edf3', marginBottom:4 },
  cardSub:     { fontSize:11, color:'#8b949e', marginBottom:12 },
  angleSection:{ marginBottom:12 },
  angleTitle:  { fontSize:12, fontWeight:'600', marginBottom:8 },
  angleRow:    { flexDirection:'row', gap:8 },
  angleField:  { flex:1, alignItems:'center' },
  angleLabel:  { fontSize:10, color:'#8b949e', marginBottom:4 },
  angleInput:  { backgroundColor:'#1c2230', borderWidth:1, borderColor:'rgba(255,255,255,.09)', borderRadius:8, color:'#e6edf3', fontSize:16, fontWeight:'700', padding:8, width:'100%', textAlign:'center' },
  saveBtn:     { backgroundColor:'#00c8a0', borderRadius:8, padding:10, alignItems:'center', marginTop:8 },
  saveBtnTxt:  { color:'#000', fontWeight:'700', fontSize:13 },
  row:         { flexDirection:'row', alignItems:'center', gap:10 },
  rowLabel:    { fontSize:13, color:'#e6edf3' },
  rowSub:      { fontSize:11, color:'#8b949e', marginTop:2 },
  actionBtn:   { paddingHorizontal:14, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'rgba(0,200,160,.4)', backgroundColor:'rgba(0,200,160,.1)' },
  actionBtnTxt:{ color:'#00c8a0', fontSize:12, fontWeight:'700' },
  info:        { fontSize:12, color:'#8b949e', marginTop:4 },
});
