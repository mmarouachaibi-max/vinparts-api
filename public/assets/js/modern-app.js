// URL DE L'API RENDER
const API_BASE = "https://vinparts-api.onrender.com/api"; 

let currentVehicleData = null;
let panzoomInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
    initRefSearch();
});

// --- UI MANAGERS ---
function setStatus(msg, type = "info") {
    const el = document.getElementById("search-status");
    if (el) el.innerHTML = `<div class="alert alert-${type} mt-3 fw-bold">${msg}</div>`;
}

function updateGarage(title, subtitle) {
    document.getElementById('section-garage').classList.remove('d-none');
    document.getElementById('section-search').classList.add('d-none');
    document.getElementById('section-catalog').classList.remove('d-none');
    
    // Reset layout (afficher la colonne de gauche)
    document.getElementById('tree-column').classList.remove('d-none');
    document.getElementById('parts-column').className = "col-lg-9";
    
    document.getElementById('garage-vehicle-name').textContent = title;
    document.getElementById('garage-vehicle-details').textContent = subtitle;
}

window.resetSearch = function() { location.reload(); }

// 1. RECHERCHE VIN
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
            startCatalog(data.client.ssd, (data.models && data.models[0]?.link) || data.client.modification, `${data.client.mark} ${data.client.model}`, `VIN: ${data.client.vin}`);
        } catch (e) { setStatus("Erreur: " + e.message, "danger"); }
    });
}

// 2. RECHERCHE MANUELLE
function initManualLevamSearch() {
    fetch(`${API_BASE}/levam/catalogs`).then(r => r.json()).then(d => {
        const sel = document.getElementById('brandSelect');
        if(d.catalogs) d.catalogs.forEach(c => sel.add(new Option(c.name, c.catalog_code)));
    });
    document.getElementById('brandSelect').addEventListener('change', function() {
        const cat = this.value;
        const ms = document.getElementById('modelSelect');
        ms.innerHTML = '<option>Chargement...</option>'; ms.disabled = true;
        if(!cat) return;
        fetch(`${API_BASE}/levam/models?catalog_code=${cat}&lang=fr`).then(r => r.json()).then(d => {
            ms.innerHTML = '<option value="">Modèle</option>';
            if(d.families) Object.keys(d.families).forEach(f => d.families[f].models.forEach(m => {
                const opt = new Option(`${d.families[f].family_name || f} - ${m.model}`, m.model);
                opt.dataset.family = d.families[f].family_name || f;
                ms.add(opt);
            }));
            ms.disabled = false;
        });
    });
    document.getElementById('modelSelect').addEventListener('change', async function() {
        const cat = document.getElementById('brandSelect').value;
        const fam = this.options[this.selectedIndex].dataset.family;
        const vs = document.getElementById('vehicleSelect');
        vs.innerHTML = '<option>Chargement...</option>'; vs.disabled = true;
        try {
            const p = await (await fetch(`${API_BASE}/levam/vehicle-params?catalog_code=${cat}&family=${fam}&model=${this.value}`)).json();
            const ssd = p.client?.ssd;
            if(ssd) {
                const m = await (await fetch(`${API_BASE}/levam/vehicle-mods?ssd=${ssd}`)).json();
                vs.innerHTML = '<option value="">Version</option>';
                if(m.modifications) m.modifications.forEach(mod => {
                    const opt = new Option(`${mod.engine||''} ${mod.transmission||''} (${mod.prod_year||''})` || "Standard", mod.link);
                    opt.dataset.ssd = ssd;
                    vs.add(opt);
                });
                vs.disabled = false;
            }
        } catch(e) { console.error(e); }
    });
    document.getElementById('vehicleSelect').addEventListener('change', function() {
        const ssd = this.options[this.selectedIndex].dataset.ssd;
        if(this.value && ssd) startCatalog(ssd, this.value, document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text + ' ' + document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text, this.options[this.selectedIndex].text);
    });
}

// 3. RECHERCHE PAR REFERENCE
function initRefSearch() {
    const btn = document.getElementById('btn-search-ref');
    if (!btn) return;
    const triggerSearch = async () => {
        const term = document.getElementById('ref-input').value.trim();
        if (!term || term.length < 2) return setStatus("Saisissez au moins 2 caractères", "warning");
        setStatus("Recherche universelle...", "info");
        try {
            const res = await fetch(`${API_BASE}/tecdoc/search-any?term=${encodeURIComponent(term)}`);
            const data = await res.json();
            if (!data.success || !data.articles || data.articles.length === 0) {
                setStatus("Aucun résultat trouvé.", "warning");
                return;
            }
            showDirectResults(data.articles, term);
            setStatus("", "info");
        } catch (e) { setStatus("Erreur: " + e.message, "danger"); }
    };
    btn.addEventListener('click', triggerSearch);
    document.getElementById('ref-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') triggerSearch(); });
}

