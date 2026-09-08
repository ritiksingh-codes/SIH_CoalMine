// Server.js - Central Mine Headquarters Receiver with Image Storage
const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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

// Serve the Central HQ Web Dashboard interface statically
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}
app.use(express.static(publicDir));

// Explicitly serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

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

app.post('/api/legacy-documents', async (req, res) => {
  try {
    const { image_uri, document_id } = req.body;

    if (!image_uri || !image_uri.startsWith('data:image')) {
      return res.status(400).json({ error: "Invalid image format. Must be base64 data URI." });
    }

    // Convert base64 to buffer
    const base64Data = image_uri.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Save locally for reference
    const filename = `legacy_doc_${document_id || Date.now()}.jpeg`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Forward to Python OCR microservice
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    formData.append('file', blob, filename);

    console.log(`Sending image ${filename} to OCR microservice...`);
    const ocrResponse = await fetch('http://127.0.0.1:8000/api/ocr/extract', {
      method: 'POST',
      body: formData
    });

    if (!ocrResponse.ok) {
      throw new Error(`OCR service failed with status ${ocrResponse.status}`);
    }

    const ocrResult = await ocrResponse.json();

    console.clear();
    console.log("==========================================================");
    console.log("📄 [CENTRAL HQ] LEGACY DOCUMENT DIGITIZED 📄");
    console.log("==========================================================");
    console.log(`Saved File   : ${filename}`);
    console.log(`Parsed Data  :`, JSON.stringify(ocrResult.extracted_data, null, 2));
    console.log("==========================================================\n");

    res.status(200).json({
      success: true,
      message: "Document digitized",
      data: ocrResult.extracted_data,
      saved_image: filename
    });

  } catch (error) {
    console.error("OCR Error:", error.message);
    res.status(500).json({ error: "Failed to process legacy document via OCR" });
  }
});

// Start the Python OCR Microservice automatically
const pythonExecutable = path.join(__dirname, 'ocr_service', 'venv', 'Scripts', 'python.exe');
const pythonScript = path.join(__dirname, 'ocr_service', 'main.py');

console.log("Starting Python OCR Microservice...");
const ocrProcess = spawn(pythonExecutable, [pythonScript], {
  cwd: __dirname
});

ocrProcess.stdout.on('data', (data) => {
  process.stdout.write(`[OCR Service]: ${data}`);
});

ocrProcess.stderr.on('data', (data) => {
  process.stderr.write(`[OCR Service Error]: ${data}`);
});

ocrProcess.on('close', (code) => {
  console.log(`[OCR Service] exited with code ${code}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Headquarters Server running on port ${PORT}`);
  console.log(`Ready to receive and save field hazard photos...\n`);
});