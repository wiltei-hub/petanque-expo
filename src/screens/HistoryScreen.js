import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Storage } from '../utils/storage';

const DISC_LABELS = { legen:'Legen', schiessen:'Schießen', sonstiges:'Sonstiges' };
const DISC_COLORS = { legen:'#00c8a0', schiessen:'#3b8cff', sonstiges:'#f0a500' };

export default function HistoryScreen() {
  const [sessions, setSessions]   = useState([]);
  const [athletes, setAthletes]   = useState([]);
  const [filter, setFilter]       = useState('alle');

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const s = await Storage.get('pc_sessions') || [];
    const a = await Storage.get('pc_athletes') || [];
    setSessions(s);
    setAthletes(a);
  }

  async function deleteSession(id) {
    Alert.alert('Löschen','Diese Analyse löschen?',[
      { text:'Abbrechen', style:'cancel' },
      { text:'Löschen', style:'destructive', onPress: async () => {
        const updated = sessions.filter(s => s.id !== id);
        await Storage.set('pc_sessions', updated);
        setSessions(updated);
      }}
    ]);
  }

  async function exportPDF() {
    const filtered = getFiltered();
    if (!filtered.length) { Alert.alert('Keine Daten','Keine Analysen zum Exportieren.'); return; }
    const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>PétanqueCoach Report</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:28px;color:#222;}
h1{color:#007a62;border-bottom:2px solid #007a62;padding-bottom:6px;}
h2{color:#444;margin-top:20px;}
.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0;}
.sc{background:#f4f4f4;border-radius:7px;padding:10px;text-align:center;}
.sc .v{font-size:20px;font-weight:bold;color:#007a62;}
.sc .l{font-size:10px;color:#888;margin-top:3px;}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;}
th{background:#007a62;color:white;padding:7px 8px;text-align:left;}
td{padding:6px 8px;border-bottom:1px solid #eee;}
tr:nth-child(even){background:#f9f9f9;}
.g{color:#007a62;font-weight:bold;}.w{color:#c47a00;font-weight:bold;}.b{color:#c0392b;font-weight:bold;}
.chip{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:bold;}
.cl{background:#d4f5ec;color:#007a62;}.cs{background:#d8e8fb;color:#2563a8;}.co{background:#fef3d0;color:#9a6200;}
.footer{margin-top:24px;font-size:10px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:8px;}
</style></head><body>
<h1>PétanqueCoach — Trainingsreport</h1>
<p><strong>Filter:</strong> ${filter==='alle'?'Alle':filter} &nbsp;|&nbsp;
<strong>Erstellt:</strong> ${new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} &nbsp;|&nbsp;
<strong>Analysen:</strong> ${filtered.length}</p>
<h2>Zusammenfassung</h2>
<div class="sum">
<div class="sc"><div class="v">${avg(filtered.map(s=>s.score))}%</div><div class="l">Ø Score</div></div>
<div class="sc"><div class="v">${avg(filtered.map(s=>s.wrist))}°</div><div class="l">Ø Handgelenk</div></div>
<div class="sc"><div class="v">${avg(filtered.map(s=>s.elbow))}°</div><div class="l">Ø Ellbogen</div></div>
<div class="sc"><div class="v">${avg(filtered.map(s=>s.shoulder))}°</div><div class="l">Ø Schulter</div></div>
</div>
<h2>Alle Analysen</h2>
<table><tr><th>Datum</th><th>Athlet</th><th>Disziplin</th><th>Score</th><th>Handg.</th><th>Ellb.</th><th>Schulter</th><th>Video</th><th>Notiz</th></tr>
${filtered.map(s=>{
  const sc=s.score>=75?'g':s.score>=50?'w':'b';
  const chip=s.disc==='legen'?'cl':s.disc==='schiessen'?'cs':'co';
  const dl=DISC_LABELS[s.disc]||s.disc;
  return `<tr><td>${s.date} ${s.time}</td><td>${s.athleteName}</td><td><span class="chip ${chip}">${dl}</span></td><td class="${sc}">${s.score}%</td><td>${s.wrist}°</td><td>${s.elbow}°</td><td>${s.shoulder}°</td><td style="font-size:9px">${s.videoName||'—'}</td><td style="font-style:italic">${s.note||'—'}</td></tr>`;
}).join('')}
</table>
<div class="footer">PétanqueCoach — Automatisch generierter Trainingsbericht</div>
</body></html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType:'application/pdf', dialogTitle:'Report teilen' });
    } catch(e) { Alert.alert('Fehler', e.message); }
  }

  function getFiltered() {
    if (filter === 'alle') return sessions;
    if (['legen','schiessen','sonstiges'].includes(filter))
      return sessions.filter(s => s.disc === filter);
    return sessions.filter(s => s.athleteId == filter);
  }

  const filtered = getFiltered();

  const renderSession = ({ item }) => {
    const sc = item.score>=75?'#00c8a0':item.score>=50?'#f0a500':'#e24b4a';
    const dc = DISC_COLORS[item.disc]||'#8b949e';
    const dl = DISC_LABELS[item.disc]||item.disc;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{flex:1,flexDirection:'row',alignItems:'center',gap:8}}>
            <View style={[styles.discChip,{backgroundColor:dc+'22',borderColor:dc+'55'}]}>
              <Text style={[styles.discChipTxt,{color:dc}]}>{dl}</Text>
            </View>
            <Text style={styles.cardName}>{item.athleteName}</Text>
          </View>
          <Text style={[styles.cardScore,{color:sc}]}>{item.score}%</Text>
          <TouchableOpacity onPress={() => deleteSession(item.id)}>
            <Text style={styles.delTxt}>✕</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.cardMeta}>{item.date} {item.time}</Text>
        {item.videoName && <Text style={styles.videoName} numberOfLines={1}>📹 {item.videoName}</Text>}
        <View style={styles.metricsRow}>
          <Text style={styles.metric}>Handg.: <Text style={styles.metricVal}>{item.wrist}°</Text></Text>
          <Text style={styles.metric}>Ellb.: <Text style={styles.metricVal}>{item.elbow}°</Text></Text>
          <Text style={styles.metric}>Schulter: <Text style={styles.metricVal}>{item.shoulder}°</Text></Text>
        </View>
        {item.note ? <Text style={styles.note}>"{item.note}"</Text> : null}
      </View>
    );
  };

  const filterBtns = [
    { key:'alle', label:'Alle' },
    { key:'legen', label:'Legen' },
    { key:'schiessen', label:'Schießen' },
    { key:'sonstiges', label:'Sonstiges' },
    ...athletes.map(a => ({ key:String(a.id), label:a.name }))
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Analyse-Verlauf</Text>
        <TouchableOpacity style={styles.pdfBtn} onPress={exportPDF}>
          <Text style={styles.pdfBtnTxt}>PDF Report</Text>
        </TouchableOpacity>
      </View>

      <FlatList horizontal data={filterBtns} keyExtractor={i=>i.key}
        style={styles.filterBar} contentContainerStyle={{gap:6,padding:10}}
        showsHorizontalScrollIndicator={false}
        renderItem={({item}) => (
          <TouchableOpacity style={[styles.filterBtn, filter===item.key && styles.filterBtnOn]}
            onPress={() => setFilter(item.key)}>
            <Text style={[styles.filterBtnTxt, filter===item.key && styles.filterBtnTxtOn]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTxt}>Keine Analysen in dieser Kategorie</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={i=>String(i.id)} renderItem={renderSession}
          contentContainerStyle={{gap:8, padding:12}} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex:1, backgroundColor:'#0d1117' },
  header:       { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:12, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,.09)' },
  title:        { fontSize:16, fontWeight:'700', color:'#e6edf3' },
  pdfBtn:       { backgroundColor:'#3b8cff', paddingHorizontal:14, paddingVertical:6, borderRadius:8 },
  pdfBtnTxt:    { color:'#fff', fontWeight:'700', fontSize:12 },
  filterBar:    { maxHeight:48, borderBottomWidth:1, borderBottomColor:'rgba(255,255,255,.09)' },
  filterBtn:    { paddingHorizontal:12, paddingVertical:5, borderRadius:20, borderWidth:1, borderColor:'rgba(255,255,255,.09)' },
  filterBtnOn:  { backgroundColor:'rgba(0,200,160,.15)', borderColor:'#00c8a0' },
  filterBtnTxt: { color:'#8b949e', fontSize:11 },
  filterBtnTxtOn:{ color:'#00c8a0' },
  empty:        { flex:1, alignItems:'center', justifyContent:'center' },
  emptyTxt:     { color:'#8b949e', fontSize:14 },
  card:         { backgroundColor:'#161b22', borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,.09)', padding:10 },
  cardTop:      { flexDirection:'row', alignItems:'center', gap:8, marginBottom:3 },
  discChip:     { borderWidth:1, borderRadius:4, paddingHorizontal:6, paddingVertical:1 },
  discChipTxt:  { fontSize:10, fontWeight:'700' },
  cardName:     { fontSize:12, fontWeight:'600', color:'#e6edf3', flex:1 },
  cardScore:    { fontSize:15, fontWeight:'700' },
  delTxt:       { color:'#e24b4a', fontSize:12, padding:4 },
  cardMeta:     { fontSize:10, color:'#8b949e', marginBottom:4 },
  videoName:    { fontSize:10, color:'#8b949e', marginBottom:4 },
  metricsRow:   { flexDirection:'row', gap:12, flexWrap:'wrap' },
  metric:       { fontSize:11, color:'#8b949e' },
  metricVal:    { color:'#e6edf3', fontWeight:'600' },
  note:         { fontSize:11, color:'#8b949e', fontStyle:'italic', marginTop:6, borderTopWidth:1, borderTopColor:'rgba(255,255,255,.09)', paddingTop:5 },
});
