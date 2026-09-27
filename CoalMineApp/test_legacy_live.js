const fs = require('fs');
fetch('https://coal-mine-hq.onrender.com/api/legacy-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        image_uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...', // fake base64
        document_id: 'test_live'
    })
}).then(r => r.json()).then(console.log).catch(console.error);
