const axios = require('axios');

async function test() {
  try {
    const res = await axios.post('https://coal-mine-hq.onrender.com/api/hazards', {
      hazard_type: "Gas Leak",
      severity: "CRITICAL",
      description: "CH4 levels high."
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
