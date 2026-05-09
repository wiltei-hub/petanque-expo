import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  Switch, Dimensions, ScrollView, PanResponder
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import Svg, {
  Path, Line, Circle, Polygon, Ellipse, Text as SvgText
} from 'react-native-svg';

const { width: SW, height: SH } = Dimensions.get('window');

const TOOLS = [
  { id:'pen',      emoji:'✏',  name:'Freihand' },
  { id:'arrow',    emoji:'➡',  name:'Pfeil'    },
  { id:'parabola', emoji:'⌒',  name:'Parabel'  },
  { id:'line',     emoji:'╱',  name:'Linie'    },
  { id:'circle',   emoji:'⭕',  name:'Kreis'    },
  { id:'ellipse',  emoji:'〇',  name:'Ellipse'  },
  { id:'erase',    emoji:'🧹', name:'Löschen'  },
];

const COLORS = [
  { hex:'#e24b4a', label:'Kugelbahn'  },
  { hex:'#00c8a0', label:'Hand'       },
  { hex:'#f0a500', label:'Ellbogen'   },
  { hex:'#3b8cff', label:'Schulter'   },
  { hex:'#ffffff', label:'Allgemein'  },
  { hex:'#ff69b4', label:'Markierung' },
];

export default function VideoDrawer({ source, videoRef, height, skeletonData, showSkeleton }) {
  const vidH = height || Math.round(Math.min(SH, SW) * 0.56);

  // ── Drawing state via stateRef ────────────────────────────────────────────
  const stateRef = useRef({
    drawMode: false,
    tool: 'arrow', color: '#e24b4a', size: 3,
    strokes: [], current: null,
  });
  const [ui, setUi] = useState({
    drawMode: false, tool: 'arrow', color: '#e24b4a', size: 3, strokes: [],
  });
  function update(patch) {
    Object.assign(stateRef.current, patch);
    setUi(prev => ({ ...prev, ...patch }));
  }

  // ── Zoom state — ONLY in refs, never in React state ───────────────────────
  // This prevents re-render from resetting zoom
  const zoomRef = useRef({ scale:1, tx:0, ty:0 });
  const zoomInitDist  = useRef(null);
  const zoomInitScale = useRef(1);
  const zoomInitTx    = useRef(0);
  const zoomInitTy    = useRef(0);
  const zoomMidX      = useRef(0);
  const zoomMidY      = useRef(0);
  const lastTap       = useRef(0);
  const zoomViewRef   = useRef(null);

  // Apply zoom directly to native view — no React re-render needed
  function applyZoom(scale, tx, ty) {
    zoomRef.current = { scale, tx, ty };
    if (zoomViewRef.current) {
      zoomViewRef.current.setNativeProps({
        style: {
          transform: [
            { translateX: tx },
            { translateY: ty },
            { scale },
          ]
        }
      });
    }
  }

  function resetZoom() {
    applyZoom(1, 0, 0);
    zoomInitDist.current = null;
    zoomInitScale.current = 1;
  }

  // ── PanResponder ──────────────────────────────────────────────────────────
  const pan = useRef(PanResponder.create({

    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,

    onPanResponderGrant: evt => {
      const touches = evt.nativeEvent.touches;
      zoomInitDist.current = null;

      // Double tap detection
      if (!stateRef.current.drawMode && touches.length === 1) {
        const now = Date.now();
        if (now - lastTap.current < 300) {
          resetZoom();
        }
        lastTap.current = now;
        return;
      }

      if (!stateRef.current.drawMode) return;

      // Drawing grant
      const { locationX:x, locationY:y } = evt.nativeEvent;
      const { tool, color, size } = stateRef.current;
      const stroke = (tool==='pen'||tool==='erase')
        ? { type:tool, points:[{x,y}], color, size }
        : { type:tool, x1:x, y1:y, x2:x, y2:y, color, size };
      stateRef.current.current = stroke;
      setUi(p => ({...p}));
    },

    onPanResponderMove: evt => {
      const touches = evt.nativeEvent.touches;

      if (!stateRef.current.drawMode) {
        const { scale, tx, ty } = zoomRef.current;

        if (touches.length === 2) {
          // ── PINCH ZOOM ────────────────────────────────────────────────────
          const dx = touches[0].pageX - touches[1].pageX;
          const dy = touches[0].pageY - touches[1].pageY;
          const d  = Math.sqrt(dx*dx + dy*dy);
          const midX = (touches[0].pageX + touches[1].pageX) / 2;
          const midY = (touches[0].pageY + touches[1].pageY) / 2;

          if (!zoomInitDist.current) {
            zoomInitDist.current  = d;
            zoomInitScale.current = scale;
            zoomInitTx.current    = tx;
            zoomInitTy.current    = ty;
            zoomMidX.current      = midX;
            zoomMidY.current      = midY;
          }

          const ns = Math.max(1, Math.min(5,
            zoomInitScale.current * (d / zoomInitDist.current)
          ));
          applyZoom(ns, tx, ty);

        } else if (touches.length === 1 && scale > 1) {
          // ── PAN when zoomed in ────────────────────────────────────────────
          if (!zoomInitDist.current) {
            // Start of pan
            zoomInitDist.current = -1; // mark as pan
            zoomInitTx.current   = tx;
            zoomInitTy.current   = ty;
            zoomMidX.current     = touches[0].pageX;
            zoomMidY.current     = touches[0].pageY;
          }
          const dtx = touches[0].pageX - zoomMidX.current;
          const dty = touches[0].pageY - zoomMidY.current;
          const newTx = Math.max(-SW*(scale-1)/2, Math.min(SW*(scale-1)/2, zoomInitTx.current + dtx));
          const newTy = Math.max(-vidH*(scale-1)/2, Math.min(vidH*(scale-1)/2, zoomInitTy.current + dty));
          applyZoom(scale, newTx, newTy);
        }
        return;
      }

      // ── DRAW ──────────────────────────────────────────────────────────────
      const cur = stateRef.current.current;
      if (!cur) return;
      const { locationX:x, locationY:y } = evt.nativeEvent;
      if (cur.type==='pen'||cur.type==='erase') {
        cur.points = [...cur.points, {x,y}];
      } else { cur.x2=x; cur.y2=y; }
      setUi(p => ({...p}));
    },

    onPanResponderRelease: () => {
      if (!stateRef.current.drawMode) {
        zoomInitDist.current = null;
        return;
      }
      const cur = stateRef.current.current;
      if (!cur) return;
      let newStrokes;
      if (cur.type==='erase') {
        newStrokes = stateRef.current.strokes.filter(s => {
          if (s.type!=='pen') return true;
          return !s.points.some(p =>
            cur.points.some(e => Math.hypot(p.x-e.x,p.y-e.y) < stateRef.current.size*12)
          );
        });
      } else {
        newStrokes = [...stateRef.current.strokes, {...cur}];
      }
      stateRef.current.strokes = newStrokes;
      stateRef.current.current = null;
      setUi(p => ({...p, strokes: newStrokes}));
    },

  })).current;

  // ── Stroke rendering ──────────────────────────────────────────────────────
  function renderStroke(s, key) {
    if (!s) return null;
    const c = s.color||'#fff', w = s.size||3;
    if (s.type==='pen') {
      if (!s.points||s.points.length<2) return null;
      const d = s.points.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
      return <Path key={key} d={d} stroke={c} strokeWidth={w}
        strokeLinecap="round" strokeLinejoin="round" fill="none"/>;
    }
    if (s.type==='line')
      return <Line key={key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
        stroke={c} strokeWidth={w} strokeLinecap="round"/>;
    if (s.type==='arrow') {
      const angle = Math.atan2(s.y2-s.y1, s.x2-s.x1);
      const hs = Math.max(16,w*6);
      return (
        <React.Fragment key={key}>
          <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={c} strokeWidth={w} strokeLinecap="round"/>
          <Polygon fill={c} points={
            `${s.x2},${s.y2} ` +
            `${s.x2-hs*Math.cos(angle-0.4)},${s.y2-hs*Math.sin(angle-0.4)} ` +
            `${s.x2-hs*Math.cos(angle+0.4)},${s.y2-hs*Math.sin(angle+0.4)}`}/>
        </React.Fragment>
      );
    }
    if (s.type==='parabola') {
      const mx=(s.x1+s.x2)/2, my=Math.min(s.y1,s.y2)-Math.abs(s.x2-s.x1)*0.45;
      const d=`M ${s.x1} ${s.y1} Q ${mx} ${my} ${s.x2} ${s.y2}`;
      const angle=Math.atan2(s.y2-my,s.x2-mx)+0.2, hs=Math.max(14,w*5);
      return (
        <React.Fragment key={key}>
          <Path d={d} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round"/>
          <Polygon fill={c} points={
            `${s.x2},${s.y2} ` +
            `${s.x2-hs*Math.cos(angle-0.4)},${s.y2-hs*Math.sin(angle-0.4)} ` +
            `${s.x2-hs*Math.cos(angle+0.4)},${s.y2-hs*Math.sin(angle+0.4)}`}/>
        </React.Fragment>
      );
    }
    if (s.type==='circle') {
      const r=Math.max(5,Math.hypot(s.x2-s.x1,s.y2-s.y1)/2);
      return <Circle key={key} cx={(s.x1+s.x2)/2} cy={(s.y1+s.y2)/2}
        r={r} stroke={c} strokeWidth={w} fill={c+'22'}/>;
    }
    if (s.type==='ellipse') {
      const rx=Math.max(5,Math.abs(s.x2-s.x1)/2), ry=Math.max(5,Math.abs(s.y2-s.y1)/2);
      return <Ellipse key={key} cx={(s.x1+s.x2)/2} cy={(s.y1+s.y2)/2}
        rx={rx} ry={ry} stroke={c} strokeWidth={w} fill={c+'22'}/>;
    }
    return null;
  }

  function renderSkeleton() {
    if (!showSkeleton||!skeletonData?.keypoints) return null;
    const { wrist, elbow, shoulder } = skeletonData.keypoints;
    const { width:cW } = Dimensions.get('window');
    const sx=cW/640, sy=vidH/360;
    return (
      <>
        {wrist&&elbow&&<Line x1={wrist.x*sx} y1={wrist.y*sy}
          x2={elbow.x*sx} y2={elbow.y*sy} stroke="#00c8a0" strokeWidth={3} opacity={0.85}/>}
        {elbow&&shoulder&&<Line x1={elbow.x*sx} y1={elbow.y*sy}
          x2={shoulder.x*sx} y2={shoulder.y*sy} stroke="#00c8a0" strokeWidth={3} opacity={0.85}/>}
        {[{kp:wrist,c:'#3b8cff',n:'Handg.'},{kp:elbow,c:'#f0a500',n:'Ellb.'},
          {kp:shoulder,c:'#00c8a0',n:'Schulter'}].map(({kp,c,n},i)=>
          kp ? (
            <React.Fragment key={i}>
              <Circle cx={kp.x*sx} cy={kp.y*sy} r={12}
                fill={c+'66'} stroke={c} strokeWidth={3}/>
              <SvgText x={kp.x*sx+14} y={kp.y*sy+4}
                fill={c} fontSize="13" fontWeight="bold"
                stroke="#000" strokeWidth={0.5}>{n}</SvgText>
            </React.Fragment>
          ) : null
        )}
      </>
    );
  }

  const { drawMode, tool, color, size, strokes } = ui;

  return (
    <View style={S.container}>
      <View style={[S.vidWrap, {height:vidH}]} {...pan.panHandlers}>

        {/* Video — zoom via setNativeProps, no re-render */}
        <View ref={zoomViewRef} style={StyleSheet.absoluteFill}>
          <Video ref={videoRef} source={source}
            style={{width:'100%', height:vidH}}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={false}
            shouldPlay={false}/>
        </View>

        {/* SVG drawing layer */}
        <Svg style={StyleSheet.absoluteFill} width={SW} height={vidH}
          pointerEvents={drawMode ? 'auto' : 'none'}>
          {strokes.map((s,i) => renderStroke(s,i))}
          {renderStroke(stateRef.current.current, 'cur')}
          {renderSkeleton()}
        </Svg>

        {/* Badges */}
        {drawMode ? (
          <View style={S.badge}>
            <View style={[S.badgeDot,{backgroundColor:color}]}/>
            <Text style={S.badgeTxt}>
              {TOOLS.find(t=>t.id===tool)?.emoji}{' '}
              {TOOLS.find(t=>t.id===tool)?.name}
            </Text>
          </View>
        ) : (
          <View style={S.zoomBadge}>
            <Text style={S.zoomTxt}>👆 2 Finger: Zoom/Pan · Doppeltipp: Reset</Text>
          </View>
        )}
      </View>

      {/* CONTROLS */}
      <View style={S.controls}>
        <View style={S.row}>
          <Text style={S.toggleLbl}>✏ Zeichen-Modus</Text>
          <Switch value={drawMode} onValueChange={v => update({drawMode:v})}
            trackColor={{false:'#333', true:'rgba(0,200,160,.4)'}}
            thumbColor={drawMode?'#00c8a0':'#888'}/>
        </View>

        {drawMode && (
          <>
            <Text style={S.secLbl}>Werkzeug:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.toolRow}>
              {TOOLS.map(t=>(
                <TouchableOpacity key={t.id}
                  style={[S.toolBtn, tool===t.id && S.toolOn]}
                  onPress={()=>update({tool:t.id})}>
                  <Text style={S.toolEmoji}>{t.emoji}</Text>
                  <Text style={[S.toolName, tool===t.id&&{color:'#00c8a0'}]}>{t.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={S.secLbl}>Farbe:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={S.colorRow}>
              {COLORS.map(c=>(
                <TouchableOpacity key={c.hex}
                  style={[S.colorBtn, {backgroundColor:c.hex}, color===c.hex && S.colorOn]}
                  onPress={()=>update({color:c.hex})}>
                  <Text style={S.colorLbl}>{c.label}</Text>
                  {color===c.hex&&<Text style={S.colorTick}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={S.row}>
              <Text style={S.secLbl}>Stärke: </Text>
              {[{v:2,l:'S'},{v:4,l:'M'},{v:7,l:'L'}].map(s=>(
                <TouchableOpacity key={s.v}
                  style={[S.sizeBtn, size===s.v && S.sizeOn]}
                  onPress={()=>update({size:s.v})}>
                  <View style={{width:s.v*4,height:s.v*4,borderRadius:s.v*2,
                    backgroundColor:size===s.v?'#00c8a0':'#8b949e'}}/>
                  <Text style={[S.sizeLbl,size===s.v&&{color:'#00c8a0'}]}>{s.l}</Text>
                </TouchableOpacity>
              ))}
              <View style={{flex:1}}/>
              <TouchableOpacity style={S.actBtn} onPress={()=>{
                const s=stateRef.current.strokes.slice(0,-1);
                stateRef.current.strokes=s; setUi(p=>({...p,strokes:s}));
              }}><Text style={S.actTxt}>↩ Undo</Text></TouchableOpacity>
              <TouchableOpacity style={[S.actBtn,{borderColor:'rgba(226,75,74,.4)'}]}
                onPress={()=>{ stateRef.current.strokes=[]; setUi(p=>({...p,strokes:[]})); }}>
                <Text style={[S.actTxt,{color:'#e24b4a'}]}>✕ Alles</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {!drawMode && <Text style={S.hint}>2 Finger: Zoom · 1 Finger (gezoomt): Pan · Doppeltipp: Reset</Text>}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container:   {backgroundColor:'#000',borderRadius:10,overflow:'hidden'},
  vidWrap:     {width:'100%',position:'relative',overflow:'hidden',backgroundColor:'#000'},
  badge:       {position:'absolute',top:8,left:8,flexDirection:'row',alignItems:'center',
                gap:6,backgroundColor:'rgba(13,17,23,.88)',paddingHorizontal:10,
                paddingVertical:5,borderRadius:8,borderWidth:1,borderColor:'rgba(255,255,255,.2)'},
  badgeDot:    {width:12,height:12,borderRadius:6,borderWidth:1,borderColor:'rgba(255,255,255,.4)'},
  badgeTxt:    {color:'#fff',fontSize:12,fontWeight:'700'},
  zoomBadge:   {position:'absolute',bottom:6,left:0,right:0,alignItems:'center'},
  zoomTxt:     {fontSize:10,color:'rgba(255,255,255,.6)',backgroundColor:'rgba(0,0,0,.5)',
                paddingHorizontal:8,paddingVertical:2,borderRadius:8},
  controls:    {backgroundColor:'#161b22',padding:10,gap:8},
  row:         {flexDirection:'row',alignItems:'center',gap:8},
  toggleLbl:   {fontSize:14,color:'#e6edf3',fontWeight:'600',flex:1},
  secLbl:      {fontSize:11,color:'#8b949e'},
  toolRow:     {flexDirection:'row',gap:6,paddingVertical:2},
  toolBtn:     {alignItems:'center',paddingHorizontal:12,paddingVertical:8,borderRadius:9,
                borderWidth:1,borderColor:'rgba(255,255,255,.12)',minWidth:68,
                backgroundColor:'rgba(255,255,255,.03)'},
  toolOn:      {backgroundColor:'rgba(0,200,160,.15)',borderColor:'#00c8a0'},
  toolEmoji:   {fontSize:20,marginBottom:3},
  toolName:    {fontSize:10,color:'#8b949e'},
  colorRow:    {flexDirection:'row',gap:8,paddingVertical:2},
  colorBtn:    {paddingHorizontal:12,paddingVertical:9,borderRadius:9,borderWidth:2,
                borderColor:'transparent',alignItems:'center',minWidth:80},
  colorOn:     {borderColor:'#fff',borderWidth:3,transform:[{scale:1.06}]},
  colorLbl:    {fontSize:10,fontWeight:'700',color:'#000',
                textShadowColor:'rgba(255,255,255,.7)',
                textShadowOffset:{width:0,height:0},textShadowRadius:4},
  colorTick:   {fontSize:16,color:'#000',fontWeight:'900'},
  sizeBtn:     {alignItems:'center',paddingHorizontal:10,paddingVertical:6,borderRadius:7,
                borderWidth:1,borderColor:'rgba(255,255,255,.09)',gap:3},
  sizeOn:      {borderColor:'#00c8a0',backgroundColor:'rgba(0,200,160,.08)'},
  sizeLbl:     {fontSize:10,color:'#8b949e'},
  actBtn:      {paddingHorizontal:10,paddingVertical:6,borderRadius:7,borderWidth:1,
                borderColor:'rgba(255,255,255,.12)'},
  actTxt:      {color:'#8b949e',fontSize:11},
  hint:        {fontSize:11,color:'#8b949e',textAlign:'center',paddingVertical:4},
});
