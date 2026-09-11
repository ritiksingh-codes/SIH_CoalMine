// syncEngine.js
import NetInfo from '@react-native-community/netinfo';
import { getPendingHazards, markAsSynced } from './database';

// The live backend URL. 
// For local dev: set EXPO_PUBLIC_SERVER_URL=http://10.x.x.x:5000 in your .env file
// For production: set EXPO_PUBLIC_SERVER_URL=https://your-app.onrender.com in your .env file
const SERVER_URL = `${process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/hazards`;

let isSyncing = false;

export async function syncPendingRecords(onSyncComplete) {
  if (isSyncing) return;
  
  const pendingRecords = getPendingHazards();
  if (pendingRecords.length === 0) return;

  isSyncing = true;
  console.log(`Transmitting ${pendingRecords.length} record(s) to HQ...`);

  for (const record of pendingRecords) {
    try {
      // Real HTTP POST transmission from phone to VS Code terminal server
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });

      if (response.ok) {
        markAsSynced(record.id);
        console.log(`Record ${record.id} acknowledged by HQ.`);
      }
    } catch (error) {
      console.log("Could not reach HQ server. Will retry when Wi-Fi stabilizes.");
    }
  }

  isSyncing = false;
  if (onSyncComplete) onSyncComplete();
}

export function registerAutoSyncListener(onStatusChange) {
  return NetInfo.addEventListener((state) => {
    const isOnline = Boolean(state.isConnected && state.isInternetReachable);
    if (onStatusChange) onStatusChange(isOnline, state.type);
    if (isOnline) syncPendingRecords(onStatusChange);
  });
}