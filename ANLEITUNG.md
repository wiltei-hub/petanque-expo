# PétanqueCoach Expo — APK bauen

## Voraussetzungen

1. **Node.js** — bereits installiert (v24)
2. **Expo Account** — kostenlos auf expo.dev registrieren
3. **EAS CLI** installieren:
   ```
   npm install -g eas-cli
   ```

## Schritt-für-Schritt

### 1. Ordner auf den PC kopieren
Den Ordner `petanque-expo` nach `E:\workspace\_Projekte\Petanque-Coach\` kopieren.

### 2. Terminal öffnen
```
cd E:\workspace\_Projekte\Petanque-Coach\petanque-expo
```

### 3. Abhängigkeiten installieren
```
npm install
```

### 4. Bei Expo anmelden
```
eas login
```
(Expo-Account Zugangsdaten eingeben)

### 5. EAS Projekt initialisieren (einmalig)
```
eas init
```

### 6. APK in der Cloud bauen
```
eas build --platform android --profile preview
```
- Build läuft in der Cloud (~5-10 Minuten)
- Du erhältst einen Download-Link per E-Mail und im Terminal
- APK direkt herunterladen

### 7. APK auf Tablet installieren
- APK auf Tablet kopieren (USB oder Google Drive)
- Samsung Datei-App → APK antippen → Installieren

## Vorteile gegenüber WebIntoApp

| Funktion              | WebIntoApp | Expo/React Native |
|-----------------------|------------|-------------------|
| Echter Dateiname      | ❌          | ✅                 |
| Video lädt sofort     | ❌          | ✅                 |
| Rückkamera            | ⚠️          | ✅                 |
| Dateizugriff          | ❌          | ✅                 |
| PDF Export            | ⚠️          | ✅                 |
| Offline               | ✅          | ✅                 |

## Nächste Entwicklungsschritte

Die aktuelle Version enthält simulierte Gelenkwinkel-Analyse.
Für echte MediaPipe-Integration:
- `@tensorflow/tfjs-react-native` einbinden
- TensorFlow Lite Pose Detection Model laden
- Gelenkwinkel aus Video-Frames berechnen

## Expo Go zum Testen (ohne APK-Build)

Expo Go App auf dem Tablet installieren, dann:
```
npx expo start
```
QR-Code mit Expo Go scannen → App läuft sofort auf dem Tablet.
