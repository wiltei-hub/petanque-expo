import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView, Alert
} from 'react-native';
import { Storage, getColor, COLORS } from '../utils/storage';

const DISC_OPTIONS = ['legen', 'schiessen', 'beides'];
const DISC_LABELS  = { legen:'Legen', schiessen:'Schießen', beides:'Beides' };
const LEVEL_OPTIONS = ['Anfänger','Fortgeschritten','Vereinsspieler','Turnierspieler','Profi'];

export default function AthletesScreen({ onSelectAthlete, selectedId }) {
  const [athletes, setAthletes] = useState([]);
  const [modal, setModal]       = useState(false);
  const [editing, setEditing]   = useState(null);
  const [name, setName]         = useState('');
  const [level, setLevel]       = useState('Vereinsspieler');
  const [disc, setDisc]         = useState('beides');
  // Custom angle targets
  const [lw, setLw] = useState(''); const [le, setLe] = useState(''); const [ls, setLs] = useState('');
  const [sw, setSw] = useState(''); const [se, setSe] = useState(''); const [ss, setSs] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const data = await Storage.get('pc_athletes') || [];
    setAthletes(data);
  }

  function openNew() {
    setEditing(null); setName(''); setLevel('Vereinsspieler'); setDisc('beides');
    setLw(''); setLe(''); setLs(''); setSw(''); setSe(''); setSs('');
    setModal(true);
  }

  function openEdit(ath) {
    setEditing(ath);
    setName(ath.name); setLevel(ath.level); setDisc(ath.tech);
    setLw(ath.angles?.legen?.w||''); setLe(ath.angles?.legen?.e||''); setLs(ath.angles?.legen?.s||'');
    setSw(ath.angles?.schiessen?.w||''); setSe(ath.angles?.schiessen?.e||''); setSs(ath.angles?.schiessen?.s||'');
    setModal(true);
  }

  async function save() {
    if (!name.trim()) { Alert.alert('Name fehlt','Bitte einen Namen eingeben.'); return; }
    const updated = [...athletes];
    const angles = {
      legen:     { w: +lw||null, e: +le||null, s: +ls||null },
      schiessen: { w: +sw||null, e: +se||null, s: +ss||null },
    };
    if (editing) {
      const idx = updated.findIndex(a => a.id === editing.id);
      if (idx >= 0) updated[idx] = { ...updated[idx], name, level, tech: disc, angles };
    } else {
      updated.push({
        id: Date.now(), name, level, tech: disc, angles,
        colorIdx: updated.length % COLORS.length,
        sessions: 0, lastScore: null
      });
    }
    await Storage.set('pc_athletes', updated);
    setAthletes(updated);
    setModal(false);
  }

  async function del(id) {
    Alert.alert('Löschen','Athleten-Profil wirklich löschen?',[
      { text:'Abbrechen', style:'cancel' },
      { text:'Löschen', style:'destructive', onPress: async () => {
        const updated = athletes.filter(a => a.id !== id);
        await Storage.set('pc_athletes', updated);
        setAthletes(updated);
      }}
    ]);
  }

  const renderAthlete = ({ item }) => {
    const color = getColor(item.colorIdx||0);
    const selected = item.id === selectedId;
    const hasCustom = item.angles && (
      Object.values(item.angles.legen||{}).some(v=>v) ||
      Object.values(item.angles.schiessen||{}).some(v=>v)
    );
    return (
      <TouchableOpacity
        style={[styles.card, selected && { borderColor: color }]}
        onPress={() => onSelectAthlete(item)}
      >
        <View style={[styles.avatar, { backgroundColor: color+'33', borderColor: color }]}>
          <Text style={[styles.avatarTxt, { color }]}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          <Text style={styles.cardMeta}>
            {item.level} · {DISC_LABELS[item.tech]||item.tech} · {item.sessions||0} Analysen
            {hasCustom ? ' · ⚙ eigene Vorgaben' : ''}
          </Text>
        </View>
        <Text style={[styles.score, {
          color: !item.lastScore ? '#8b949e' : item.lastScore>=75 ? '#00c8a0' : item.lastScore>=50 ? '#f0a500' : '#e24b4a'
        }]}>{item.lastScore != null ? item.lastScore+'%' : '—'}</Text>
        <TouchableOpacity onPress={() => openEdit(item)} style={styles.editBtn}>
          <Text style={styles.editBtnTxt}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => del(item.id)} style={styles.delBtn}>
          <Text style={styles.delBtnTxt}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Athleten-Profile</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Text style={styles.addBtnTxt}>+ Neu</Text>
        </TouchableOpacity>
      </View>

      {athletes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>Noch keine Athleten — tippe auf "+ Neu"</Text>
        </View>
      ) : (
        <FlatList data={athletes} keyExtractor={i=>String(i.id)} renderItem={renderAthlete}
          contentContainerStyle={{ gap: 8, padding: 12 }} />
      )}

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBg}>
          <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{editing ? 'Athlet bearbeiten' : 'Neuer Athlet'}</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName}
              placeholder="z.B. Klaus Müller" placeholderTextColor="#8b949e" />

            <Text style={styles.label}>Spielklasse / Gruppe</Text>
            <TextInput style={styles.input} value={level} onChangeText={setLevel}
              placeholder="z.B. Vereinsspieler, Jugend U16…" placeholderTextColor="#8b949e" />

            <Text style={styles.label}>Bevorzugte Disziplin</Text>
            <View style={styles.btnRow}>
              {DISC_OPTIONS.map(d => (
                <TouchableOpacity key={d}
                  style={[styles.optBtn, disc===d && styles.optBtnOn]}
                  onPress={() => setDisc(d)}>
                  <Text style={[styles.optBtnTxt, disc===d && styles.optBtnTxtOn]}>
                    {DISC_LABELS[d]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, {marginTop:14, color:'#00c8a0'}]}>Winkel-Vorgaben Legen (leer = global)</Text>
            <View style={styles.angleRow}>
              {[['Handgelenk',lw,setLw],['Ellbogen',le,setLe],['Schulter',ls,setLs]].map(([n,v,s])=>(
                <View key={n} style={styles.angleField}>
                  <Text style={styles.angleLabel}>{n}</Text>
                  <TextInput style={styles.angleInput} value={String(v)} onChangeText={s}
                    keyboardType="numeric" placeholder="45" placeholderTextColor="#555" />
                </View>
              ))}
            </View>

            <Text style={[styles.label, {marginTop:10, color:'#3b8cff'}]}>Winkel-Vorgaben Schießen</Text>
            <View style={styles.angleRow}>
              {[['Handgelenk',sw,setSw],['Ellbogen',se,setSe],['Schulter',ss,setSs]].map(([n,v,s])=>(
                <View key={n} style={styles.angleField}>
                  <Text style={styles.angleLabel}>{n}</Text>
                  <TextInput style={styles.angleInput} value={String(v)} onChangeText={s}
                    keyboardType="numeric" placeholder="30" placeholderTextColor="#555" />
                </View>
              ))}
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModal(false)}>
                <Text style={styles.cancelBtnTxt}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveBtnTxt}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex:1, backgroundColor:'#0d1117' },
  header:      { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,.09)' },
  title:       { fontSize:16, fontWeight:'700', color:'#e6edf3' },
  addBtn:      { backgroundColor:'#00c8a0', paddingHorizontal:14, paddingVertical:6, borderRadius:8 },
  addBtnTxt:   { color:'#000', fontWeight:'700', fontSize:13 },
  empty:       { flex:1, alignItems:'center', justifyContent:'center' },
  emptyTxt:    { color:'#8b949e', fontSize:14 },
  card:        { backgroundColor:'#161b22', borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,.09)', padding:12, flexDirection:'row', alignItems:'center', gap:10 },
  avatar:      { width:40, height:40, borderRadius:20, borderWidth:1, alignItems:'center', justifyContent:'center' },
  avatarTxt:   { fontSize:16, fontWeight:'700' },
  cardInfo:    { flex:1 },
  cardName:    { fontSize:14, fontWeight:'600', color:'#e6edf3' },
  cardMeta:    { fontSize:11, color:'#8b949e', marginTop:2 },
  score:       { fontSize:16, fontWeight:'700' },
  editBtn:     { padding:6, borderRadius:6, borderWidth:1, borderColor:'rgba(59,140,255,.3)' },
  editBtnTxt:  { color:'#3b8cff', fontSize:12 },
  delBtn:      { padding:6, borderRadius:6, borderWidth:1, borderColor:'rgba(226,75,74,.3)' },
  delBtnTxt:   { color:'#e24b4a', fontSize:12 },
  modalBg:     { flex:1, backgroundColor:'rgba(0,0,0,.8)', justifyContent:'center', padding:16 },
  modalBox:    { backgroundColor:'#161b22', borderRadius:14, borderWidth:1, borderColor:'rgba(255,255,255,.09)', padding:20, maxHeight:'90%' },
  modalTitle:  { fontSize:16, fontWeight:'700', color:'#e6edf3', marginBottom:14 },
  label:       { fontSize:12, color:'#8b949e', marginBottom:4, marginTop:8 },
  input:       { backgroundColor:'#1c2230', borderWidth:1, borderColor:'rgba(255,255,255,.09)', borderRadius:8, color:'#e6edf3', fontSize:14, padding:10 },
  btnRow:      { flexDirection:'row', gap:8 },
  optBtn:      { flex:1, padding:8, borderRadius:8, borderWidth:1, borderColor:'rgba(255,255,255,.09)', alignItems:'center' },
  optBtnOn:    { backgroundColor:'rgba(0,200,160,.15)', borderColor:'#00c8a0' },
  optBtnTxt:   { color:'#8b949e', fontSize:13 },
  optBtnTxtOn: { color:'#00c8a0' },
  angleRow:    { flexDirection:'row', gap:8 },
  angleField:  { flex:1, alignItems:'center' },
  angleLabel:  { fontSize:10, color:'#8b949e', marginBottom:4 },
  angleInput:  { backgroundColor:'#1c2230', borderWidth:1, borderColor:'rgba(255,255,255,.09)', borderRadius:8, color:'#e6edf3', fontSize:16, fontWeight:'700', padding:8, width:'100%', textAlign:'center' },
  modalBtns:   { flexDirection:'row', gap:8, marginTop:16, justifyContent:'flex-end' },
  cancelBtn:   { padding:10, borderRadius:8, borderWidth:1, borderColor:'rgba(255,255,255,.09)' },
  cancelBtnTxt:{ color:'#8b949e', fontSize:13 },
  saveBtn:     { padding:10, paddingHorizontal:20, borderRadius:8, backgroundColor:'#00c8a0' },
  saveBtnTxt:  { color:'#000', fontWeight:'700', fontSize:13 },
});
