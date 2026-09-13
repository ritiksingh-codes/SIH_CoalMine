// Server.js - Central Mine Headquarters Receiver with Image Storage
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');


const http = require('http');
const { Server } = require('socket.io');
const z = require('zod');

function getPythonServiceUrl() {
  let url = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000';
  if (!url.startsWith('http')) {
    if (url.includes('.')) {
      url = 'https://' + url;
    } else {
      url = 'http://' + url + ':10000';
    }
  }
  return url;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Setup Socket.IO connection event
io.on('connection', (socket) => {
  console.log(`[SOCKET] Worker connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[SOCKET] Worker disconnected: ${socket.id}`);
  });
});

// Zod Schema for Hazard Validation
const hazardSchema = z.object({
  id: z.string().optional(),
  mine_id: z.string().optional(),
  hazard_type: z.string(),
  severity: z.string(),
  description: z.string(),
  latitude: z.union([z.number(), z.string(), z.null()]).optional(),
  longitude: z.union([z.number(), z.string(), z.null()]).optional(),
  image_uri: z.string().optional(),
  timestamp: z.string().optional()
});

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

// Database files
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const LIVE_HAZARDS_FILE = path.join(dataDir, 'live_hazards.json');
const HISTORICAL_FILE = path.join(dataDir, 'historical_archives.json');

function loadData(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const fileData = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileData);
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e);
    }
  }
  return [];
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error saving ${filePath}:`, e);
  }
}

let centralLedger = loadData(LIVE_HAZARDS_FILE);
let historicalLedger = loadData(HISTORICAL_FILE);

function processArchives() {
  const now = new Date();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  let didShift = false;

  const stillLive = [];
  
  for (const hazard of centralLedger) {
    // Legacy documents injected to live hazards shouldn't happen anymore, but just in case
    if (hazard.hazard_type === "Historical Paper Record") {
      historicalLedger.push(hazard);
      didShift = true;
      continue;
    }

    const hazardTime = new Date(hazard.received_at || hazard.timestamp);
    if ((now - hazardTime) >= TWENTY_FOUR_HOURS) {
      // Shift to historical
      historicalLedger.push(hazard);
      didShift = true;
    } else {
      stillLive.push(hazard);
    }
  }

  if (didShift) {
    centralLedger = stillLive;
    saveData(LIVE_HAZARDS_FILE, centralLedger);
    saveData(HISTORICAL_FILE, historicalLedger);
    console.log(`[ARCHIVER] Shifted older hazards to Historical Archives.`);
  }
}

app.get('/api/hazards', (req, res) => {
  processArchives();
  res.json(centralLedger);
});

app.get('/api/historical', (req, res) => {
  processArchives();
  res.json(historicalLedger);
});

app.post('/api/hazards', async (req, res) => {
  try {
    // 1. DATA VALIDATION (Zod)
    const hazard = hazardSchema.parse(req.body);
    let savedImageFilename = null;

    // If the record has base64 image data, convert and save it to laptop disk
    if (hazard.image_uri && hazard.image_uri.startsWith('data:image')) {
      const base64Data = hazard.image_uri.replace(/^data:image\/\w+;base64,/, '');
      savedImageFilename = `${hazard.id || Date.now()}.jpeg`;
      const filePath = path.join(uploadDir, savedImageFilename);

      fs.writeFileSync(filePath, base64Data, 'base64');
    }

    // 2. LIVE AI PREDICTION VIA PYTHON MICROSERVICE
    let aiCompliance = null;
    let isCritical = false;
    try {
      const combinedText = `${hazard.hazard_type}. ${hazard.description}`;
      console.log(`Sending live hazard to Groq AI Engine for prediction...`);
      const PYTHON_SERVICE_URL = getPythonServiceUrl();
      
      const aiResponse = await axios.post(`${PYTHON_SERVICE_URL}/api/ai/predict`, { text: combinedText }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (aiResponse.status === 200) {
        const aiData = aiResponse.data;
        if (aiData.success && aiData.ai_compliance) {
          aiCompliance = aiData.ai_compliance;
          console.log(`[AI PREDICTION RECEIVED] Severity: ${aiCompliance.severity}`);
          
          isCritical = aiCompliance.severity === 'CRITICAL' || aiCompliance.severity === 'HIGH';
        }
      }
    } catch (err) {
      console.error("[AI PREDICTION ERROR]", err.message);
      // Fallback to hardcoded logic if AI microservice is unreachable
      isCritical = hazard.severity.toUpperCase() === 'CRITICAL' || 
                   /gas|methane|fire|collapse|roof fall|explosion/i.test(hazard.hazard_type) || 
                   /gas|methane|fire|collapse|roof fall|explosion/i.test(hazard.description);
    }

    // Save to central ledger with AI data
    const hazardEntry = {
      ...hazard,
      ai_compliance: aiCompliance,
      saved_image: savedImageFilename,
      received_at: new Date().toISOString()
    };
    
    // Remove the massive base64 string so it doesn't crash server-to-server requests
    delete hazardEntry.image_uri;

    centralLedger.push(hazardEntry);
    
    saveData(LIVE_HAZARDS_FILE, centralLedger);

    const lat = hazard.latitude ? Number(hazard.latitude).toFixed(5) : 'N/A';
    const lon = hazard.longitude ? Number(hazard.longitude).toFixed(5) : 'N/A';
    const serverHost = process.env.SERVER_HOST || `http://localhost:${PORT}`;
    const photoUrl = savedImageFilename
      ? `${serverHost}/uploads/${savedImageFilename}`
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
    if (aiCompliance) {
      console.log(`AI Prediction: ${JSON.stringify(aiCompliance, null, 2)}`);
    }
    console.log("----------------------------------------------------------");
    console.log(`Total Synced Records at HQ: ${centralLedger.length}`);
    console.log("==========================================================\n");

    // 3. REAL-TIME EVENT STREAMING (Message Broker)
    if (isCritical) {
      console.log(`\n⚠️ [AI PREDICTION ALERT] CRITICAL HAZARD DETECTED! Broadcasting to all workers via WebSockets.\n`);
      const alertMsg = aiCompliance 
        ? `Danger detected: ${hazard.hazard_type}. AI Warning: ${aiCompliance.recommended_action}`
        : `Danger detected: ${hazard.hazard_type}. ${hazard.description}. Please stay clear of this area!`;
        
      io.emit('hazard_alert', {
        id: hazard.id,
        title: "🚨 EVACUATION / CRITICAL WARNING 🚨",
        message: alertMsg,
        severity: aiCompliance ? aiCompliance.severity : hazard.severity,
        recommendation: aiCompliance ? aiCompliance.recommended_action : "Follow standard safety protocols.",
        latitude: hazard.latitude,
        longitude: hazard.longitude,
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({ success: true, message: "Logged at Headquarters with Photo" });
  } catch (e) {
    if (e instanceof z.ZodError) {
      console.error("[VALIDATION ERROR]", e.errors);
      return res.status(400).json({ error: "Validation failed", details: e.errors });
    }
    console.error("[SERVER ERROR]", e);
    return res.status(500).json({ error: "Server error processing hazard" });
  }
});

