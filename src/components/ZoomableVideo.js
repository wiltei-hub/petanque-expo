import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, PanResponder, Animated
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';

export default function ZoomableVideo({ source, style, videoRef }) {
  const scale     = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastX     = useRef(0);
  const lastY     = useRef(0);
  const initialDistance = useRef(null);

  function dist(t1, t2) {
    return Math.hypot(t1.pageX - t2.pageX, t1.pageY - t2.pageY);
  }

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,

    onPanResponderGrant: (evt) => {
      initialDistance.current = null;
    },

    onPanResponderMove: (evt) => {
      const touches = evt.nativeEvent.touches;

      if (touches.length === 2) {
        // PINCH TO ZOOM
        const d = dist(touches[0], touches[1]);
        if (initialDistance.current === null) {
          initialDistance.current = d;
        }
        const newScale = Math.max(1, Math.min(5, lastScale.current * (d / initialDistance.current)));
        scale.setValue(newScale);
      } else if (touches.length === 1 && lastScale.current > 1) {
        // PAN when zoomed in
        const dx = touches[0].pageX - (lastX.current || touches[0].pageX);
        const dy = touches[0].pageY - (lastY.current || touches[0].pageY);
        translateX.setValue(translateX._value + dx * 0.5);
        translateY.setValue(translateY._value + dy * 0.5);
        lastX.current = touches[0].pageX;
        lastY.current = touches[0].pageY;
      }
    },

    onPanResponderRelease: (evt) => {
      lastScale.current = scale._value;
      if (scale._value <= 1) {
        // Reset position when fully zoomed out
        Animated.parallel([
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          Animated.spring(scale,      { toValue: 1, useNativeDriver: true }),
        ]).start();
        lastScale.current = 1;
        lastX.current = 0;
        lastY.current = 0;
      }
      initialDistance.current = null;
      lastX.current = 0;
      lastY.current = 0;
    },
  })).current;

  // Double tap to reset zoom
  const lastTap = useRef(0);
  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      Animated.parallel([
        Animated.spring(scale,      { toValue: 1, useNativeDriver: true }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
      ]).start();
      lastScale.current = 1;
    }
    lastTap.current = now;
  }

  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}
      onTouchEnd={handleDoubleTap}>
      <Animated.View style={{
        transform: [
          { scale },
          { translateX },
          { translateY },
        ],
        width: '100%',
        height: '100%',
      }}>
        <Video
          ref={videoRef}
          source={source}
          style={styles.video}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
        />
      </Animated.View>
      {/* Zoom hint */}
      <View style={styles.hint}>
        <Text style={styles.hintTxt}>👆 Zwei Finger: Zoom · Doppeltipp: Reset</Text>
      </View>
    </View>
  );
}

import { Text } from 'react-native';

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: '#000' },
  video:     { width: '100%', height: '100%' },
  hint:      { position:'absolute', bottom:4, left:0, right:0, alignItems:'center', pointerEvents:'none' },
  hintTxt:   { fontSize:9, color:'rgba(255,255,255,.4)', backgroundColor:'rgba(0,0,0,.4)', paddingHorizontal:8, paddingVertical:2, borderRadius:10 },
});
