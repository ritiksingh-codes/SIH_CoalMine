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
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent}>

      {/* Network Connectivity Banner */}
      <View style={[styles.networkBanner, isOnline ? styles.bannerOnline : styles.bannerOffline]}>
        <Text style={styles.bannerText}>
          {isOnline 
            ? `🟢 ONLINE (${connectionType.toUpperCase()}) - Auto-Sync Active` 
            : '🔴 OFFLINE (-300m Pit Mode) - Saving to SQLite'}
        </Text>
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

      {/* GPS Status Banner */}
      <View style={styles.gpsBanner}>
        {locLoading ? (
          <Text style={styles.gpsText}>🛰️ Locking GPS satellites...</Text>
        ) : location ? (
          <Text style={styles.gpsText}>
            📍 GPS Lock: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </Text>
        ) : (
          <TouchableOpacity onPress={fetchCurrentLocation}>
            <Text style={[styles.gpsText, { color: '#dc2626' }]}>⚠️ GPS Disabled. Tap to Retry</Text>
          </TouchableOpacity>
        )}
      </View>

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
            placeholder="Hazard Type (e.g., Loose Overburden)"
            placeholderTextColor="#888"
            value={hazardType}
            onChangeText={setHazardType}
          />

          <TextInput
            style={styles.input}
            placeholder="Severity (LOW, MEDIUM, HIGH, CRITICAL)"
            placeholderTextColor="#888"
            value={severity}
            onChangeText={setSeverity}
          />

          <TextInput
            style={[styles.input, { height: 50 }]}
            placeholder="Description / Location specifics..."
            placeholderTextColor="#888"
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
                  <Text style={styles.retakeBtnText}>Retake 📷</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.cameraBtn} onPress={handleCapturePhoto}>
                <Text style={styles.cameraBtnText}>📸 Take Mandatory Hazard Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.btnText}>💾 Save Time-Stamped Hazard</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 45, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  networkBanner: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginBottom: 6, alignItems: 'center' },
  bannerOnline: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  bannerOffline: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  bannerText: { fontSize: 11, fontWeight: 'bold', color: '#1f2937' },
  gpsBanner: { backgroundColor: '#e0f2fe', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: '#bae6fd' },
  gpsText: { fontSize: 11, fontWeight: '600', color: '#0369a1' },
  header: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  subHeader: { fontSize: 11, color: '#6b7280', marginBottom: 10 },
  input: { backgroundColor: '#ffffff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 15, fontSize: 16 },
  roleContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#e2e8f0', borderRadius: 8, padding: 4 },
  roleBtn: { flex: 1, padding: 10, alignItems: 'center', borderRadius: 6 },
  roleBtnActive: { backgroundColor: '#3b82f6' },
  roleText: { fontSize: 14, fontWeight: 'bold', color: '#64748b' },
  roleTextActive: { color: '#fff' },
  workerDashboard: { backgroundColor: '#dbeafe', padding: 30, borderRadius: 12, alignItems: 'center', marginBottom: 20, borderWidth: 2, borderColor: '#bfdbfe' },
  workerDashboardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e3a8a', textAlign: 'center', marginBottom: 10 },
  workerDashboardSub: { fontSize: 14, color: '#3b82f6', textAlign: 'center' },
  meshControlContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderRadius: 8, marginBottom: 10 },
  meshControlText: { fontSize: 13, fontWeight: '600' },
  p2pDemoBtn: { backgroundColor: '#8b5cf6', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  p2pDemoText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  photoContainer: { marginVertical: 6 },
  cameraBtn: { backgroundColor: '#0284c7', padding: 10, borderRadius: 6, alignItems: 'center' },
  cameraBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  previewBox: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  imageThumbnail: { width: 50, height: 50, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' },
  retakeBtn: { backgroundColor: '#64748b', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4 },
  retakeBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#b91c1c', padding: 10, borderRadius: 6, alignItems: 'center', marginTop: 6, marginBottom: 12 },
  btnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  listHeading: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 6 },
  card: { backgroundColor: '#ffffff', padding: 10, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', gap: 10 },
  cardImage: { width: 65, height: 65, borderRadius: 4 },
  cardTitle: { fontSize: 13, fontWeight: 'bold', color: '#111827' },
  cardDesc: { fontSize: 11, color: '#4b5563', marginVertical: 2 },
  coordText: { fontSize: 10, color: '#0369a1', fontFamily: 'monospace' },
  timeText: { fontSize: 10, color: '#6b7280' },
  pendingTag: { fontSize: 10, fontWeight: 'bold', color: '#c2410c', marginTop: 2 },
  syncedTag: { fontSize: 10, fontWeight: 'bold', color: '#15803d', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#ef4444', padding: 25, borderRadius: 12, width: '85%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: 'white', marginBottom: 15, textAlign: 'center' },
  modalMessage: { fontSize: 16, color: 'white', textAlign: 'center', marginBottom: 25, lineHeight: 22 },
  modalButton: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, width: '100%', alignItems: 'center' },
  modalButtonText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16 },
});