app.get('/api/hazards', (req, res) => {
  res.json(centralLedger);
});

app.get('/api/generate-report', async (req, res) => {
  try {
    console.log("Generating End of Day Report via AI...");
    const PYTHON_SERVICE_URL = getPythonServiceUrl();
    
    const aiResponse = await axios.post(`${PYTHON_SERVICE_URL}/api/ai/report`, { hazards: centralLedger }, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (aiResponse.status !== 200) {
      throw new Error("AI microservice failed to generate report.");
    }
    
    const result = aiResponse.data;
    res.json(result);
  } catch (error) {
    console.error("[REPORT ERROR]", error.message, error.stack);
    res.status(500).json({ error: "Failed to generate report", details: error.message });
  }
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
    const PYTHON_SERVICE_URL = getPythonServiceUrl();
    
    const ocrResponse = await axios.post(`${PYTHON_SERVICE_URL}/api/ocr/extract`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (ocrResponse.status !== 200) {
      throw new Error(`OCR service failed with status ${ocrResponse.status}`);
    }

    const ocrResult = ocrResponse.data;

    console.clear();
    console.log("==========================================================");
    console.log("📄 [CENTRAL HQ] LEGACY DOCUMENT DIGITIZED 📄");
    console.log("==========================================================");
    console.log(`Saved File   : ${filename}`);
    console.log(`Parsed Data  :`, JSON.stringify(ocrResult.extracted_data, null, 2));
    if (ocrResult.ai_compliance) {
      console.log(`AI Prediction:`, JSON.stringify(ocrResult.ai_compliance, null, 2));
    }
    console.log("==========================================================\n");

    const data = ocrResult.extracted_data;
    
    // Build a rich description using all extracted fields
    let descParts = [];
    if (data.full_narrative) descParts.push(`*Narrative:* "${data.full_narrative}"`);
    if (data.equipment_status) descParts.push(`*Equipment:* ${data.equipment_status}`);
    if (data.gas_concentration_ch4) descParts.push(`*CH4 Level:* ${data.gas_concentration_ch4}`);
    if (data.critical_violations && data.critical_violations.length > 0) {
      descParts.push(`*Violations:* ${data.critical_violations.join(', ')}`);
    }
    const desc = descParts.join(' | ') || "No description provided.";

    historicalLedger.push({
      id: `LEGACY_${document_id || Date.now()}`,
      mine_id: data.pit_seam_id || "Unknown",
      hazard_type: "Historical Paper Record",
      severity: ocrResult.ai_compliance ? ocrResult.ai_compliance.severity : ((data.critical_violations && data.critical_violations.length > 0) ? "HIGH" : "LOW"),
      timestamp: data.report_date || new Date().toISOString(),
      time: data.time || '',
      equipment: data.equipment_status || '',
      narrative: data.full_narrative || '',
      violations: data.critical_violations || [],
      ch4: data.gas_concentration_ch4 || 'N/A',
      ai_compliance: ocrResult.ai_compliance || null,
      saved_image: filename,
      received_at: new Date().toISOString()
    });

    saveData(HISTORICAL_FILE, historicalLedger);

    res.status(200).json({
      success: true,
      message: "Document digitized and synced to Headquarters",
      data: data,
      saved_image: filename
    });

  } catch (error) {
    console.error("OCR Error:", error.message);
    res.status(500).json({ error: "Failed to process legacy document via OCR" });
  }
});

// NOTE: The Python OCR Microservice is deployed as a SEPARATE cloud service.
// Set the PYTHON_SERVICE_URL environment variable in your hosting dashboard.
// For local development, start it manually: cd ocr_service && uvicorn main:app --port 8000

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Headquarters Server running on port ${PORT}`);
  console.log(`Python AI Service URL: ${process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000 (local default)'}`);
  console.log(`Ready to receive and save field hazard photos...\n`);
});