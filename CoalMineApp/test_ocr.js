const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

async function testOCR() {
  try {
    // Generate a tiny blank image
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const buffer = Buffer.from(base64Image, 'base64');
    
    const form = new FormData();
    form.append('file', buffer, { filename: 'test.png', contentType: 'image/png' });

    console.log("Sending request to OCR...");
    const res = await axios.post('https://coal-mine-ocr.onrender.com/api/ocr/extract', form, {
      headers: form.getHeaders(),
      timeout: 30000
    });
    
    console.log("SUCCESS:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (err.response) {
      console.log("ERROR STATUS:", err.response.status);
      console.log("ERROR DATA:", err.response.data);
    } else {
      console.log("NETWORK ERROR:", err.message);
    }
  }
}
testOCR();
