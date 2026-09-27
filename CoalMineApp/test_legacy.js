const fs = require('fs');
fetch('http://localhost:5000/api/legacy-documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        image_uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...', // fake base64
        document_id: 'test'
    })
}).then(r => r.json()).then(console.log).catch(console.error);
