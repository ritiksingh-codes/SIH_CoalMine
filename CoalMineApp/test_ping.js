const axios = require('axios');

async function test() {
  try {
    const res = await axios.get('https://coal-mine-hq.onrender.com/api/generate-report');
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