function showDirectResults(articles, term) {
    document.getElementById('section-garage').classList.add('d-none');
    document.getElementById('section-search').classList.add('d-none');
    document.getElementById('section-catalog').classList.remove('d-none');
    
    // Layout Pleine Largeur
    document.getElementById('tree-column').classList.add('d-none');
    document.getElementById('parts-column').className = "col-12";
    document.getElementById('exploded-view-container').classList.add('d-none');

    document.getElementById('category-title').innerHTML = `Résultats pour "<strong>${term}</strong>" (${articles.length})`;
    const grid = document.getElementById('parts-grid');
    
    // Bouton retour
    let html = `<div class="mb-3"><button class="btn btn-secondary btn-sm" onclick="location.reload()"><i class="fa-solid fa-arrow-left"></i> Nouvelle recherche</button></div>`;
    
    html += articles.map(a => `
        <div class="part-card card mb-3 p-3 shadow-sm border">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div class="d-flex align-items-center">
                    <div style="width:80px; height:80px;" class="me-4 d-flex align-items-center justify-content-center bg-light rounded border">
                        ${a.img ? `<img src="${a.img}" style="max-width:100%; max-height:100%;">` : '<i class="fa-solid fa-box-open text-muted fs-2"></i>'}
                    </div>
                    <div>
                        <h5 class="mb-1 fw-bold text-primary">${a.brand} - ${a.ref}</h5>
                        <div class="text-dark fw-bold">${a.name}</div>
                        ${a.oem ? `<small class="text-muted">OE: ${a.oem}</small>` : ''}
                    </div>
                </div>
                <div class="text-end">
                    <button class="btn btn-outline-primary fw-bold" onclick="showTecDocOffers('${a.ref}')">
                        <i class="fa-solid fa-tag me-2"></i> Voir Prix & Stock
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    grid.innerHTML = html;
}

function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    setStatus("", "info");
    loadLevamTree(ssd, link);
}

// 4. ARBRE & PIECES
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
    const listGroup = document.createElement('div'); listGroup.className = 'accordion accordion-flush'; listGroup.id = 'catAccordion';
    let i = 0;
    for (const [key, val] of Object.entries(tree)) {
        i++;
        const item = document.createElement('div'); item.className = 'accordion-item';
        item.innerHTML = `<h2 class="accordion-header" id="head${i}"><button class="accordion-button collapsed fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#col${i}">${val.name || key}</button></h2><div id="col${i}" class="accordion-collapse collapse" data-bs-parent="#catAccordion"><div class="accordion-body p-0"><div class="list-group list-group-flush" id="sub${i}"></div></div></div>`;
        listGroup.appendChild(item);
        if (val.branch) Object.values(val.branch).forEach(sub => { if (sub.nodes) sub.nodes.forEach(n => { const btn = document.createElement('button'); btn.className = 'list-group-item list-group-item-action ps-4 py-2 small'; btn.innerHTML = `<i class="fa-solid fa-caret-right me-2"></i> ${n.node_name}`; btn.onclick = () => loadParts(n.node_id, n.node_name); item.querySelector(`#sub${i}`).appendChild(btn); }); });
    }
    cont.appendChild(listGroup);
}

async function loadParts(nodeId, nodeName) {
    document.getElementById('category-title').textContent = nodeName;
    const grid = document.getElementById('parts-grid');
    grid.innerHTML = '<div class="skeleton-card"><div class="skeleton skeleton-img"></div><div class="skeleton-text-group"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div><div class="skeleton skeleton-btn"></div></div>'.repeat(3);
    document.getElementById('exploded-view-container').classList.add('d-none');

    try {
        const res = await fetch(`${API_BASE}/levam/parts?ssd=${currentVehicleData.ssd}&link=${currentVehicleData.link}&group=${nodeId}`);
        const data = await res.json();
        
        let explodedUrl = null;
        if(data.parts && data.parts.image && data.parts.image.length > 0) explodedUrl = data.parts.image[0];

        const parts = (data.parts?.parts || []).map(p => ({ pos: p.standart?.part_number, ref: p.standart?.part_code, name: p.standart?.part_name, qty: p.standart?.part_quantity }));
        renderPartsList(parts);
        if (explodedUrl) renderExplodedView(explodedUrl, data.parts.coord);
    } catch (e) { grid.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
}

function renderExplodedView(url, coordsData) {
    const c = document.getElementById('exploded-view-container'); c.classList.remove('d-none');
    const w = document.getElementById('exploded-wrapper'); w.innerHTML = '';
    if (panzoomInstance) { panzoomInstance.dispose(); panzoomInstance = null; }
    const img = document.createElement('img'); img.src = url; w.appendChild(img);
    if (coordsData && coordsData[0]) coordsData[0].forEach(co => { const m = document.createElement('div'); m.className = 'exploded-marker'; m.textContent = co.name; m.dataset.pos = co.name; m.style.top = co['margin-top']+'%'; m.style.left = co['margin-left']+'%'; m.onclick = (e) => { e.stopPropagation(); highlightItem(co.name); }; m.ontouchstart = (e) => { e.stopPropagation(); }; w.appendChild(m); });
    img.onload = () => { panzoomInstance = panzoom(w, { maxZoom: 5, minZoom: 0.5, bounds: true, boundsPadding: 0.1 }); };
}
window.zoomIn = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 1.25); };
window.zoomOut = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 0.8); };
window.zoomReset = () => { if(panzoomInstance) { panzoomInstance.moveTo(0,0); panzoomInstance.zoomAbs(0,0,1); } };

