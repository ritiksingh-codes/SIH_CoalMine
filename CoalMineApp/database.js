// database.js
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('coal_mine.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS hazards_v3 (
      id TEXT PRIMARY KEY NOT NULL,
      mine_id TEXT NOT NULL,
      hazard_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT,
      latitude REAL,
      longitude REAL,
      image_uri TEXT,
      timestamp TEXT NOT NULL,
      sync_status TEXT DEFAULT 'PENDING'
    );
  `);
  console.log("Database initialized: hazards_v3 table ready with photo and timestamp support.");
}

export function saveHazardLocally(hazard) {
  const statement = db.prepareSync(`
    INSERT INTO hazards_v3 (id, mine_id, hazard_type, severity, description, latitude, longitude, image_uri, timestamp, sync_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING');
  `);

  try {
    statement.executeSync([
      hazard.id,
      hazard.mine_id,
      hazard.hazard_type,
      hazard.severity,
      hazard.description,
      hazard.latitude !== undefined ? hazard.latitude : null,
      hazard.longitude !== undefined ? hazard.longitude : null,
      hazard.image_uri || null,
      hazard.timestamp
    ]);
    console.log("Hazard saved locally with Photo and Timestamp.");
  } finally {
    statement.finalizeSync();
  }
}

export function getLocalHazards() {
  return db.getAllSync('SELECT * FROM hazards_v3 ORDER BY rowid DESC;');
}

export function markAsSynced(id) {
  const statement = db.prepareSync(`
    UPDATE hazards_v3 SET sync_status = 'SYNCED' WHERE id = ?;
  `);

  try {
    statement.executeSync([id]);
    console.log("Record marked as SYNCED");
  } finally {
    statement.finalizeSync();
  }
}

export function getPendingHazards() {
  return db.getAllSync("SELECT * FROM hazards_v3 WHERE sync_status = 'PENDING';");
}