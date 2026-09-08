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
  Image
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { initDatabase, saveHazardLocally, getLocalHazards } from './database';
import { registerAutoSyncListener, syncPendingRecords } from './syncEngine';

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

    return () => unsubscribe();
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Network Connectivity Banner */}
      <View style={[styles.networkBanner, isOnline ? styles.bannerOnline : styles.bannerOffline]}>
        <Text style={styles.bannerText}>
          {isOnline 
            ? `🟢 ONLINE (${connectionType.toUpperCase()}) - Auto-Sync Active` 
            : '🔴 OFFLINE (-300m Pit Mode) - Saving to SQLite'}
        </Text>
      </View>

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

      <Text style={styles.header}>⛏️ Coal Mine Field Logger</Text>
      <Text style={styles.subHeader}>Statutory Photo & GPS Compliance Module</Text>

      {/* Inputs */}
      <TextInput
        style={styles.input}
        placeholder="Hazard Type (e.g., Loose Overburden, Gas Seepage)"
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 14, paddingTop: 45, backgroundColor: '#f0f2f5' },
  networkBanner: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginBottom: 6, alignItems: 'center' },
  bannerOnline: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  bannerOffline: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  bannerText: { fontSize: 11, fontWeight: 'bold', color: '#1f2937' },
  gpsBanner: { backgroundColor: '#e0f2fe', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 6, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: '#bae6fd' },
  gpsText: { fontSize: 11, fontWeight: '600', color: '#0369a1' },
  header: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  subHeader: { fontSize: 11, color: '#6b7280', marginBottom: 10 },
  input: { backgroundColor: '#ffffff', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', marginBottom: 6, fontSize: 13 },
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
  syncedTag: { fontSize: 10, fontWeight: 'bold', color: '#15803d', marginTop: 2 }
});