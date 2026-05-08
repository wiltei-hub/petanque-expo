// Pose detection is handled via MediaPipe running in a WebView
// This file provides helper utilities only

export function calcAngle(A, B, C) {
  if (!A || !B || !C) return 0;
  const ax = A.x - B.x, ay = A.y - B.y;
  const cx = C.x - B.x, cy = C.y - B.y;
  const dot = ax*cx + ay*cy;
  const mag = Math.sqrt((ax*ax+ay*ay)*(cx*cx+cy*cy));
  if (mag === 0) return 0;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot/mag))) * 180 / Math.PI);
}

export async function initTF() { return true; }
export function isTFReady() { return true; }
