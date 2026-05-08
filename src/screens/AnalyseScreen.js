import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, TextInput, Modal, Dimensions, Switch, useWindowDimensions,
  PanResponder
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { WebView } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { Storage, TARGETS, buildFileName, getColor } from '../utils/storage';
import { initTF, isTFReady } from '../utils/poseDetection';
import VideoDrawer from '../components/VideoDrawer';

const DISC_LABELS = { legen:'Legen', schiessen:'Schießen', sonstiges:'Sonstiges' };
const { width: SW } = Dimensions.get('window');

// MediaPipe HTML that runs inside WebView for real pose detection
const MEDIAPIPE_HTML = (videoBase64, mimeType) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;}
canvas{max-width:100%;} #status{color:#00c8a0;font-family:sans-serif;font-size:12px;padding:8px;}
</style></head><body>
<div id="status">Lade MediaPipe…</div>
<canvas id="canvas" width="640" height="360"></canvas>
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js"></script>
<script>
const status = document.getElementById('status');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function ang(A,B,C){
  const ax=A.x-B.x,ay=A.y-B.y,cx=C.x-B.x,cy=C.y-B.y;
  const dot=ax*cx+ay*cy,mag=Math.sqrt((ax*ax+ay*ay)*(cx*cx+cy*cy));
  return mag===0?0:Math.round(Math.acos(Math.max(-1,Math.min(1,dot/mag)))*180/Math.PI);
}

const pose = new Pose({locateFile:f=>'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/'+f});
pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});

pose.onResults(results => {
  ctx.clearRect(0,0,640,360);
  if(!results.poseLandmarks){
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'Keine Person erkannt'}));
    return;
  }
  const lm = results.poseLandmarks;
  const W=640,H=360;

  // Draw skeleton
  const CONN=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];
  CONN.forEach(([a,b])=>{
    const A=lm[a],B=lm[b];
    if(!A||!B||A.visibility<.3||B.visibility<.3)return;
    ctx.beginPath();ctx.moveTo(A.x*W,A.y*H);ctx.lineTo(B.x*W,B.y*H);
    ctx.strokeStyle='rgba(0,200,160,.8)';ctx.lineWidth=3;ctx.stroke();
  });
  [11,12,13,14,15,16,23,24].forEach(i=>{
    const p=lm[i];if(!p||p.visibility<.3)return;
    ctx.beginPath();ctx.arc(p.x*W,p.y*H,5,0,Math.PI*2);
    ctx.fillStyle=(i===14||i===16)?'#f0a500':'#00c8a0';ctx.fill();
  });

  // Calculate angles - right arm
  const wr=lm[16],el=lm[14],sh=lm[12],hi=lm[24];
  if(wr&&el&&sh&&hi&&wr.visibility>.3&&el.visibility>.3&&sh.visibility>.3){
    const wA=ang(el,wr,{x:wr.x,y:wr.y-.1});
    const eA=ang(sh,el,wr);
    const sA=ang(hi,sh,el);

    // Draw angle labels
    [[el,eA,'Ellb.'],[wr,wA,'Handg.'],[sh,sA,'Schulter']].forEach(([kp,angle,name])=>{
      const x=kp.x*W+8,y=kp.y*H-8;
      ctx.fillStyle='rgba(13,17,23,.85)';
      ctx.fillRect(x-2,y-14,(name+': '+angle+'°').length*7+8,18);
      ctx.fillStyle='#00c8a0';ctx.font='bold 12px sans-serif';
      ctx.fillText(name+': '+angle+'°',x+3,y);
    });

    // Send results back to React Native
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type:'angles',
      wrist:wA, elbow:eA, shoulder:sA,
      keypoints:{
        wrist:{x:wr.x*W,y:wr.y*H},
        elbow:{x:el.x*W,y:el.y*H},
        shoulder:{x:sh.x*W,y:sh.y*H}
      }
    }));
    status.textContent='Analyse fertig ✓';
  } else {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'Gelenke nicht sichtbar'}));
  }
});