function renderPartsList(parts) {
    const grid = document.getElementById('parts-grid');
    if (!parts.length) { grid.innerHTML = '<div class="alert alert-info">Aucune pièce.</div>'; return; }
    grid.innerHTML = parts.map(p => `<div id="row-${p.pos}" class="part-card card mb-2 p-2 shadow-sm" onclick="highlightItem('${p.pos}')" style="cursor:pointer"><div class="d-flex align-items-center"><div class="fw-bold bg-light p-2 rounded text-danger me-3" style="min-width:40px; text-align:center;">${p.pos || '-'}</div><div class="flex-grow-1"><h6 class="mb-0 fw-bold text-dark">${p.name}</h6><small class="text-muted">OE: ${p.ref}</small></div><div class="text-end"><button class="btn btn-sm btn-outline-danger fw-bold" onclick="showTecDocOffers('${p.ref}')"><i class="fa-solid fa-tags"></i> Voir Offres</button></div></div></div>`).join('');
}

function highlightItem(posId) {
    if(!posId) return;
    document.querySelectorAll('.part-card').forEach(e => e.classList.remove('active-part'));
    document.querySelectorAll('.exploded-marker').forEach(e => e.classList.remove('active'));
    const m = document.querySelector(`.exploded-marker[data-pos="${posId}"]`); if(m) m.classList.add('active');
    const r = document.querySelectorAll(`[id="row-${posId}"]`); r.forEach(row => { row.classList.add('active-part'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}

// 5. MODALE PRIX
async function showTecDocOffers(oeCode) {
    event.stopPropagation();
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    document.getElementById('modal-title').textContent = `Offres pour OE ${oeCode}`;
    const mb = document.getElementById('modal-body');
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br>Recherche...</div>';
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        if(!data.articles || data.articles.length === 0) { mb.innerHTML = '<div class="alert alert-warning">Aucune correspondance.</div>'; return; }

        const prices = await Promise.all(data.articles.map(async (a) => {
            try { return { ...a, materom: await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json() }; } 
            catch { return { ...a, materom: { found: false } }; }
        }));

        mb.innerHTML = `<div class="list-group">` + prices.map(a => {
            let priceHtml = '<span class="badge bg-secondary">Sur devis</span>', btnHtml = `<button class="btn btn-outline-dark btn-sm" disabled>Indisponible</button>`;
            if (a.materom && a.materom.found && a.materom.price > 0) {
                const priceCHF = (a.materom.currency === 'RON' ? (a.materom.price * 0.19) : a.materom.price).toFixed(2);
                priceHtml = `<div class="text-end"><div class="fs-5 fw-bold text-danger">${priceCHF} CHF</div><small class="${a.materom.stock > 0 ? "text-success" : "text-danger"} fw-bold">${a.materom.stock > 0 ? "En stock" : "Rupture"}</small></div>`;
                if(a.materom.stock > 0) btnHtml = `<button class="btn btn-danger btn-sm fw-bold" onclick="sendToPrestashop('${a.ref}')"><i class="fa-solid fa-cart-plus"></i> Ajouter</button>`;
            }
            return `<div class="list-group-item d-flex align-items-center justify-content-between"><div class="d-flex align-items-center" style="max-width:60%"><div style="width:60px; height:60px;" class="me-3 d-flex align-items-center justify-content-center border rounded p-1">${a.img ? `<img src="${a.img}" style="max-width:100%; max-height:100%;">` : '<i class="fa-solid fa-gear text-muted fs-3"></i>'}</div><div><h6 class="mb-0 fw-bold">${a.brand} - ${a.ref}</h6><small class="text-muted d-block text-truncate">${a.name}</small></div></div><div class="d-flex align-items-center gap-3">${priceHtml}${btnHtml}</div></div>`;
        }).join('') + `</div>`;
    } catch(e) { mb.innerHTML = `<div class="alert alert-danger">Erreur: ${e.message}</div>`; }
}

function sendToPrestashop(ref) {
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}