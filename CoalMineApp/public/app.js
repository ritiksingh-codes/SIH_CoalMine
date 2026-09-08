document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Logic ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const viewSections = document.querySelectorAll('.view-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            navBtns.forEach(b => b.classList.remove('active'));
            viewSections.forEach(s => s.classList.add('hidden'));
            viewSections.forEach(s => s.classList.remove('active'));

            // Add active class to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target') + '-view';
            const targetSection = document.getElementById(targetId);
            
            targetSection.classList.remove('hidden');
            // Small timeout to allow display:block to apply before animation
            setTimeout(() => {
                targetSection.classList.add('active');
                if (targetId === 'hazards-view' && map) {
                    map.invalidateSize(); // Fix map rendering issue on tab switch
                }
            }, 10);
        });
    });

    // --- Leaflet Map Initialization ---
    // Default center roughly on a coal region in India (e.g., Dhanbad)
    const map = L.map('map').setView([23.7957, 86.4304], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);

    // --- Hazards Data Fetching ---
    let lastHazardCount = -1;

    async function fetchHazards() {
        try {
            const res = await fetch('/api/hazards');
            const hazards = await res.json();
            
            if (hazards.length !== lastHazardCount) {
                lastHazardCount = hazards.length;
                document.getElementById('total-hazards').innerText = hazards.length;
                renderHazards(hazards);
            }
        } catch (error) {
            console.error("Error fetching hazards:", error);
        }
    }

    function renderHazards(hazards) {
        const feed = document.getElementById('hazard-feed');
        feed.innerHTML = '';
        markers.clearLayers();

        // Sort latest first
        const sorted = [...hazards].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (sorted.length === 0) {
            feed.innerHTML = '<p class="empty-state">No hazards reported yet.</p>';
            return;
        }

        const bounds = [];

        sorted.forEach(h => {
            // Render Card
            const card = document.createElement('div');
            card.className = 'hazard-card';
            
            const sevClass = h.severity ? h.severity.toLowerCase() : 'low';
            
            let imgHtml = '';
            if (h.saved_image) {
                imgHtml = `<img src="/uploads/${h.saved_image}" class="hazard-img" alt="Hazard Photo" />`;
            }

            const date = h.timestamp ? new Date(h.timestamp).toLocaleString() : new Date().toLocaleString();

            card.innerHTML = `
                <div class="hazard-header">
                    <span class="hazard-type">⚠️ ${h.hazard_type || 'Unknown'}</span>
                    <span class="severity-badge ${sevClass}">${h.severity || 'LOW'}</span>
                </div>
                <div class="hazard-desc">${h.description || 'No description provided.'}</div>
                <div class="hazard-time">${date} - Pit: ${h.mine_id || 'N/A'}</div>
                ${imgHtml ? `<div style="margin-top: 12px;">${imgHtml}</div>` : ''}
            `;
            
            feed.appendChild(card);

            // Render Map Marker
            if (h.latitude && h.longitude && h.latitude !== "N/A" && h.latitude !== null) {
                const lat = parseFloat(h.latitude);
                const lon = parseFloat(h.longitude);
                bounds.push([lat, lon]);

                const marker = L.marker([lat, lon]).addTo(markers);
                marker.bindPopup(`
                    <div style="text-align:center;">
                        <strong>${h.hazard_type}</strong><br>
                        Severity: <span style="text-transform:uppercase;">${h.severity}</span><br>
                        ${imgHtml ? `<img src="/uploads/${h.saved_image}" style="max-height: 100px; border-radius: 4px; margin-top: 5px;"/>` : ''}
                    </div>
                `);

                // Click card to pan map
                card.addEventListener('click', () => {
                    map.flyTo([lat, lon], 14);
                    marker.openPopup();
                });
            }
        });

        // Fit map bounds if there are markers
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }

    // Poll every 5 seconds
    fetchHazards();
    setInterval(fetchHazards, 5000);

    // --- Legacy OCR Upload Logic ---
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const loader = document.getElementById('loader');
    const resultsContainer = document.getElementById('ocr-results');
    const jsonOutput = document.getElementById('json-output');

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            
            // Show loader, hide previous results
            uploadZone.classList.add('hidden');
            loader.classList.remove('hidden');
            resultsContainer.classList.add('hidden');

            try {
                const response = await fetch('/api/legacy-documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        image_uri: base64Data,
                        document_id: `UPLOAD_${Date.now()}`
                    })
                });

                const result = await response.json();
                
                if (response.ok) {
                    jsonOutput.textContent = JSON.stringify(result.data, null, 2);
                    resultsContainer.classList.remove('hidden');
                } else {
                    alert('Error: ' + (result.error || 'Failed to process document'));
                }
            } catch (error) {
                console.error("Upload error:", error);
                alert("An error occurred while uploading.");
            } finally {
                // Reset UI
                loader.classList.add('hidden');
                uploadZone.classList.remove('hidden');
                fileInput.value = '';
            }
        };
        reader.readAsDataURL(file);
    }
});