// Load image and run pose detection
const img = new Image();
img.onload = async () => {
  ctx.drawImage(img, 0, 0, 640, 360);
  status.textContent='Erkenne Pose…';
  await pose.send({image:canvas});
};
img.onerror = () => {
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',msg:'Bild konnte nicht geladen werden'}));
};
img.src = 'data:${mimeType};base64,${videoBase64}';
</script></body></html>`;

export default function AnalyseScreen({ athlete, onNeedAthlete }) {
  const [disc, setDisc]             = useState('legen');
  const [athVideo, setAthVideo]     = useState(null);
  const [refVideo, setRefVideo]     = useState(null);
  const [loadingAth, setLoadingAth] = useState(false);
  const [loadingRef, setLoadingRef] = useState(false);
  const [score, setScore]           = useState(null);
  const [metrics, setMetrics]       = useState(null);
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [analysing, setAnalysing]   = useState(false);
  const [analyseHTML, setAnalyseHTML] = useState(null);
  const [showWebView, setShowWebView] = useState(false);

  const athRef = useRef(null);
  const refRef = useRef(null);

  function getTgt() {
    const gs = TARGETS[disc]||TARGETS.legen;
    if (!athlete?.angles?.[disc]) return gs;
    const o = athlete.angles[disc];
    return { w:o.w||gs.w, e:o.e||gs.e, s:o.s||gs.s, tol:gs.tol };
  }

  async function pickVideo(who) {
    if (who==='ath' && !athlete) {
      Alert.alert('Kein Athlet','Bitte zuerst einen Athleten auswählen.');
      onNeedAthlete?.(); return;
    }
    const setLoad = who==='ath' ? setLoadingAth : setLoadingRef;
    try {
      setLoad(true);
      await MediaLibrary.requestPermissionsAsync();
      const result = await DocumentPicker.getDocumentAsync({
        type:'video/*',
        copyToCacheDirectory:true
      });
      if (result.canceled||!result.assets?.length){setLoad(false);return;}
      const asset = result.assets[0];
      const originalName = asset.name || '';
      let fileDate = null;

      // ── Strategie 1: Datum direkt aus Dateiname parsen ──────────────────
      // Unterstützte Muster:
      // KlausMüller_Legen_20260503_1432.mp4  (unsere App)
      // VID_20260503_143200.mp4              (Samsung Kamera)
      // 20260503_143200.mp4                  (andere Kamera-Apps)

      const patterns = [
        // Unser Format: _YYYYMMDD_HHMM
        /[_](\d{4})(\d{2})(\d{2})[_](\d{2})(\d{2})/,
        // Samsung: VID_YYYYMMDD_HHMMSS
        /VID[_](\d{4})(\d{2})(\d{2})[_](\d{2})(\d{2})/,
        // Allgemein: YYYYMMDD_HHMMSS
        /(\d{4})(\d{2})(\d{2})[_](\d{2})(\d{2})/,
      ];

      for (const pattern of patterns) {
        const m = originalName.match(pattern);
        if (m) {
          const parsed = new Date(
            parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]),
            parseInt(m[4]), parseInt(m[5]), 0
          );
          if (!isNaN(parsed) && parsed.getFullYear() >= 2000 && parsed <= new Date()) {
            fileDate = parsed;
            break;
          }
        }
      }

      // ── Strategie 2: MediaLibrary nach Original-Asset suchen ────────────
      if (!fileDate) {
        try {
          const media = await MediaLibrary.getAssetsAsync({
            mediaType: MediaLibrary.MediaType.video,
            first: 100,
            sortBy: [[MediaLibrary.SortBy.creationTime, false]],
          });
          const match = media.assets.find(a =>
            a.filename === originalName
          );
          if (match?.creationTime) {
            const d = new Date(match.creationTime * 1000);
            if (d.getFullYear() >= 2000 && d <= new Date()) fileDate = d;
          }
        } catch(e) { /* ignore */ }
      }

      // ── Strategie 3: Falls alles scheitert — Nutzer informieren ─────────
      if (!fileDate) {
        // Zeige den Originaldateinamen an statt neuen zu generieren
        // Damit der Nutzer weiß welches Video geladen ist
        const sizeMB = asset.size?(asset.size/1024/1024).toFixed(1):'?';
        const setter = who==='ath'?setAthVideo:setRefVideo;
        setter({uri:asset.uri, name:originalName, size:sizeMB, date:new Date()});
        if (who==='ath' && athlete) {
          Alert.alert(
            'Aufnahmedatum unbekannt',
            `Dateiname: ${originalName}

Das Aufnahmedatum konnte nicht ermittelt werden. Der Originaldateiname wird verwendet.

