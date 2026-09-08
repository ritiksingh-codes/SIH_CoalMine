// syncEngine.js
import NetInfo from '@react-native-community/netinfo';
import { getPendingHazards, markAsSynced } from './database';

// ⚠️ REPLACE THIS WITH YOUR LAPTOP'S ACTUAL IPv4 ADDRESS FROM STEP 3
const LAPTOP_IP = '10.32.172.137'; 
const SERVER_URL = `http://${LAPTOP_IP}:5000/api/hazards`;

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