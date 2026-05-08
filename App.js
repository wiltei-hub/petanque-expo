import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import AnalyseScreen  from './src/screens/AnalyseScreen';
import AthletesScreen from './src/screens/AthletesScreen';
import HistoryScreen  from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

const ICON = { Analyse:'🎯', Athleten:'👤', Verlauf:'📊', Einstellungen:'⚙️' };

export default function App() {
  const [selectedAthlete, setSelectedAthlete] = useState(null);
  const [jumpToAnalyse, setJumpToAnalyse]     = useState(null);

  return (
    <GestureHandlerRootView style={{ flex:1 }}>
      <SafeAreaProvider>
        <NavigationContainer theme={{
          dark: true,
          colors: {
            primary:'#00c8a0', background:'#0d1117', card:'#161b22',
            text:'#e6edf3', border:'rgba(255,255,255,0.09)', notification:'#00c8a0'
          }
        }}>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize:20, opacity: focused?1:0.5 }}>{ICON[route.name]}</Text>
              ),
              tabBarActiveTintColor: '#00c8a0',
              tabBarInactiveTintColor: '#8b949e',
              tabBarStyle: {
                backgroundColor:'#161b22',
                borderTopColor:'rgba(255,255,255,0.09)',
                height:56,
              },
              tabBarLabelStyle: { fontSize:11, marginBottom:4 },
              headerStyle: { backgroundColor:'#161b22' },
              headerTintColor: '#e6edf3',
              headerTitleStyle: { fontWeight:'700' },
            })}
          >
            <Tab.Screen name="Analyse" options={{ title:'Analyse' }}>
              {({ navigation }) => (
                <AnalyseScreen
                  athlete={selectedAthlete}
                  onNeedAthlete={() => navigation.navigate('Athleten')}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Athleten" options={{ title:'Athleten' }}>
              {({ navigation }) => (
                <AthletesScreen
                  selectedId={selectedAthlete?.id}
                  onSelectAthlete={(ath) => {
                    setSelectedAthlete(ath);
                    navigation.navigate('Analyse');
                  }}
                />
              )}
            </Tab.Screen>

            <Tab.Screen name="Verlauf" component={HistoryScreen} options={{ title:'Verlauf' }} />
            <Tab.Screen name="Einstellungen" component={SettingsScreen} options={{ title:'Einstellungen' }} />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