Tipp: Benenne die Datei vor dem Laden um (z.B. ${buildFileName(athlete.name, disc, new Date())})`,
            [{text:'OK'}]
          );
        }
        setLoad(false);
        return;
      }

      // ── Erfolg: Dateiname mit echtem Datum aufbauen ──────────────────────
      const newName = who==='ath' && athlete
        ? buildFileName(athlete.name, disc, fileDate)
        : originalName;
      const sizeMB = asset.size?(asset.size/1024/1024).toFixed(1):'?';
      const setter = who==='ath'?setAthVideo:setRefVideo;
      setter({uri:asset.uri, name:newName, size:sizeMB, date:fileDate});

    } catch(e){ Alert.alert('Fehler','Video konnte nicht geladen werden.'); }
    finally{ setLoad(false); }
  }

  // Real pose detection via MediaPipe in WebView
  async function analyzeFrame() {
    if (!athVideo){Alert.alert('Kein Video','Bitte ein Video laden.');return;}
    await athRef.current?.pauseAsync();
    setAnalysing(true);

    try {
      // Get current frame by reading video file and extracting frame
      // We capture a snapshot of the current video position as JPEG
      const status = await athRef.current?.getStatusAsync();

      // For real frame extraction we use expo-video-thumbnails
      // Fallback: read first frame
      let frameBase64 = null;
      let mimeType = 'image/jpeg';

      try {
        const VideoThumbnails = require('expo-video-thumbnails');
        const { uri } = await VideoThumbnails.getThumbnailAsync(athVideo.uri, {
          time: status?.positionMillis || 0,
          quality: 0.8,
        });
        frameBase64 = await FileSystem.readAsStringAsync(uri, {encoding:FileSystem.EncodingType.Base64});
      } catch(thumbErr) {
        console.log('Thumbnail failed, using fallback:', thumbErr);
        // Fallback simulation
        const t = getTgt();
        const v = () => Math.round((Math.random()-0.5)*20);
        const simW=Math.max(10,Math.min(170,t.w+v()));
        const simE=Math.max(10,Math.min(170,t.e+v()));
        const simS=Math.max(10,Math.min(170,t.s+v()));
        const vals=[simW,simE,simS],tgts=[t.w,t.e,t.s];
        const cls=vals.map((x,i)=>{const d=Math.abs(x-tgts[i]);return d<=t.tol?'g':d<t.tol*2.5?'w':'b';});
        const sc=Math.round(cls.filter(c=>c==='g').length*33+cls.filter(c=>c==='w').length*16);
        // Simulated keypoints positioned naturally on a 640x360 frame
        const simKeypoints = {
          wrist:    { x: 320, y: 280 },
          elbow:    { x: 300, y: 200 },
          shoulder: { x: 280, y: 130 },
        };
        setScore(sc);
        setMetrics({
          wrist:simW, elbow:simE, shoulder:simS,
          cls, tgts,
          keypoints: simKeypoints,
          simulated: true
        });
        setAnalysing(false);
        return;
      }

      // Run MediaPipe in WebView with frame
      if (frameBase64) {
        setAnalyseHTML(MEDIAPIPE_HTML(frameBase64, mimeType));
        setShowWebView(true);
      }
    } catch(e) {
      console.log('Analysis error:', e);
      setAnalysing(false);
    }
  }

  function handleWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setShowWebView(false);
      setAnalysing(false);

      if (data.type === 'error') {
        Alert.alert('Analyse fehlgeschlagen', data.msg);
        return;
      }

      if (data.type === 'angles') {
        const t = getTgt();
        const vals = [data.wrist, data.elbow, data.shoulder];
        const tgts = [t.w, t.e, t.s];
        const cls = vals.map((x,i)=>{const d=Math.abs(x-tgts[i]);return d<=t.tol?'g':d<t.tol*2.5?'w':'b';});
        const sc = Math.round(cls.filter(c=>c==='g').length*33+cls.filter(c=>c==='w').length*16);
        setScore(sc);
        setMetrics({wrist:data.wrist,elbow:data.elbow,shoulder:data.shoulder,cls,tgts,keypoints:data.keypoints,simulated:false});
      }
    } catch(e) { console.log('WebView message error:', e); setAnalysing(false); }
  }

  async function saveSession() {
    if (!metrics){Alert.alert('Nicht analysiert','Bitte erst analysieren.');return;}
    setSaving(true);
    try {
      const sessions=await Storage.get('pc_sessions')||[];
      sessions.unshift({
        id:Date.now(),athleteId:athlete?.id||null,athleteName:athlete?.name||'Unbekannt',
        date:new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}),
        time:new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}),
        disc,score,wrist:metrics.wrist,elbow:metrics.elbow,shoulder:metrics.shoulder,
        videoName:athVideo?.name,note:notes,
        analysisMode:metrics.simulated?'simulation':'mediapipe',
      });
      await Storage.set('pc_sessions',sessions);
      if(athlete){
        const aths=await Storage.get('pc_athletes')||[];
        const idx=aths.findIndex(a=>a.id===athlete.id);
        if(idx>=0){aths[idx].lastScore=score;aths[idx].sessions=(aths[idx].sessions||0)+1;}
        await Storage.set('pc_athletes',aths);
      }
      Alert.alert('Gespeichert!','Analyse gespeichert.');setNotes('');
    } finally{setSaving(false);}
  }

  const sc = !score?'#8b949e':score>=75?'#00c8a0':score>=50?'#f0a500':'#e24b4a';
  const ac = athlete?getColor(athlete.colorIdx||0):'#00c8a0';
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  // In portrait: full width panels stacked, in landscape: side by side
  const pw = isLandscape ? (winW-36)/2 : winW-24;

  const hints = {
    legen:    [['Handgelenk lockerer','Mehr Beugung'],['Arm bis Hüfte halten','Ellbogen mehr öffnen'],['Schulter ruhig','Schulter mehr einbeziehen']],
    schiessen:[['Handgelenk gestreckter','Mehr Beugung für Effet'],['Ellbogen weiter','Ellbogen enger'],['Schulter stärker einsetzen','Schulter weniger']],
  };

  const [showSkeleton, setShowSkeleton] = useState(true);
  const speedRef = useRef(1.0);
  const [speed, setSpeedUi] = useState(1.0);
  function setSpeed(val) { speedRef.current = val; setSpeedUi(val); }
  const SPEEDS = [
    { label:'1/16×', val:0.0625 },
    { label:'1/8×',  val:0.125  },
    { label:'1/4×',  val:0.25   },
    { label:'1/2×',  val:0.5    },
    { label:'1×',    val:1.0    },
  ];

  // ── FRAME CONTROLS ───────────────────────────────────────────────────────
  const FRAME_MS = 1000 / 30; // assume 30fps = 33ms per frame

  const FrameControls = ({ vref, who }) => {
    const [pos, setPos] = useState(0);
    const [dur, setDur] = useState(0);
    const [playing, setPlaying] = useState(false);
    const trackW = useRef(200); // track width measured via onLayout

    // ── Timeline scrub PanResponder ────────────────────────────────────────
    const tlPan = useRef(PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: async evt => {
        await vref.current?.pauseAsync();
        setPlaying(false);
        const x = Math.max(0, evt.nativeEvent.locationX);
        const pct = Math.min(1, x / (trackW.current || 200));
        const status = await vref.current?.getStatusAsync();
        const d = status?.durationMillis || 0;
        const newPos = Math.round(pct * d);
        await vref.current?.setPositionAsync(newPos);
        setPos(newPos);
        setDur(d);
      },

      onPanResponderMove: async evt => {
        const x = Math.max(0, evt.nativeEvent.locationX);
        const pct = Math.min(1, x / (trackW.current || 200));
        const status = await vref.current?.getStatusAsync();
        const d = status?.durationMillis || 0;
        const newPos = Math.round(pct * d);
        await vref.current?.setPositionAsync(newPos);
        setPos(newPos);
        setDur(d);
      },

      onPanResponderRelease: () => {},
    })).current;

    async function getStatus() {
      const s = await vref.current?.getStatusAsync();
      if (s?.isLoaded) { setPos(s.positionMillis||0); setDur(s.durationMillis||0); }
      return s;
    }

    async function seek(ms) {
      const s = await vref.current?.getStatusAsync();
      if (!s?.isLoaded) return;
      const newPos = Math.max(0, Math.min(s.durationMillis||0, ms));
      await vref.current.setPositionAsync(newPos);
      setPos(newPos);
    }

    async function stepFrame(dir) {
      const s = await vref.current?.getStatusAsync();
      if (!s?.isLoaded) return;
      await vref.current.pauseAsync();
      setPlaying(false);
      await seek((s.positionMillis||0) + dir * FRAME_MS);
    }

    async function togglePlay() {
      const s = await vref.current?.getStatusAsync();
      if (!s?.isLoaded) return;
      if (s.isPlaying) {
        await vref.current.pauseAsync();
        setPlaying(false);
      } else {
        await vref.current.setRateAsync(speedRef.current, true);
        await vref.current.playAsync();
        setPlaying(true);
        // Poll position
        const interval = setInterval(async () => {
          const st = await vref.current?.getStatusAsync();
          if (!st?.isLoaded || !st.isPlaying) { clearInterval(interval); setPlaying(false); return; }
          setPos(st.positionMillis||0);
        }, 100);
      }
    }

    async function changeSpeed(val) {
      // Save current position before any state change
      const status = await vref.current?.getStatusAsync();
      const savedPos = status?.positionMillis || 0;
      const wasPlaying = status?.isPlaying || false;

      // Update speed ref first (no re-render)
      setSpeed(val);

      // Restore position after state update
      setTimeout(async () => {
        try {
          if (vref.current) {
            await vref.current.setPositionAsync(savedPos);
            await vref.current.setRateAsync(val, true);
            if (wasPlaying) await vref.current.playAsync();
          }
        } catch(e) { console.log('speed restore error:', e); }
      }, 50);
    }

    function fmt(ms) {
      const s = Math.floor(ms/1000);
      const m = Math.floor(s/60);
      const ss = s%60;
      const fr = Math.floor((ms%1000)/FRAME_MS);
      return `${m}:${String(ss).padStart(2,'0')}.${String(fr).padStart(2,'0')}`;
    }

    const pct = dur > 0 ? (pos/dur)*100 : 0;

    return (
      <View style={S.fcWrap}>
        {/* TIMELINE with draggable scrubber */}
        <View style={S.timeline}>
          <Text style={S.timePos}>{fmt(pos)}</Text>
          <View style={S.tlTrack}
            onLayout={e => { trackW.current = e.nativeEvent.layout.width; }}
            {...tlPan.panHandlers}>
            <View style={[S.tlFill, {width: pct+'%'}]}/>
            <View style={[S.tlThumb, {left: Math.min(pct, 95)+'%'}]}/>
          </View>
          <Text style={S.timeDur}>{fmt(dur)}</Text>
        </View>

        {/* TRANSPORT CONTROLS */}
        <View style={S.transport}>
          <TouchableOpacity style={S.tBtn} onPress={()=>seek(0)}>
            <Text style={S.tTxt}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.tBtn} onPress={()=>stepFrame(-1)}>
            <Text style={S.tTxt}>◀▌</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[S.tBtn, S.playBtn]} onPress={togglePlay}>
            <Text style={[S.tTxt, {fontSize:18, color:'#000'}]}>{playing?'⏸':'▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.tBtn} onPress={()=>stepFrame(1)}>
            <Text style={S.tTxt}>▌▶</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.tBtn} onPress={()=>seek(dur)}>
            <Text style={S.tTxt}>⏭</Text>
          </TouchableOpacity>
        </View>

        {/* SPEED SELECTOR */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.speedRow}>
          <Text style={S.speedLbl}>Geschwindigkeit:</Text>
          {SPEEDS.map(sp => (
            <TouchableOpacity key={sp.val}
              style={[S.speedBtn, speed===sp.val && S.speedOn]}
              onPress={() => changeSpeed(sp.val)}>
              <Text style={[S.speedTxt, speed===sp.val && {color:'#00c8a0'}]}>
                {sp.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const VidPanel = ({ who }) => {
    const vid = who==='ath'?athVideo:refVideo;
    const loading = who==='ath'?loadingAth:loadingRef;
    const vref = who==='ath'?athRef:refRef;
    const bc = who==='ath'?'#3b8cff':'#00c8a0';
    return (
      <View style={[S.vidPanel,{width:pw}]}>
        <View style={S.vidH}>
          <Text style={S.vidT}>{who==='ath'?'Athlet':'Referenz'}</Text>
          <View style={[S.badge,{backgroundColor:bc+'22',borderColor:bc+'55'}]}>
            <Text style={[S.badgeT,{color:bc}]}>{who==='ath'?'Aufnahme':'Idealform'}</Text>
          </View>
        </View>
        {vid ? (
          <>
            <Text style={S.vName} numberOfLines={1}>{vid.name}</Text>
            <Text style={S.vMeta}>{vid.size} MB · {vid.date?.toLocaleDateString?.('de-DE')}</Text>
            <VideoDrawer
              source={{uri:vid.uri}}
              videoRef={vref}
              skeletonData={metrics}
              showSkeleton={showSkeleton && who==='ath'}
            />
            <FrameControls vref={vref} who={who}/>
            <TouchableOpacity style={S.changeB} onPress={()=>pickVideo(who)}>
              <Text style={S.changeT}>↺ Anderes Video</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={S.upArea} onPress={()=>pickVideo(who)}>
            {loading?<ActivityIndicator color="#00c8a0"/>:(
              <>
                <Text style={{fontSize:26}}>{who==='ath'?'📹':'🎯'}</Text>
                <Text style={S.upTxt}>{who==='ath'?'Athleten-Video':'Referenz-Video'}</Text>
                <View style={S.upBtn}><Text style={S.upBtnT}>Auswählen</Text></View>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={{flex:1,backgroundColor:'#0d1117'}}>
    <ScrollView contentContainerStyle={{padding:12,gap:10}}>

      {athlete ? (
        <View style={[S.athB,{borderColor:ac}]}>
          <View style={[S.av,{backgroundColor:ac+'33',borderColor:ac}]}>
            <Text style={[S.avT,{color:ac}]}>{athlete.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{flex:1}}>
            <Text style={S.aN}>{athlete.name}</Text>
            <Text style={S.aS}>{athlete.level} · {DISC_LABELS[disc]}</Text>
          </View>
          <View style={{paddingHorizontal:8,paddingVertical:3,borderRadius:6,backgroundColor:'rgba(0,200,160,.15)'}}>
            <Text style={{fontSize:10,fontWeight:'600',color:'#00c8a0'}}>MediaPipe ready</Text>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={S.noA} onPress={()=>onNeedAthlete?.()}>
          <Text style={S.noAT}>⚠ Athlet wählen → Tab "Athleten"</Text>
        </TouchableOpacity>
      )}

      <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <Text style={{fontSize:12,color:'#8b949e'}}>Disziplin:</Text>
        {['legen','schiessen','sonstiges'].map(d=>(
          <TouchableOpacity key={d} style={[S.dBtn,disc===d&&S.dOn]} onPress={()=>setDisc(d)}>
            <Text style={[S.dT,disc===d&&S.dTOn]}>{DISC_LABELS[d]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{flexDirection: isLandscape ? 'row' : 'column', gap:10}}>
        <VidPanel who="ath"/>
        <VidPanel who="ref"/>
      </View>

      {/* SKELETON TOGGLE */}
      {metrics && (
        <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#161b22',borderRadius:8,padding:8,borderWidth:1,borderColor:'rgba(255,255,255,.09)'}}>
          <Text style={{fontSize:12,color:'#e6edf3'}}>🦴 Skelett-Overlay anzeigen</Text>
          <Switch value={showSkeleton} onValueChange={setShowSkeleton}
            trackColor={{false:'#333',true:'rgba(0,200,160,.4)'}}
            thumbColor={showSkeleton?'#00c8a0':'#888'}/>
        </View>
      )}

      <TouchableOpacity style={S.aBtn} onPress={analyzeFrame} disabled={analysing}>
        {analysing
          ? <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
              <ActivityIndicator color="#000" size="small"/>
              <Text style={S.aBT}>MediaPipe analysiert Frame…</Text>
            </View>
          : <Text style={S.aBT}>▶ Frame analysieren — echte Gelenkwinkel</Text>
        }
      </TouchableOpacity>

      {metrics && (
        <>
          <View style={[S.sRow,{borderColor:metrics.simulated?'rgba(240,165,0,.3)':undefined}]}>
            {metrics.simulated && (
              <View style={{position:'absolute',top:6,right:8}}>
                <Text style={{fontSize:9,color:'#f0a500'}}>⚠ Simulation</Text>
              </View>
            )}
            <View style={[S.sRing,{borderColor:sc}]}>
              <Text style={[S.sNum,{color:sc}]}>{score}%</Text>
            </View>
            <View style={{flex:1,gap:5}}>
              <Text style={{fontSize:11,color:'#8b949e'}}>{athlete?.name} · {DISC_LABELS[disc]}</Text>
              {['Handgelenk','Ellbogen','Schulter'].map((n,i)=>{
                const c=metrics.cls[i];
                const v=[metrics.wrist,metrics.elbow,metrics.shoulder][i];
                const t=metrics.tgts[i];
                const col=c==='g'?'#00c8a0':c==='w'?'#f0a500':'#e24b4a';
                const pct=Math.min(100,Math.round(v/160*100));
                return (
                  <View key={n} style={{gap:2}}>
                    <View style={{flexDirection:'row',justifyContent:'space-between'}}>
                      <Text style={{fontSize:11,color:'#8b949e'}}>{n}</Text>
                      <View style={{flexDirection:'row',gap:6}}>
                        <Text style={{fontSize:12,fontWeight:'700',color:col}}>{v}°</Text>
                        <Text style={{fontSize:10,color:'#8b949e'}}>Ziel: {t}°</Text>
                      </View>
                    </View>
                    <View style={{height:3,backgroundColor:'rgba(255,255,255,.06)',borderRadius:2}}>
                      <View style={{height:3,width:pct+'%',backgroundColor:col,borderRadius:2}}/>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={S.fbCard}>
            <Text style={S.fbTitle}>Coaching-Feedback · {DISC_LABELS[disc]}</Text>
            {['Handgelenk','Ellbogen','Schulter'].map((n,i)=>{
              const c=metrics.cls[i];
              const v=[metrics.wrist,metrics.elbow,metrics.shoulder][i];
              const t=metrics.tgts[i];
              const diff=v-t;
              const col=c==='g'?'#00c8a0':c==='w'?'#f0a500':'#e24b4a';
              const hArr=(hints[disc]||hints.legen)[i];
              const h=c==='g'?'Sehr gut!':hArr[diff>0?0:1];
              return (
                <View key={n} style={{flexDirection:'row',gap:6,alignItems:'flex-start',marginBottom:5}}>
                  <View style={{width:7,height:7,borderRadius:3.5,backgroundColor:col,marginTop:4,flexShrink:0}}/>
                  <Text style={{fontSize:12,color:'#8b949e',flex:1,lineHeight:18}}>
                    <Text style={{color:'#e6edf3',fontWeight:'600'}}>{n}: {v}° ({diff>0?'+':''}{diff}° vom Ziel)</Text>
                    {' — '}{h}
                  </Text>
                </View>
              );
            })}
          </View>

          <TextInput style={S.notes} value={notes} onChangeText={setNotes}
            placeholder="Trainingsnotizen…" placeholderTextColor="#8b949e" multiline numberOfLines={3}/>
          <TouchableOpacity style={S.saveB} onPress={saveSession} disabled={saving}>
            {saving?<ActivityIndicator color="#000"/>:<Text style={S.saveBT}>Analyse speichern</Text>}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>

    {/* MEDIAPIPE WEBVIEW - hidden, runs analysis */}
    <Modal visible={showWebView} animationType="fade" transparent>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,.8)',alignItems:'center',justifyContent:'center',padding:20}}>
        <View style={{backgroundColor:'#161b22',borderRadius:14,overflow:'hidden',width:'90%',height:300}}>
          <Text style={{color:'#00c8a0',padding:10,fontWeight:'700',fontSize:13}}>
            🔍 MediaPipe analysiert Frame…
          </Text>
          {analyseHTML && (
            <WebView
              source={{html: analyseHTML}}
              onMessage={handleWebViewMessage}
              javaScriptEnabled={true}
              style={{flex:1}}
              onError={()=>{setShowWebView(false);setAnalysing(false);}}
            />
          )}
          <TouchableOpacity onPress={()=>{setShowWebView(false);setAnalysing(false);}}
            style={{padding:10,alignItems:'center',borderTopWidth:1,borderTopColor:'rgba(255,255,255,.09)'}}>
            <Text style={{color:'#8b949e',fontSize:12}}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>


    </View>
  );
}

const S = StyleSheet.create({
  athB:{backgroundColor:'#161b22',borderRadius:10,borderWidth:2,padding:10,flexDirection:'row',alignItems:'center',gap:10},
  av:{width:36,height:36,borderRadius:18,borderWidth:1,alignItems:'center',justifyContent:'center'},
  avT:{fontSize:14,fontWeight:'700'},aN:{fontSize:13,fontWeight:'600',color:'#e6edf3'},
  aS:{fontSize:11,color:'#8b949e'},
  noA:{backgroundColor:'rgba(240,165,0,.1)',borderRadius:10,borderWidth:1,borderColor:'rgba(240,165,0,.3)',padding:12,alignItems:'center'},
  noAT:{color:'#f0a500',fontSize:13,fontWeight:'600'},
  dBtn:{paddingHorizontal:12,paddingVertical:6,borderRadius:20,borderWidth:1,borderColor:'rgba(255,255,255,.09)'},
  dOn:{backgroundColor:'rgba(0,200,160,.15)',borderColor:'#00c8a0'},
  dT:{color:'#8b949e',fontSize:12},dTOn:{color:'#00c8a0'},
  vidPanel:{backgroundColor:'#161b22',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,.09)',overflow:'hidden'},
  vidH:{flexDirection:'row',alignItems:'center',padding:8,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.09)',gap:5},
  vidT:{fontSize:12,fontWeight:'600',color:'#e6edf3'},
  badge:{borderWidth:1,borderRadius:20,paddingHorizontal:7,paddingVertical:2},
  badgeT:{fontSize:10},
  drawB:{marginLeft:'auto',paddingHorizontal:7,paddingVertical:3,borderRadius:5,borderWidth:1,borderColor:'rgba(255,255,255,.09)'},
  drawBT:{color:'#8b949e',fontSize:11},
  vName:{fontSize:11,fontWeight:'600',color:'#e6edf3',padding:6,paddingBottom:2},
  vMeta:{fontSize:10,color:'#8b949e',paddingHorizontal:6,paddingBottom:4},
  video:{width:'100%',aspectRatio:16/9,backgroundColor:'#000',maxHeight:200},
  changeB:{padding:8,alignItems:'center',borderTopWidth:1,borderTopColor:'rgba(255,255,255,.09)'},
  changeT:{color:'#8b949e',fontSize:11},
  upArea:{alignItems:'center',justifyContent:'center',padding:16,gap:6,minHeight:110},
  upTxt:{fontSize:12,color:'#8b949e'},
  upBtn:{backgroundColor:'rgba(0,200,160,.1)',borderWidth:1,borderColor:'rgba(0,200,160,.3)',borderRadius:6,paddingHorizontal:12,paddingVertical:5},
  upBtnT:{color:'#00c8a0',fontSize:12},
  aBtn:{backgroundColor:'#00c8a0',borderRadius:10,padding:12,alignItems:'center'},
  aBT:{color:'#000',fontSize:14,fontWeight:'700'},
  sRow:{backgroundColor:'#161b22',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,.09)',padding:12,flexDirection:'row',gap:12},
  sRing:{width:58,height:58,borderRadius:29,borderWidth:4,alignItems:'center',justifyContent:'center'},
  sNum:{fontSize:16,fontWeight:'700'},
  fbCard:{backgroundColor:'#161b22',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,.09)',padding:12},
  fbTitle:{fontSize:10,color:'#8b949e',letterSpacing:0.8,textTransform:'uppercase',marginBottom:8},
  notes:{backgroundColor:'#161b22',borderRadius:10,borderWidth:1,borderColor:'rgba(255,255,255,.09)',color:'#e6edf3',fontSize:13,padding:10,minHeight:70},
  saveB:{backgroundColor:'#00c8a0',borderRadius:10,padding:12,alignItems:'center'},
  saveBT:{color:'#000',fontSize:14,fontWeight:'700'},
  // Frame controls
  fcWrap:    {backgroundColor:'#0d1117',borderTopWidth:1,borderTopColor:'rgba(255,255,255,.09)',padding:8,gap:6},
  timeline:  {flexDirection:'row',alignItems:'center',gap:6},
  timePos:   {fontSize:11,color:'#00c8a0',fontFamily:'monospace',width:58},
  timeDur:   {fontSize:11,color:'#8b949e',fontFamily:'monospace',width:58,textAlign:'right'},
  tlTrack:   {flex:1,height:6,backgroundColor:'rgba(255,255,255,.15)',borderRadius:3,position:'relative',marginVertical:8},
  tlFill:    {height:6,backgroundColor:'#00c8a0',borderRadius:3},
  tlThumb:   {position:'absolute',top:-10,width:24,height:24,borderRadius:12,backgroundColor:'#00c8a0',transform:[{translateX:-12}],elevation:3,shadowColor:'#00c8a0',shadowOpacity:.6,shadowRadius:4},
  transport: {flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  tBtn:      {width:40,height:36,borderRadius:8,borderWidth:1,borderColor:'rgba(255,255,255,.12)',alignItems:'center',justifyContent:'center'},
  playBtn:   {width:48,height:40,backgroundColor:'#00c8a0',borderColor:'#00c8a0'},
  tTxt:      {fontSize:14,color:'#e6edf3'},
  speedRow:  {flexDirection:'row',alignItems:'center',gap:6,paddingVertical:2},
  speedLbl:  {fontSize:11,color:'#8b949e'},
  speedBtn:  {paddingHorizontal:10,paddingVertical:5,borderRadius:16,borderWidth:1,borderColor:'rgba(255,255,255,.12)'},
  speedOn:   {backgroundColor:'rgba(0,200,160,.15)',borderColor:'#00c8a0'},
  speedTxt:  {fontSize:12,color:'#8b949e',fontWeight:'600'},
});
