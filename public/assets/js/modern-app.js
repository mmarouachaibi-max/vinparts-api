const API_BASE = "https://vinparts-api.onrender.com";
let currentVehicleData = null;
let panzoomInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
});

// --- UI HELPERS ---
function setStatus(msg, type = "info") {
    const el = document.getElementById("search-status");
    if (el) el.innerHTML = `<div class="alert alert-${type} mt-3 fw-bold">${msg}</div>`;
}

function updateGarage(title, subtitle) {
    document.getElementById('section-garage').classList.remove('d-none');
    document.getElementById('section-search').classList.add('d-none');
    document.getElementById('section-catalog').classList.remove('d-none');
    document.getElementById('garage-vehicle-name').textContent = title;
    document.getElementById('garage-vehicle-details').textContent = subtitle;
}

window.resetSearch = function() { location.reload(); }

// --- 1. RECHERCHE VIN ---
function initVinSearch() {
    const btn = document.getElementById('btn-search-vin');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const vin = document.getElementById('vin-input').value.trim();
        if (!vin) return setStatus("Veuillez entrer un VIN.", "warning");
        setStatus("Identification...", "info");
        try {
            const res = await fetch(`${API_BASE}/levam/vin?vin=${encodeURIComponent(vin)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (!data.client?.ssd) throw new Error("Véhicule introuvable.");
            
            const client = data.client;
            const link = (data.models && data.models[0]?.link) || client.modification;
            startCatalog(client.ssd, link, `${client.mark} ${client.model}`, `VIN: ${client.vin}`);
        } catch (e) { setStatus("Erreur: " + e.message, "danger"); }
    });
}

// --- 2. RECHERCHE MANUELLE LEVAM ---
function initManualLevamSearch() {
    fetch(`${API_BASE}/levam/catalogs`).then(r => r.json()).then(d => {
        const sel = document.getElementById('brandSelect');
        if(d.catalogs) d.catalogs.forEach(c => sel.add(new Option(c.name, c.catalog_code)));
    });

    document.getElementById('brandSelect').addEventListener('change', function() {
        const catCode = this.value;
        const modSel = document.getElementById('modelSelect');
        modSel.innerHTML = '<option>Chargement...</option>';
        modSel.disabled = true;
        if(!catCode) return;
        fetch(`${API_BASE}/levam/models?catalog_code=${catCode}&lang=fr`).then(r => r.json()).then(d => {
            modSel.innerHTML = '<option value="">Modèle</option>';
            if(d.families) {
                Object.keys(d.families).forEach(famName => {
                    const fam = d.families[famName];
                    (fam.models || []).forEach(m => {
                        const opt = new Option(`${fam.family_name || famName} - ${m.model}`, m.model);
                        opt.dataset.family = fam.family_name || famName;
                        modSel.add(opt);
                    });
                });
            }
            modSel.disabled = false;
        });
    });

    document.getElementById('modelSelect').addEventListener('change', async function() {
        const catCode = document.getElementById('brandSelect').value;
        const modelName = this.value;
        const familyName = this.options[this.selectedIndex].dataset.family;
        const vehSel = document.getElementById('vehicleSelect');
        vehSel.innerHTML = '<option>Chargement...</option>';
        vehSel.disabled = true;
        try {
            const pRes = await fetch(`${API_BASE}/levam/vehicle-params?catalog_code=${catCode}&family=${familyName}&model=${modelName}`);
            const pData = await pRes.json();
            const ssd = pData.client ? pData.client.ssd : null;
            if(ssd) {
                const mRes = await fetch(`${API_BASE}/levam/vehicle-mods?ssd=${ssd}`);
                const mData = await mRes.json();
                vehSel.innerHTML = '<option value="">Version</option>';
                if(mData.modifications) {
                    mData.modifications.forEach(mod => {
                        let label = `${mod.engine || ''} ${mod.transmission || ''} (${mod.prod_year || ''})`; 
                        if(label.trim().length < 5) label = "Standard";
                        const opt = new Option(label, mod.link);
                        opt.dataset.ssd = pData.client.ssd;
                        vehSel.add(opt);
                    });
                    vehSel.disabled = false;
                }
            }
        } catch(e) { console.error(e); vehSel.innerHTML = '<option>Erreur</option>'; }
    });

    document.getElementById('vehicleSelect').addEventListener('change', function() {
        const link = this.value;
        const ssd = this.options[this.selectedIndex].dataset.ssd;
        const label = this.options[this.selectedIndex].text;
        if(link && ssd) {
            const brand = document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text;
            const model = document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text;
            startCatalog(ssd, link, `${brand} ${model}`, label);
        }
    });
}

function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    setStatus("", "info");
    loadLevamTree(ssd, link);
}

// --- 3. ARBRE & NAVIGATION ---
async function loadLevamTree(ssd, link) {
    const cont = document.getElementById('tree-container');
    cont.innerHTML = '<div class="text-center p-3 text-muted">Chargement...</div>';
    try {
        const res = await fetch(`${API_BASE}/levam/tree?ssd=${encodeURIComponent(ssd)}&link=${encodeURIComponent(link)}`);
        const data = await res.json();
        renderTree(data.tree);
    } catch (e) { cont.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function renderTree(tree) {
    const cont = document.getElementById('tree-container');
    cont.innerHTML = '';
    if(!tree || Object.keys(tree).length === 0) { cont.innerHTML = '<div class="p-3">Aucune catégorie.</div>'; return; }

    const listGroup = document.createElement('div');
    listGroup.className = 'accordion accordion-flush';
    listGroup.id = 'catAccordion';

    let i = 0;
    for (const [key, val] of Object.entries(tree)) {
        i++;
        const item = document.createElement('div');
        item.className = 'accordion-item';
        item.innerHTML = `
            <h2 class="accordion-header" id="head${i}">
                <button class="accordion-button collapsed fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#col${i}">
                    ${val.name || key}
                </button>
            </h2>
            <div id="col${i}" class="accordion-collapse collapse" data-bs-parent="#catAccordion">
                <div class="accordion-body p-0"><div class="list-group list-group-flush" id="sub${i}"></div></div>
            </div>`;
        listGroup.appendChild(item);
        
        const subCont = item.querySelector(`#sub${i}`);
        if (val.branch) {
            Object.values(val.branch).forEach(sub => {
                if (sub.nodes) {
                    sub.nodes.forEach(n => {
                        const btn = document.createElement('button');
                        btn.className = 'list-group-item list-group-item-action ps-4 py-2 small';
                        btn.innerHTML = `<i class="fa-solid fa-angle-right text-danger me-2"></i> ${n.node_name}`;
                        btn.onclick = () => loadParts(n.node_id, n.node_name);
                        subCont.appendChild(btn);
                    });
                }
            });
        }
    }
    cont.appendChild(listGroup);
}

// --- 4. CHARGEMENT PIÈCES (ZOOM + SKELETONS) ---
async function loadParts(nodeId, nodeName) {
    document.getElementById('category-title').textContent = nodeName;
    const grid = document.getElementById('parts-grid');
    
    // Skeleton
    grid.innerHTML = `
        <div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-text-group"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div><div class="skeleton skeleton-btn"></div></div>
        <div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-text-group"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div><div class="skeleton skeleton-btn"></div></div>
    `;
    
    document.getElementById('exploded-view-container').classList.add('d-none');

    try {
        const { ssd, link } = currentVehicleData;
        const res = await fetch(`${API_BASE}/levam/parts?ssd=${ssd}&link=${link}&group=${nodeId}`);
        const data = await res.json();
        
        let explodedUrl = null;
        if(data.parts && data.parts.image && data.parts.image.length > 0) explodedUrl = data.parts.image[0];

        const parts = (data.parts?.parts || []).map(p => ({
            pos: p.standart?.part_number, 
            ref: p.standart?.part_code,
            name: p.standart?.part_name,
            qty: p.standart?.part_quantity
        }));

        renderPartsList(parts);
        if (explodedUrl) renderExplodedView(explodedUrl, data.parts.coord);

    } catch (e) { grid.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function renderExplodedView(url, coordsData) {
    const container = document.getElementById('exploded-view-container');
    const wrap = document.getElementById('exploded-wrapper');
    wrap.innerHTML = '';
    container.classList.remove('d-none'); 

    if (panzoomInstance) { panzoomInstance.dispose(); panzoomInstance = null; }

    const img = document.createElement('img');
    img.src = url;
    wrap.appendChild(img);

    if (coordsData && coordsData[0]) {
        coordsData[0].forEach(c => {
            const m = document.createElement('div');
            m.className = 'exploded-marker';
            m.textContent = c.name;
            m.dataset.pos = c.name;
            m.style.top = c['margin-top'] + '%';
            m.style.left = c['margin-left'] + '%';
            m.onclick = (e) => { e.stopPropagation(); highlightItem(c.name); };
            m.ontouchstart = (e) => { e.stopPropagation(); };
            wrap.appendChild(m);
        });
    }

    img.onload = () => {
        panzoomInstance = panzoom(wrap, { maxZoom: 5, minZoom: 0.5, bounds: true, boundsPadding: 0.1 });
    };
}

window.zoomIn = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 1.25); };
window.zoomOut = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 0.8); };
window.zoomReset = () => { if(panzoomInstance) { panzoomInstance.moveTo(0,0); panzoomInstance.zoomAbs(0,0,1); } };

