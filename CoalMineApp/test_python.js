const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function test() {
  try {
    const form = new FormData();
    // we don't have a file, just sending a dummy request to see the error message
    const res = await axios.post('https://coal-mine-ocr.onrender.com/api/ocr/extract', form, {
      headers: form.getHeaders()
    });
    console.log("SUCCESS:", res.data);
  } catch (err) {
    if (err.response) {
      console.log("ERROR STATUS:", err.response.status);
      console.log("ERROR DATA:", err.response.data);
    } else {
      console.log("NETWORK ERROR:", err.message);
    }
  }
}
test();
