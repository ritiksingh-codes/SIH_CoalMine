// App.js
import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  Alert, 
  StatusBar,
  ActivityIndicator,
  Image,
  Modal,
  Switch,
  ScrollView,
  Vibration
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { initDatabase, saveHazardLocally, getLocalHazards } from './database';
import { registerAutoSyncListener, syncPendingRecords } from './syncEngine';
import io from 'socket.io-client';

// Connect to the HQ Server's WebSocket.
// Uses the same base URL as the sync engine — set EXPO_PUBLIC_SERVER_URL in your .env
const SERVER_BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';
const socket = io(SERVER_BASE_URL);

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const styles = isDarkMode ? darkStyles : lightStyles;
  const [hazardType, setHazardType] = useState('');
  const [severity, setSeverity] = useState('HIGH');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [hazardsList, setHazardsList] = useState([]);
  const [isOnline, setIsOnline] = useState(false);
  const [connectionType, setConnectionType] = useState('unknown');

  // GPS State
  const [location, setLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);
  // Real-Time Alert State
  const [alertData, setAlertData] = useState(null);
  const [senderAlert, setSenderAlert] = useState(null); // Custom AI Analysis Modal for the sender
  
  // Experimental P2P Mesh Toggle for Hackathon presentation
  const [meshEnabled, setMeshEnabled] = useState(false);
  
  // Role Toggle
  const [role, setRole] = useState('SURVEYOR'); // 'SURVEYOR' or 'WORKER'
  
  // Track hazards submitted by this device so we don't scream at ourselves
  const submittedHazards = React.useRef(new Set());
  
  const playSiren = () => {
    // Using Vibration API instead of Audio to avoid Expo Go native module crashes!
    // Vibrate pattern: wait 0ms, vibrate 1000ms, wait 500ms (repeat)
    Vibration.vibrate([0, 1000, 500], true);
  };

  const stopSiren = () => {
    Vibration.cancel();
    setAlertData(null);
  };

  useEffect(() => {
    initDatabase();
    refreshList();
    fetchCurrentLocation();

    const unsubscribe = registerAutoSyncListener((onlineStatus, type) => {
      if (typeof onlineStatus === 'boolean') {
        setIsOnline(onlineStatus);
        setConnectionType(type || 'unknown');
      }
      refreshList();
    });

    // Real-Time Event Streaming Layer / AI Prediction Listener
    socket.on('connect', () => {
      console.log('Connected to HQ WebSocket for Real-Time Alerts');
    });

    socket.on('hazard_alert', (data) => {
      console.log('Received Real-Time AI Prediction Alert:', data);
      
      // If WE submitted this hazard, don't show the massive red evacuation modal.
      if (submittedHazards.current.has(data.id)) {
        setSenderAlert(data);
      } else {
        // Someone ELSE submitted a critical hazard. Sound the alarm!
        playSiren();
        setAlertData(data);
      }
    });

    return () => {
      unsubscribe();
      socket.off('connect');
      socket.off('hazard_alert');
    };
  }, []);

  const refreshList = () => {
    const data = getLocalHazards();
    setHazardsList(data);
  };

  const fetchCurrentLocation = async () => {
    try {
      setLocLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'GPS location permission is mandatory.');
        setLocLoading(false);
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(currentLocation.coords);
    } catch (error) {
      console.log('Error acquiring GPS location:', error);
    } finally {
      setLocLoading(false);
    }
  };

  // Launch device camera and capture image with Base64 encoding
  const handleCapturePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Permission', 'Camera access is required to photograph hazards.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.3, // Compressed for rapid offline sync
      base64: true,  // Encodes image directly into transferable Base64
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPhotoUri(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSave = () => {
    if (!hazardType.trim() || !description.trim()) {
      Alert.alert("Missing Details", "Please enter Hazard Type and Description.");
      return;
    }

    if (!photoUri) {
      Alert.alert("Photo Mandatory", "Statutory rules require a photographic snapshot of the pit hazard.");
      return;
    }

    const newHazardId = "HAZ-" + Date.now();
    const isoTimestamp = new Date().toISOString();
    
    // Remember that we submitted this ID
    submittedHazards.current.add(newHazardId);

    saveHazardLocally({
      id: newHazardId,
      mine_id: "SECL-PIT-04",
      hazard_type: hazardType,
      severity: severity,
      description: description,
      latitude: location ? location.latitude : null,
      longitude: location ? location.longitude : null,
      image_uri: photoUri,
      timestamp: isoTimestamp
    });

    setHazardType('');
    setDescription('');
    setPhotoUri(null);
    refreshList();

    if (isOnline) {
      syncPendingRecords(refreshList);
    } else {
      Alert.alert("Saved Offline", "Observation, GPS lock, and Base64 Photo stored in SQLite.");
    }
  };

  const triggerP2PDemo = () => {
    playSiren();
    setAlertData({
      title: "🚨 P2P MESH EVACUATION 🚨",
      message: "Danger detected via offline Bluetooth Mesh from a nearby worker! Roof sagging imminent.",
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} />
      <ScrollView contentContainerStyle={styles.scrollContent}>

      {/* Theme & Status Badges Row */}
      <View style={styles.statusRow}>
        <TouchableOpacity 
          style={[styles.pillBadge, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
          onPress={() => setIsDarkMode(!isDarkMode)}
        >
          <Text style={styles.pillText}>{isDarkMode ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        <View style={[styles.pillBadge, isOnline ? styles.pillOnline : styles.pillOffline]}>
          <Text style={styles.pillText}>{isOnline ? '🟢 Online' : '🔴 Offline'}</Text>
        </View>
        
        <TouchableOpacity 
          style={[styles.pillBadge, location ? styles.pillGpsOn : styles.pillGpsOff]}
          onPress={!location ? fetchCurrentLocation : null}
        >
          <Text style={styles.pillText}>{locLoading ? '🛰️ Locating...' : (location ? '📍 GPS' : '⚠️ Retry GPS')}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Real-time Full Screen Danger Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!alertData}
        onRequestClose={() => setAlertData(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{alertData?.title || '🚨 CRITICAL WARNING 🚨'}</Text>
            <Text style={styles.modalMessage}>{alertData?.message}</Text>
            
            <TouchableOpacity style={styles.modalButton} onPress={stopSiren}>
              <Text style={styles.modalButtonText}>UNDERSTOOD / EVACUATING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sender Custom AI Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={!!senderAlert}
        onRequestClose={() => setSenderAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#f0fdf4', borderColor: '#16a34a' }]}>
            <Text style={[styles.modalTitle, { color: '#16a34a' }]}>✅ Hazard Analyzed</Text>
            <Text style={[styles.modalMessage, { color: '#0f172a', fontWeight: 'bold' }]}>Expert Recommendation:</Text>
            <Text style={[styles.modalMessage, { color: '#334155' }]}>{senderAlert?.recommendation}</Text>
            
            <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#16a34a' }]} onPress={() => setSenderAlert(null)}>
              <Text style={styles.modalButtonText}>ACKNOWLEDGE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>



      <Text style={styles.header}>⛏️ Coal Mine Field System</Text>
      <Text style={styles.subHeader}>Statutory GPS Compliance Module</Text>

      {/* Role Selector */}
      <View style={styles.roleContainer}>
        <TouchableOpacity style={[styles.roleBtn, role === 'SURVEYOR' && styles.roleBtnActive]} onPress={() => setRole('SURVEYOR')}>
          <Text style={[styles.roleText, role === 'SURVEYOR' && styles.roleTextActive]}>📋 SURVEYOR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.roleBtn, role === 'WORKER' && styles.roleBtnActive]} onPress={() => {
          setRole('WORKER');
          // Clear history so the worker gets the red alert even if tested on the same device
          submittedHazards.current.clear();
        }}>
          <Text style={[styles.roleText, role === 'WORKER' && styles.roleTextActive]}>👷‍♂️ WORKER</Text>
        </TouchableOpacity>
      </View>

      {/* Network Mesh Control (UI Mock for Judges) */}
      <View style={styles.meshControlContainer}>
        <Text style={styles.meshControlText}>
          📶 Peer-to-Peer Bluetooth Mesh (Experimental)
        </Text>
        <Switch 
          value={meshEnabled} 
          onValueChange={setMeshEnabled}
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={meshEnabled ? "#3b82f6" : "#f4f3f4"}
        />
      </View>
      
      {meshEnabled && (
        <TouchableOpacity style={styles.p2pDemoBtn} onPress={triggerP2PDemo}>
          <Text style={styles.p2pDemoText}>🔔 Simulate Incoming P2P Alert</Text>
        </TouchableOpacity>
      )}

      {role === 'WORKER' ? (
        <View style={styles.workerDashboard}>
          <Text style={styles.workerDashboardTitle}>Environment Monitoring Active</Text>
          <Text style={styles.workerDashboardSub}>You are connected to the Mesh. Awaiting safety broadcasts.</Text>
        </View>
      ) : (
        <View>
          <TextInput
            style={styles.input}
            placeholder="Hazard Type (e.g., Methane Gas Leaking)"
            placeholderTextColor={isDarkMode ? "#94a3b8" : "#64748b"}
            value={hazardType}
            onChangeText={setHazardType}
          />

          <TextInput
            style={styles.input}
            placeholder="Severity (LOW, MEDIUM, HIGH, CRITICAL)"
            placeholderTextColor={isDarkMode ? "#94a3b8" : "#64748b"}
            value={severity}
            onChangeText={setSeverity}
          />

          <TextInput
            style={[styles.input, { height: 80 }]}
            placeholder="Description / Location specifics..."
            placeholderTextColor={isDarkMode ? "#94a3b8" : "#64748b"}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Camera Capture Section */}
          <View style={styles.photoContainer}>
            {photoUri ? (
              <View style={styles.previewBox}>
                <Image source={{ uri: photoUri }} style={styles.imageThumbnail} />
                <TouchableOpacity style={styles.retakeBtn} onPress={handleCapturePhoto}>
                  <Text style={styles.retakeBtnText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.cameraBtn} onPress={handleCapturePhoto}>
                <Text style={styles.cameraBtnText}>📷 Take Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.btnText}>Save Hazard</Text>
          </TouchableOpacity>

          <Text style={styles.listHeading}>Recorded Observations ({hazardsList.length})</Text>

          {/* Records List */}
          <FlatList
            data={hazardsList}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.card}>
                {item.image_uri && (
                  <Image source={{ uri: item.image_uri }} style={styles.cardImage} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.hazard_type} [{item.severity}]</Text>
                  <Text style={styles.cardDesc}>{item.description}</Text>
                  
                  <Text style={styles.coordText}>
                    📍 {item.latitude ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}` : 'No GPS'}
                  </Text>
                  <Text style={styles.timeText}>
                    ⏱️ {new Date(item.timestamp).toLocaleString()}
                  </Text>

                  <Text style={item.sync_status === 'PENDING' ? styles.pendingTag : styles.syncedTag}>
                    {item.sync_status === 'PENDING' ? '⏳ PENDING' : '✅ SYNCED TO HQ'}
                  </Text>
                </View>
              </View>
            )}
          />
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const darkStyles = StyleSheet.create({
  container: { flex: 1, paddingTop: 45, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  statusRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  pillBadge: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20 },
  pillOnline: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: 'rgba(16, 185, 129, 0.3)' },
  pillOffline: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  pillGpsOn: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  pillGpsOff: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#e2e8f0' },
  header: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc', display: 'none' },
  subHeader: { fontSize: 11, color: '#94a3b8', marginBottom: 10, display: 'none' },
  input: { backgroundColor: '#1e293b', padding: 14, borderRadius: 10, marginBottom: 15, fontSize: 15, color: '#f8fafc' },
  roleContainer: { flexDirection: 'row', marginBottom: 24, backgroundColor: '#1e293b', borderRadius: 24, padding: 4 },
  roleBtn: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 20 },
  roleBtnActive: { backgroundColor: '#475569' },
  roleText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  roleTextActive: { color: '#f8fafc' },
  workerDashboard: { backgroundColor: '#1e293b', padding: 30, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  workerDashboardTitle: { fontSize: 18, fontWeight: 'bold', color: '#e2e8f0', textAlign: 'center', marginBottom: 10 },
  workerDashboardSub: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
  meshControlContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 15 },
  meshControlText: { fontSize: 13, fontWeight: '600', color: '#e2e8f0' },
  p2pDemoBtn: { backgroundColor: '#3b82f6', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 20 },
  p2pDemoText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  photoContainer: { marginVertical: 8 },
  cameraBtn: { backgroundColor: '#475569', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  cameraBtnText: { color: '#f8fafc', fontWeight: '600', fontSize: 14 },
  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1e293b', padding: 10, borderRadius: 10 },
  imageThumbnail: { width: 60, height: 60, borderRadius: 8 },
  retakeBtn: { backgroundColor: '#334155', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  retakeBtnText: { color: '#e2e8f0', fontSize: 13, fontWeight: '600' },
  saveBtn: { backgroundColor: '#dc2626', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 12, marginBottom: 24, shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  listHeading: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#1e293b', padding: 14, borderRadius: 12, marginBottom: 12, flexDirection: 'row', gap: 12 },
  cardImage: { width: 70, height: 70, borderRadius: 8 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#f8fafc' },
  cardDesc: { fontSize: 12, color: '#cbd5e1', marginVertical: 4 },
  coordText: { fontSize: 11, color: '#3b82f6', fontFamily: 'monospace' },
  timeText: { fontSize: 10, color: '#64748b', marginTop: 4 },
  pendingTag: { fontSize: 10, fontWeight: 'bold', color: '#fbbf24', marginTop: 6 },
  syncedTag: { fontSize: 10, fontWeight: 'bold', color: '#10b981', marginTop: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#991b1b', padding: 25, borderRadius: 16, width: '85%', alignItems: 'center', shadowColor: '#ef4444', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10, borderWidth: 1, borderColor: '#f87171' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 15, textAlign: 'center' },
  modalMessage: { fontSize: 16, color: '#fee2e2', textAlign: 'center', marginBottom: 25, lineHeight: 24 },
  modalButton: { backgroundColor: 'white', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 10, width: '100%', alignItems: 'center' },
  modalButtonText: { color: '#991b1b', fontWeight: 'bold', fontSize: 16 },
});

const lightStyles = StyleSheet.create({
  ...darkStyles,
  container: { flex: 1, paddingTop: 45, backgroundColor: '#f8fafc' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  input: { backgroundColor: '#ffffff', padding: 14, borderRadius: 10, marginBottom: 15, fontSize: 15, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0' },
  roleContainer: { flexDirection: 'row', marginBottom: 24, backgroundColor: '#e2e8f0', borderRadius: 24, padding: 4 },
  roleBtnActive: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  roleTextActive: { color: '#0f172a' },
  workerDashboard: { backgroundColor: '#ffffff', padding: 30, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  workerDashboardTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', textAlign: 'center', marginBottom: 10 },
  meshControlContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: '#ffffff', borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  meshControlText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  cameraBtn: { backgroundColor: '#e2e8f0', padding: 14, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  cameraBtnText: { color: '#334155', fontWeight: '600', fontSize: 14 },
  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#ffffff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  retakeBtn: { backgroundColor: '#e2e8f0', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  retakeBtnText: { color: '#334155', fontSize: 13, fontWeight: '600' },
  listHeading: { fontSize: 13, fontWeight: '600', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  card: { backgroundColor: '#ffffff', padding: 14, borderRadius: 12, marginBottom: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  cardDesc: { fontSize: 12, color: '#475569', marginVertical: 4 },
});