function renderPartsList(parts) {
    const grid = document.getElementById('parts-grid');
    if (!parts.length) { grid.innerHTML = '<div class="alert alert-info">Aucune pièce trouvée.</div>'; return; }

    grid.innerHTML = parts.map(p => `
        <div id="row-${p.pos}" class="part-card card mb-2 p-2 shadow-sm" onclick="highlightItem('${p.pos}')" style="cursor:pointer">
            <div class="d-flex align-items-center">
                <div class="fw-bold bg-light p-2 rounded text-danger me-3" style="min-width:40px; text-align:center;">${p.pos || '-'}</div>
                <div class="flex-grow-1">
                    <h6 class="mb-0 fw-bold text-dark">${p.name}</h6>
                    <small class="text-muted">OE: ${p.ref}</small>
                </div>
                <div class="text-end">
                    <button class="btn btn-sm btn-outline-danger fw-bold" onclick="showTecDocOffers('${p.ref}')">
                        <i class="fa-solid fa-tags"></i> Voir Offres
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function highlightItem(posId) {
    if(!posId) return;
    document.querySelectorAll('.part-card').forEach(e => e.classList.remove('active-part'));
    document.querySelectorAll('.exploded-marker').forEach(e => e.classList.remove('active'));
    const marker = document.querySelector(`.exploded-marker[data-pos="${posId}"]`);
    if(marker) marker.classList.add('active');
    const rows = document.querySelectorAll(`[id="row-${posId}"]`);
    rows.forEach(r => { r.classList.add('active-part'); r.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}

// --- 5. INTÉGRATION PRIX (MATEROM) ---
async function showTecDocOffers(oeCode) {
    event.stopPropagation();
    const modalEl = document.getElementById('productModal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modal = new bootstrap.Modal(modalEl);

    modalTitle.textContent = `Offres pour OE ${oeCode}`;
    modalBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br>Recherche pièces & prix...</div>';
    modal.show();

    try {
        // 1. Recherche TecDoc
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        
        if(!data.articles || data.articles.length === 0) {
            modalBody.innerHTML = '<div class="alert alert-warning">Aucune correspondance trouvée.</div>';
            return;
        }

        // 2. Recherche Prix Materom (Parallèle)
        const articlesWithPrice = await Promise.all(data.articles.map(async (a) => {
            try {
                // On passe brand en plus pour aider le filtre côté serveur
                const priceRes = await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`);
                const priceData = await priceRes.json();
                return { ...a, materom: priceData };
            } catch (err) {
                return { ...a, materom: { found: false } };
            }
        }));

        // 3. Affichage
        modalBody.innerHTML = `<div class="list-group">
            ${articlesWithPrice.map(a => {
                let priceHtml = '<span class="badge bg-secondary">Sur devis</span>';
                let btnHtml = `<button class="btn btn-outline-dark btn-sm" disabled>Indisponible</button>`;

                if (a.materom && a.materom.found && a.materom.price > 0) {
                    // Conversion (approx)
                    const priceCHF = (a.materom.currency === 'RON') ? (a.materom.price * 0.19).toFixed(2) : a.materom.price;
                    const stockClass = a.materom.stock > 0 ? "text-success" : "text-danger";
                    const stockText = a.materom.stock > 0 ? "En stock" : (a.materom.delivery || "Sur commande");
                    
                    priceHtml = `<div class="text-end">
                        <div class="fs-5 fw-bold text-danger">${priceCHF} CHF</div>
                        <small class="${stockClass} fw-bold"><i class="fa-solid fa-box"></i> ${stockText}</small>
                    </div>`;
                    
                    if(a.materom.stock > 0) {
                        btnHtml = `<button class="btn btn-danger btn-sm fw-bold" onclick="sendToPrestashop('${a.ref}')">
                            <i class="fa-solid fa-cart-plus"></i> Ajouter
                        </button>`;
                    }
                }

                return `
                <div class="list-group-item d-flex align-items-center justify-content-between">
                    <div class="d-flex align-items-center" style="max-width:60%">
                        <div style="width:60px; height:60px;" class="me-3 d-flex align-items-center justify-content-center">
                            ${a.img ? `<img src="${a.img}" style="max-width:100%; max-height:100%;">` : '<i class="fa-solid fa-gear text-muted fs-3"></i>'}
                        </div>
                        <div>
                            <h6 class="mb-0 fw-bold">${a.brand} - ${a.ref}</h6>
                            <small class="text-muted d-block text-truncate">${a.name}</small>
                            ${a.isFuzzy ? '<span class="badge bg-warning text-dark" style="font-size:0.6rem">Similaire</span>' : ''}
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        ${priceHtml}
                        ${btnHtml}
                    </div>
                </div>`;
            }).join('')}
        </div>
        <div class="modal-footer bg-light p-2"><small class="text-muted w-100 text-center">Prix estimatifs en CHF</small></div>`;

    } catch(e) { 
        modalBody.innerHTML = `<div class="alert alert-danger">Erreur: ${e.message}</div>`; 
    }
}

function sendToPrestashop(ref) {
    // Redirection vers le panier/recherche PrestaShop
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}