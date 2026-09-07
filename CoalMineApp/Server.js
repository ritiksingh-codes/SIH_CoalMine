// Server.js - Central Mine Headquarters Receiver with Image Storage
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5000;

// Allow large payloads for base64 image strings
app.use(express.json({ limit: '50mb' }));

// Create 'uploads' folder if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Serve uploaded images statically so you can click and open them in your browser
app.use('/uploads', express.static(uploadDir));

const centralLedger = [];

app.post('/api/hazards', (req, res) => {
  const hazard = req.body;
  let savedImageFilename = null;

  // If the record has base64 image data, convert and save it to laptop disk
  if (hazard.image_uri && hazard.image_uri.startsWith('data:image')) {
    const base64Data = hazard.image_uri.replace(/^data:image\/\w+;base64,/, '');
    savedImageFilename = `${hazard.id || Date.now()}.jpeg`;
    const filePath = path.join(uploadDir, savedImageFilename);

    fs.writeFileSync(filePath, base64Data, 'base64');
  }

  centralLedger.push({ 
    ...hazard, 
    saved_image: savedImageFilename,
    received_at: new Date().toISOString() 
  });

  const lat = hazard.latitude ? Number(hazard.latitude).toFixed(5) : 'N/A';
  const lon = hazard.longitude ? Number(hazard.longitude).toFixed(5) : 'N/A';
  const photoUrl = savedImageFilename 
    ? `http://localhost:${PORT}/uploads/${savedImageFilename}` 
    : 'No Image Attached';

  console.clear();
  console.log("==========================================================");
  console.log("🚨 [CENTRAL HQ COMPLIANCE MONITOR] NEW HAZARD SYNCED 🚨");
  console.log("==========================================================");
  console.log(`Ticket ID    : ${hazard.id}`);
  console.log(`Mine ID      : ${hazard.mine_id}`);
  console.log(`Hazard Type  : ${hazard.hazard_type} [${hazard.severity}]`);
  console.log(`Field Time   : ${hazard.timestamp}`);
  console.log(`GPS Coords   : Lat ${lat}, Lon ${lon}`);
  console.log(`Maps Link    : https://www.google.com/maps?q=${lat},${lon}`);
  console.log(`Photo Link   : ${photoUrl}`);
  console.log(`Description  : ${hazard.description}`);
  console.log("----------------------------------------------------------");
  console.log(`Total Synced Records at HQ: ${centralLedger.length}`);
  console.log("==========================================================\n");

  res.status(200).json({ success: true, message: "Logged at Headquarters with Photo" });
});

app.get('/api/hazards', (req, res) => {
  res.json(centralLedger);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Headquarters Server running on port ${PORT}`);
  console.log(`Ready to receive and save field hazard photos...\n`);
});