import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, PanResponder } from 'react-native';
import Svg, { Path, Line, Circle, Polygon } from 'react-native-svg';

const TOOLS = [
  { id:'pen',    label:'✏' },
  { id:'arrow',  label:'➡' },
  { id:'line',   label:'╱' },
  { id:'circle', label:'⭕' },
  { id:'erase',  label:'🧹' },
];

const COLORS = [
  { hex:'#e24b4a', name:'Kugelbahn' },
  { hex:'#00c8a0', name:'Hand' },
  { hex:'#f0a500', name:'Ellbogen' },
  { hex:'#3b8cff', name:'Schulter' },
  { hex:'#ffffff', name:'Allgemein' },
];

export default function DrawingCanvas({ width, height, onSave, onClose, skeletonData }) {
  const [tool, setTool]     = useState('pen');
  const [color, setColor]   = useState('#e24b4a');
  const [size, setSize]     = useState(3);
  const [strokes, setStrokes] = useState([]);
  const currentRef = useRef(null);
  const [, forceUpdate] = useState(0);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX: x, locationY: y } = evt.nativeEvent;
      if (tool === 'pen' || tool === 'erase') {
        currentRef.current = { type: tool, points: [{x,y}], color, size };
      } else {
        currentRef.current = { type: tool, x1:x, y1:y, x2:x, y2:y, color, size };
      }
      forceUpdate(n => n+1);
    },
    onPanResponderMove: (evt) => {
      const { locationX: x, locationY: y } = evt.nativeEvent;
      if (!currentRef.current) return;
      if (currentRef.current.type === 'pen' || currentRef.current.type === 'erase') {
        currentRef.current = { ...currentRef.current, points: [...currentRef.current.points, {x,y}] };
      } else {
        currentRef.current = { ...currentRef.current, x2:x, y2:y };
      }
      forceUpdate(n => n+1);
    },
    onPanResponderRelease: () => {
      const s = currentRef.current;
      if (s) {
        if (s.type === 'erase') {
          setStrokes(prev => prev.filter(stroke => {
            if (stroke.type !== 'pen') return true;
            return !stroke.points.some(p =>
              s.points.some(e => Math.hypot(p.x-e.x, p.y-e.y) < size*8)
            );
          }));
        } else {
          setStrokes(prev => [...prev, s]);
        }
      }
      currentRef.current = null;
      forceUpdate(n => n+1);
    },
  })).current;

  function renderStroke(s, key) {
    const col = s.color;
    if (s.type === 'pen') {
      if (!s.points || s.points.length < 2) return null;
      const d = s.points.map((p,i) => `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
      return <Path key={key} d={d} stroke={col} strokeWidth={s.size} strokeLinecap="round" strokeLinejoin="round" fill="none"/>;
    }
    if (s.type === 'line') {
      return <Line key={key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col} strokeWidth={s.size} strokeLinecap="round"/>;
    }
    if (s.type === 'arrow') {
      const angle = Math.atan2(s.y2-s.y1, s.x2-s.x1);
      const hs = Math.max(14, s.size*5);
      return (
        <React.Fragment key={key}>
          <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={col} strokeWidth={s.size} strokeLinecap="round"/>
          <Polygon points={`${s.x2},${s.y2} ${s.x2-hs*Math.cos(angle-0.4)},${s.y2-hs*Math.sin(angle-0.4)} ${s.x2-hs*Math.cos(angle+0.4)},${s.y2-hs*Math.sin(angle+0.4)}`} fill={col}/>
        </React.Fragment>
      );
    }
    if (s.type === 'circle') {
      const r = Math.max(5, Math.hypot(s.x2-s.x1, s.y2-s.y1)/2);
      const cx = (s.x1+s.x2)/2, cy = (s.y1+s.y2)/2;
      return <Circle key={key} cx={cx} cy={cy} r={r} stroke={col} strokeWidth={s.size} fill={col+'20'}/>;
    }
    return null;
  }

  function renderSkeleton() {
    if (!skeletonData?.keypoints) return null;
    const { wrist, elbow, shoulder } = skeletonData.keypoints;
    return (
      <>
        {wrist && elbow && <Line x1={wrist.x} y1={wrist.y} x2={elbow.x} y2={elbow.y} stroke="#00c8a060" strokeWidth={3}/>}
        {elbow && shoulder && <Line x1={elbow.x} y1={elbow.y} x2={shoulder.x} y2={shoulder.y} stroke="#00c8a060" strokeWidth={3}/>}
        {[{kp:wrist,c:'#3b8cff'},{kp:elbow,c:'#f0a500'},{kp:shoulder,c:'#00c8a0'}].map(({kp,c},i) =>
          kp ? <Circle key={i} cx={kp.x} cy={kp.y} r={7} fill={c+'44'} stroke={c} strokeWidth={2}/> : null
        )}
      </>
    );
  }

  const drawH = height - 100;

  return (
    <View style={[styles.container, {width, height}]}>
      {/* TOOLBAR */}
      <View style={styles.toolbar}>
        <View style={styles.group}>
          {TOOLS.map(t => (
            <TouchableOpacity key={t.id} style={[styles.toolBtn, tool===t.id&&styles.on]} onPress={()=>setTool(t.id)}>
              <Text style={{fontSize:14}}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.group}>
          {COLORS.map(c => (
            <TouchableOpacity key={c.hex}
              style={[styles.colorBtn,{backgroundColor:c.hex},color===c.hex&&{borderColor:'#fff',borderWidth:2.5}]}
              onPress={()=>setColor(c.hex)}/>
          ))}
        </View>
        <View style={styles.group}>
          {[2,4,7].map(s=>(
            <TouchableOpacity key={s} style={[styles.sizeBtn,size===s&&styles.on]} onPress={()=>setSize(s)}>
              <View style={{width:s*3,height:s*3,borderRadius:s*1.5,backgroundColor:size===s?'#00c8a0':'#8b949e'}}/>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.group}>
          <TouchableOpacity style={styles.actBtn} onPress={()=>setStrokes(s=>s.slice(0,-1))}>
            <Text style={styles.actTxt}>↩</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={()=>setStrokes([])}>
            <Text style={[styles.actTxt,{color:'#e24b4a'}]}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actBtn,{backgroundColor:'rgba(0,200,160,.2)',borderColor:'#00c8a0'}]}
            onPress={()=>onSave?.(strokes)}>
            <Text style={[styles.actTxt,{color:'#00c8a0'}]}>💾 Speichern</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actBtn} onPress={onClose}>
            <Text style={styles.actTxt}>Schließen</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* SVG DRAWING AREA */}
      <View style={{width, height:drawH}} {...panResponder.panHandlers}>
        <Svg width={width} height={drawH}>
          {strokes.map((s,i)=>renderStroke(s,i))}
          {currentRef.current && renderStroke(currentRef.current,'cur')}
          {renderSkeleton()}
        </Svg>
      </View>

      {/* LEGEND */}
      <View style={styles.legend}>
        {COLORS.map(c=>(
          <View key={c.hex} style={styles.legendItem}>
            <View style={[styles.dot,{backgroundColor:c.hex}]}/>
            <Text style={styles.legendTxt}>{c.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {backgroundColor:'rgba(13,17,23,.95)',borderRadius:12,overflow:'hidden'},
  toolbar:   {flexDirection:'row',alignItems:'center',padding:6,gap:6,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,.09)',backgroundColor:'#161b22',flexWrap:'wrap'},
  group:     {flexDirection:'row',gap:4,alignItems:'center'},
  toolBtn:   {width:32,height:32,borderRadius:7,borderWidth:1,borderColor:'rgba(255,255,255,.09)',alignItems:'center',justifyContent:'center'},
  on:        {backgroundColor:'rgba(0,200,160,.15)',borderColor:'#00c8a0'},
  colorBtn:  {width:20,height:20,borderRadius:10,borderWidth:1,borderColor:'transparent'},
  sizeBtn:   {width:28,height:28,borderRadius:6,borderWidth:1,borderColor:'rgba(255,255,255,.09)',alignItems:'center',justifyContent:'center'},
  actBtn:    {paddingHorizontal:8,paddingVertical:5,borderRadius:6,borderWidth:1,borderColor:'rgba(255,255,255,.09)'},
  actTxt:    {color:'#8b949e',fontSize:11},
  legend:    {flexDirection:'row',padding:6,gap:8,flexWrap:'wrap',backgroundColor:'#161b22',borderTopWidth:1,borderTopColor:'rgba(255,255,255,.09)'},
  legendItem:{flexDirection:'row',alignItems:'center',gap:4},
  dot:       {width:8,height:8,borderRadius:4},
  legendTxt: {fontSize:10,color:'#8b949e'},
});
