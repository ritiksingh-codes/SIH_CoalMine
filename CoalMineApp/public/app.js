document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation Logic ---
    const navBtns = document.querySelectorAll('.nav-menu .nav-btn');
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

    // Default to OpenStreetMap (free, no API key required)
    let currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const markers = L.layerGroup().addTo(map);



    // --- Chart.js Initialization ---
    let severityChart;
    let typeChart;

    function initCharts() {
        const ctxSev = document.getElementById('severityChart').getContext('2d');
        severityChart = new Chart(ctxSev, {
            type: 'pie',
            data: {
                labels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
                datasets: [{
                    data: [0, 0, 0, 0],
                    backgroundColor: ['#4CAF50', '#ff9800', '#f44336', '#9c27b0'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#e2e8f0' } }
                }
            }
        });

        const ctxType = document.getElementById('typeChart').getContext('2d');
        typeChart = new Chart(ctxType, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Occurrences',
                    data: [],
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: true, ticks: { color: '#e2e8f0', stepSize: 1 } },
                    x: { ticks: { color: '#e2e8f0' } }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    initCharts();

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

        updateCharts(hazards);

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

    function updateCharts(hazards) {
        // Update Severity Chart
        const sevCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
        const typeCounts = {};

        hazards.forEach(h => {
            const sev = (h.severity || 'LOW').toUpperCase();
            if (sevCounts[sev] !== undefined) sevCounts[sev]++;
            else sevCounts['LOW']++;

            const type = h.hazard_type || 'Unknown';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        });

        severityChart.data.datasets[0].data = [
            sevCounts.LOW, sevCounts.MEDIUM, sevCounts.HIGH, sevCounts.CRITICAL
        ];
        severityChart.update();

        // Update Type Chart
        const types = Object.keys(typeCounts);
        const counts = Object.values(typeCounts);
        
        typeChart.data.labels = types;
        typeChart.data.datasets[0].data = counts;
        typeChart.update();
    }

    // --- End of Day AI Report Logic ---
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportLoader = document.getElementById('report-loader');
    const eodReportContainer = document.getElementById('eod-report-container');

    generateReportBtn.addEventListener('click', async () => {
        reportLoader.classList.remove('hidden');
        eodReportContainer.classList.add('hidden');
        generateReportBtn.disabled = true;

        try {
            const response = await fetch('/api/generate-report');
            const data = await response.json();
            
            if (data.success && data.report) {
                document.getElementById('eod-rating').innerText = data.report.safety_rating || 'UNKNOWN';
                
                // Color code rating
                const ratingBadge = document.getElementById('eod-rating');
                const rating = data.report.safety_rating || 'UNKNOWN';
                if (rating.includes('A')) ratingBadge.style.background = '#10b981';
                else if (rating.includes('B')) ratingBadge.style.background = '#3b82f6';
                else if (rating.includes('C')) ratingBadge.style.background = '#f59e0b';
                else ratingBadge.style.background = '#ef4444';

                document.getElementById('eod-summary').innerText = data.report.executive_summary || 'No summary available.';
                
                const trendsList = document.getElementById('eod-trends');
                trendsList.innerHTML = '';
                (data.report.key_trends || []).forEach(trend => {
                    const li = document.createElement('li');
                    li.innerText = trend;
                    trendsList.appendChild(li);
                });

                const actionsList = document.getElementById('eod-actions');
                actionsList.innerHTML = '';
                (data.report.action_items || []).forEach(action => {
                    const li = document.createElement('li');
                    li.innerText = action;
                    actionsList.appendChild(li);
                });

                eodReportContainer.classList.remove('hidden');
            } else {
                alert("Failed to generate AI report.");
            }
        } catch (error) {
            console.error("Report generation error:", error);
            alert("Error contacting AI server.");
        } finally {
            reportLoader.classList.add('hidden');
            generateReportBtn.disabled = false;
        }
    });

    // Poll every 5 seconds
    fetchHazards();
    setInterval(fetchHazards, 5000);

    // --- Historical Data Fetching ---
    let lastHistoricalCount = -1;

    async function fetchHistorical() {
        try {
            const res = await fetch('/api/historical');
            const historical = await res.json();
            
            if (historical.length !== lastHistoricalCount) {
                lastHistoricalCount = historical.length;
                renderHistorical(historical);
            }
        } catch (error) {
            console.error("Error fetching historical data:", error);
        }
    }

    function renderHistorical(records) {
        const feed = document.getElementById('historical-feed');
        feed.innerHTML = '';

        if (records.length === 0) {
            feed.innerHTML = '<p class="empty-state" style="grid-column: 1 / -1;">No historical records found.</p>';
            return;
        }

        records.reverse().forEach(data => {
            const card = document.createElement('div');
            card.className = 'hazard-card';
            
            const violationsHtml = (data.violations && data.violations.length > 0)
                ? `<ul style="margin: 8px 0; padding-left: 20px; color: #ff5252;">${data.violations.map(v => `<li>${v}</li>`).join('')}</ul>`
                : `<p style="color: #4CAF50; margin: 8px 0;">No critical violations detected.</p>`;
            
            const timeStr = data.time ? ` at ${data.time}` : '';
            const narrativeHtml = data.narrative 
                ? `<div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; font-style: italic; margin-bottom: 10px; font-size: 0.9em;">"${data.narrative}"</div>` 
                : '';
                
            const equipHtml = data.equipment 
                ? `<strong>Equipment:</strong> ${data.equipment}<br/>`
                : '';
            
            let imgHtml = '';
            if (data.saved_image) {
                imgHtml = `<img src="/uploads/${data.saved_image}" class="hazard-img" style="margin-bottom:12px; max-height:200px; object-fit:cover;" alt="Legacy Document" />`;
            }

            // AI Compliance Badges
            let aiHtml = '';
            let aiSeverityBadge = '';
            if (data.ai_compliance) {
                const aiSev = data.ai_compliance.severity || 'UNKNOWN';
                let badgeClass = 'low';
                if (aiSev === 'CRITICAL') badgeClass = 'critical';
                else if (aiSev === 'HIGH') badgeClass = 'high';
                else if (aiSev === 'MEDIUM') badgeClass = 'medium';

                aiSeverityBadge = `<span class="severity-badge ${badgeClass}" style="margin-left:10px;">AI: ${aiSev}</span>`;

                aiHtml = `
                    <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-top: 10px; border-left: 4px solid var(--accent-color);">
                        <strong style="color:var(--accent-color);">Groq AI Compliance Engine:</strong><br/>
                        <strong>Category:</strong> ${data.ai_compliance.category}<br/>
                        <strong>Statutory Violation:</strong> ${data.ai_compliance.statutory_violation ? '<span style="color:#ef4444;">YES</span>' : '<span style="color:#10b981;">NO</span>'}<br/>
                        <strong>Regulation:</strong> ${data.ai_compliance.dgms_regulation_tag}<br/>
                        <strong>Action:</strong> <span style="color:#ef4444;">${data.ai_compliance.recommended_action}</span>
                    </div>
                `;
            }

            card.innerHTML = `
                ${imgHtml}
                <div class="hazard-header">
                    <span class="hazard-type">📄 Pit: ${data.mine_id}</span>
                    ${aiSeverityBadge}
                </div>
                <div class="hazard-desc">
                    <strong>Date/Time:</strong> ${new Date(data.timestamp).toLocaleDateString()}${timeStr}<br/>
                    <strong>CH4 Gas:</strong> ${data.ch4}<br/>
                    ${equipHtml}
                    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;">
                    <strong>Full Transcribed Narrative:</strong>
                    ${narrativeHtml}
                    <strong>Key Observations/Violations (OCR):</strong>
                    ${violationsHtml}
                    ${aiHtml}
                </div>
            `;
            feed.appendChild(card);
        });
    }

    fetchHistorical();
    setInterval(fetchHistorical, 5000);

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
                    const data = result.data;
                    const violationsHtml = (data.critical_violations && data.critical_violations.length > 0)
                        ? `<ul style="margin: 8px 0; padding-left: 20px; color: #ff5252;">${data.critical_violations.map(v => `<li>${v}</li>`).join('')}</ul>`
                        : `<p style="color: #4CAF50; margin: 8px 0;">No critical violations detected.</p>`;
                    
                    const timeStr = data.time ? ` at ${data.time}` : '';
                    const narrativeHtml = data.full_narrative 
                        ? `<div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px; font-style: italic; margin-bottom: 10px;">"${data.full_narrative}"</div>` 
                        : '';
                        
                    const equipHtml = data.equipment_status 
                        ? `<strong>Equipment:</strong> ${data.equipment_status}<br/>`
                        : '';
                        
                    // AI Compliance Badges for live OCR output
                    let aiHtml = '';
                    let aiSeverityBadge = '';
                    const ai_compliance = result.ai_compliance;
                    if (ai_compliance) {
                        const aiSev = ai_compliance.severity || 'UNKNOWN';
                        let badgeClass = 'low';
                        if (aiSev === 'CRITICAL') badgeClass = 'critical';
                        else if (aiSev === 'HIGH') badgeClass = 'high';
                        else if (aiSev === 'MEDIUM') badgeClass = 'medium';

                        aiSeverityBadge = `<span class="severity-badge ${badgeClass}" style="margin-left:10px;">AI: ${aiSev}</span>`;

                        aiHtml = `
                            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; margin-top: 10px; border-left: 4px solid var(--accent-color);">
                                <strong style="color:var(--accent-color);">Groq AI Compliance Engine:</strong><br/>
                                <strong>Category:</strong> ${ai_compliance.category}<br/>
                                <strong>Statutory Violation:</strong> ${ai_compliance.statutory_violation ? '<span style="color:#ef4444;">YES</span>' : '<span style="color:#10b981;">NO</span>'}<br/>
                                <strong>Regulation:</strong> ${ai_compliance.dgms_regulation_tag}<br/>
                                <strong>Action:</strong> <span style="color:#ef4444;">${ai_compliance.recommended_action}</span>
                            </div>
                        `;
                    }

                    jsonOutput.innerHTML = `
                        <div class="hazard-header">
                            <span class="hazard-type">📄 Legacy Report: ${data.pit_seam_id || 'Unknown Pit'}</span>
                            <span class="severity-badge high" style="background: #4CAF50;">SYNCED</span>
                            ${aiSeverityBadge}
                        </div>
                        <div class="hazard-desc">
                            <strong>Date/Time:</strong> ${data.report_date || 'N/A'}${timeStr}<br/>
                            <strong>CH4 Gas:</strong> ${data.gas_concentration_ch4 || 'N/A'}<br/>
                            ${equipHtml}
                            <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 10px 0;">
                            <strong>Full Transcribed Narrative:</strong>
                            ${narrativeHtml}
                            <strong>Key Observations/Violations (OCR):</strong>
                            ${violationsHtml}
                            ${aiHtml}
                        </div>
                    `;
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
