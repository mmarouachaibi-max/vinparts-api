const API_BASE = "/api"; 
let currentVehicleData = null;
let panzoomInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
    initRefSearch();
    initGlobalSearch();
});

// UI
function setStatus(msg, type = "info") {
    const el = document.getElementById("search-status");
    if (el) el.innerHTML = `<div class="alert alert-${type} mt-3 fw-bold shadow-sm">${msg}</div>`;
}

function updateGarage(title, subtitle) {
    document.getElementById('section-garage').classList.remove('d-none');
    document.getElementById('section-search').classList.add('d-none');
    document.getElementById('section-catalog').classList.remove('d-none');
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
            const res = await fetch(`${API_BASE}/levam/VinFind?vin=${encodeURIComponent(vin)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (!data.client?.ssd) throw new Error("Véhicule introuvable.");
            startCatalog(data.client.ssd, (data.models && data.models[0]?.link) || data.client.modification, `${data.client.mark} ${data.client.model}`, `VIN: ${data.client.vin}`);
        } catch (e) { setStatus("Erreur: " + e.message, "danger"); }
    });
}

// 2. MANUEL
function initManualLevamSearch() {
    fetch(`${API_BASE}/levam/CatalogsListGet?type=0&lang=fr`).then(r => r.json()).then(d => {
        const sel = document.getElementById('brandSelect');
        if(sel && d.catalogs) {
            d.catalogs.sort((a,b) => a.name.localeCompare(b.name));
            d.catalogs.forEach(c => sel.add(new Option(c.name, c.catalog_code)));
        }
    });

    const bs = document.getElementById('brandSelect');
    if(bs) bs.addEventListener('change', function() {
        const cat = this.value;
        const ms = document.getElementById('modelSelect');
        const vs = document.getElementById('vehicleSelect');
        ms.innerHTML = '<option value="">Modèle</option>'; ms.disabled = true;
        vs.innerHTML = '<option value="">Version</option>'; vs.disabled = true;
        if(!cat) return;
        fetch(`${API_BASE}/levam/ModelsListGet2?catalog_code=${cat}&lang=fr`).then(r => r.json()).then(d => {
            ms.innerHTML = '<option value="">Modèle</option>';
            if(d.families) {
                Object.keys(d.families).forEach(famKey => {
                    const family = d.families[famKey];
                    const models = family.models || [family]; 
                    models.forEach(m => {
                        const opt = new Option(m.model, m.model); 
                        opt.dataset.family = family.family_name || famKey;
                        ms.add(opt);
                    });
                });
                ms.disabled = false;
            } else if (d.models) {
                d.models.forEach(m => ms.add(new Option(m.model, m.model)));
                ms.disabled = false;
            }
        });
    });

    const ms = document.getElementById('modelSelect');
    if(ms) ms.addEventListener('change', async function() {
        const cat = document.getElementById('brandSelect').value;
        const fam = this.options[this.selectedIndex].dataset.family;
        const model = this.value;
        const vs = document.getElementById('vehicleSelect');
        vs.innerHTML = '<option>Chargement...</option>'; vs.disabled = true;
        try {
            const pRes = await fetch(`${API_BASE}/levam/VehicleParamsSet?catalog_code=${cat}&family=${fam}&model=${model}`);
            const pData = await pRes.json();
            const ssd = pData.client?.ssd;
            if(ssd) {
                const mRes = await fetch(`${API_BASE}/levam/VehicleModificationsGet?ssd=${ssd}&lang=fr`);
                const mData = await mRes.json();
                vs.innerHTML = '<option value="">Version</option>';
                if(mData.modifications && mData.modifications.length > 0) {
                    const seen = new Set();
                    mData.modifications.forEach(mod => {
                        let parts = [];
                        if(mod.name && mod.name !== "Standard") parts.push(mod.name);
                        if(mod.engine) parts.push(mod.engine);
                        if(mod.power_hp) parts.push(mod.power_hp + "hp");
                        if(mod.body_type) parts.push(mod.body_type);
                        if(mod.prod_year) parts.push(`[${mod.prod_year}]`);
                        let label = parts.join(" ").trim();
                        if(!label) label = "Version " + (mod.id || "Inconnue");
                        if (!seen.has(label)) {
                            seen.add(label);
                            const opt = new Option(label, mod.link);
                            opt.dataset.ssd = ssd;
                            vs.add(opt);
                        }
                    });
                    vs.disabled = false;
                } else { vs.innerHTML = '<option value="">Aucune version spécifique</option>'; }
            } else { vs.innerHTML = '<option>Erreur</option>'; }
        } catch(e) { console.error(e); vs.innerHTML = '<option>Erreur</option>'; }
    });

    const vs = document.getElementById('vehicleSelect');
    if(vs) vs.addEventListener('change', function() {
        const ssd = this.options[this.selectedIndex].dataset.ssd;
        const link = this.value;
        const brand = document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text;
        const model = document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text;
        const version = this.options[this.selectedIndex].text;
        if(link && ssd) startCatalog(ssd, link, `${brand} ${model}`, version);
    });
}

function initGlobalSearch() {
    const desktopInput = document.getElementById('global-search-input');
    const btn = document.getElementById('btn-global-search');
    const doSearch = async (term) => {
        if (!term || term.length < 2) { alert("2 caractères min."); return; }
        document.getElementById('section-garage').classList.add('d-none');
        document.getElementById('section-search').classList.add('d-none');
        document.getElementById('section-catalog').classList.remove('d-none');
        document.getElementById('tree-column').classList.add('d-none');
        document.getElementById('parts-column').className = "col-12";
        document.getElementById('exploded-view-container').classList.add('d-none');
        const grid = document.getElementById('parts-grid');
        grid.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br>Recherche...</div>';
        document.getElementById('category-title').textContent = `Résultats: "${term}"`;
        try {
            const res = await fetch(`${API_BASE}/tecdoc/search-any?term=${encodeURIComponent(term)}`);
            const data = await res.json();
            if (!data.success || !data.articles || data.articles.length === 0) {
                grid.innerHTML = '<div class="alert alert-warning text-center">Aucun résultat.</div>'; return;
            }
            renderRichResultsList(data.articles);
        } catch (e) { grid.innerHTML = `<div class="alert alert-danger">${e.message}</div>`; }
    };
    if(btn) btn.addEventListener('click', () => doSearch(desktopInput.value));
    if(desktopInput) desktopInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') doSearch(desktopInput.value); });
}

function initRefSearch() {
    const btn = document.getElementById('btn-search-ref');
    if (!btn) return;
    const triggerSearch = async () => {
        const term = document.getElementById('ref-input').value.trim();
        if (!term || term.length < 2) return setStatus("2 caractères min.", "warning");
        document.getElementById('global-search-input').value = term; 
        document.getElementById('btn-global-search').click();
    };
    btn.addEventListener('click', triggerSearch);
    document.getElementById('ref-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') triggerSearch(); });
}

// RENDU
async function renderRichResultsList(articles) {
    const grid = document.getElementById('parts-grid');
    grid.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br>Prix & Stocks...</div>';
    const articlesWithPrice = await Promise.all(articles.map(async (a) => {
        if(!a.ref || a.ref === "Inconnu") return { ...a, materom: { found: false } };
        try { 
            const priceData = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json();
            return { ...a, materom: priceData }; 
        } catch { return { ...a, materom: { found: false } }; }
    }));
    let html = `<div class="mb-3"><button class="btn btn-secondary btn-sm shadow-sm" onclick="location.reload()">Retour</button></div><div class="list-group">`;
    html += articlesWithPrice.map((a, index) => buildRichRow(a, index)).join('');
    html += `</div>`;
    grid.innerHTML = html;
}

// CONSTRUCTION LIGNE AVEC FICHE TECHNIQUE COMPLÈTE
function buildRichRow(a, index) {
    let priceHtml = '<span class="badge bg-light text-dark border">Sur devis</span>';
    let btnHtml = `<button class="btn btn-outline-secondary btn-sm" disabled>Indisponible</button>`;
    if (a.materom && a.materom.found && a.materom.price > 0) {
        const priceCHF = (a.materom.currency === 'RON' ? (a.materom.price * 0.19) : a.materom.price).toFixed(2);
        const inStock = a.materom.stock > 0;
        priceHtml = `<div class="text-end"><div class="fs-5 fw-bold text-danger">${priceCHF} CHF</div><div class="small ${inStock ? "text-success" : "text-danger"} fw-bold">${inStock ? "En stock" : "Rupture"}</div></div>`;
        if(inStock) btnHtml = `<button class="btn btn-danger btn-sm fw-bold shadow-sm px-3" onclick="sendToPrestashop('${a.ref}')"><i class="fa-solid fa-cart-shopping me-1"></i></button>`;
    }

    // --- CONSTRUCTION FICHE TECHNIQUE COMPLÈTE ---
    
    // 1. Critères Physiques
    let critHtml = (a.criteria && a.criteria.length > 0) 
        ? a.criteria.map(c => `<tr><td class="text-secondary small" style="width:40%">${c.desc}</td><td class="fw-bold small">${c.val}</td></tr>`).join('') 
        : `<tr><td class="text-muted small">Non spécifié</td></tr>`;

    // 2. Codes EAN & Trade (Affichage Propre)
    let extraInfos = '';
    if(a.eans && a.eans.length > 0) extraInfos += `<div class="mb-2"><span class="badge bg-light text-dark border me-1">EAN</span> <span class="small text-muted">${a.eans.join(', ')}</span></div>`;
    if(a.trade && a.trade.length > 0) extraInfos += `<div class="mb-2"><span class="badge bg-light text-dark border me-1">Ref.</span> <span class="small text-muted">${a.trade.join(', ')}</span></div>`;

    // 3. OEM (Numéros constructeurs)
    let oemHtml = '';
    if(a.oems && a.oems.length > 0) {
        oemHtml = `<div class="mt-3"><h6 class="fw-bold small text-uppercase text-muted border-bottom pb-1">Numéros OEM</h6><div class="small text-muted" style="max-height:100px;overflow-y:auto;">${a.oems.join('<br>')}</div></div>`;
    }

    // 4. Véhicules
    let vehRows = (a.vehicles && a.vehicles.length > 0) 
        ? a.vehicles.map(v => `<li class="list-group-item px-0 py-1 d-flex justify-content-between"><span>${v.name}</span><span class="badge bg-light text-dark border">${v.year||''}</span></li>`).join('') 
        : `<li class="list-group-item text-muted fst-italic">Non spécifié</li>`;

    return `
    <div class="list-group-item p-3 border-bottom action-hover-effect">
        <div class="d-flex align-items-start justify-content-between flex-wrap gap-3">
            <div class="d-flex align-items-start gap-3" style="flex: 1; min-width: 280px;">
                <div class="position-relative bg-white border rounded p-1 d-flex align-items-center justify-content-center" style="width:80px; height:80px;">
                    ${a.img ? `<img src="${a.img}" class="img-fluid" onclick="window.open('${a.fullImg || a.img}', '_blank')" style="cursor:zoom-in">` : '<i class="fa-solid fa-image text-muted fs-4"></i>'}
                </div>
                <div>
                    <h6 class="mb-1 fw-bold text-dark">${a.brand} <span class="text-muted small">${a.ref}</span></h6>
                    <div class="text-secondary small mb-2 text-truncate" style="max-width:250px;">${a.name}</div>
                    <button class="btn btn-link btn-sm p-0 text-decoration-none small fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#details-${index}"><i class="fa-solid fa-plus-circle"></i> Fiche Technique & Auto</button>
                </div>
            </div>
            <div class="d-flex align-items-center gap-3 justify-content-end ms-auto" style="min-width: 180px;">${priceHtml} ${btnHtml}</div>
        </div>
        <div class="collapse mt-3" id="details-${index}">
            <div class="card border-0 bg-light rounded-3">
                <div class="card-header bg-transparent border-bottom-0 p-2">
                    <ul class="nav nav-pills nav-fill card-header-tabs" role="tablist">
                        <li class="nav-item"><button class="nav-link active py-1 small" data-bs-toggle="tab" data-bs-target="#tab-tech-${index}">Caractéristiques</button></li>
                        <li class="nav-item"><button class="nav-link py-1 small" data-bs-toggle="tab" data-bs-target="#tab-veh-${index}">Compatibilité (${a.vehicles ? a.vehicles.length : 0})</button></li>
                    </ul>
                </div>
                <div class="card-body p-3 pt-2">
                    <div class="tab-content">
                        <div class="tab-pane fade show active" id="tab-tech-${index}">
                            ${extraInfos}
                            <table class="table table-sm table-borderless mb-0 small"><tbody>${critHtml}</tbody></table>
                            ${oemHtml}
                        </div>
                        <div class="tab-pane fade" id="tab-veh-${index}"><ul class="list-group list-group-flush small" style="max-height: 300px; overflow-y: auto;">${vehRows}</ul></div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// 5. MODALE PRIX (Même affichage enrichi)
async function showTecDocOffers(oeCode) {
    event.stopPropagation();
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    document.getElementById('modal-title').textContent = `Compatibilités pour OE ${oeCode}`;
    const mb = document.getElementById('modal-body');
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br><span class="text-muted mt-2 d-block">Recherche TecDoc & Prix...</span></div>';
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        
        if(!data.articles || data.articles.length === 0) { 
            mb.innerHTML = '<div class="alert alert-warning m-4">Aucune pièce compatible trouvée.</div>'; return; 
        }

        const articlesWithPrice = await Promise.all(data.articles.map(async (a) => {
            if(!a.ref || a.ref === "Inconnu") return { ...a, materom: { found: false } };
            try { 
                const priceData = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json();
                return { ...a, materom: priceData }; 
            } catch { return { ...a, materom: { found: false } }; }
        }));

        let html = `<div class="list-group list-group-flush">`;
        html += articlesWithPrice.map((a, index) => buildRichRow(a, 'modal-' + index)).join('');
        html += `</div>`;
        mb.innerHTML = html;

    } catch(e) { mb.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`; }
}

function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    fetch(`${API_BASE}/levam/TreeFullGet?ssd=${ssd}&link=${link}&lang=fr`).then(r => r.json()).then(d => renderTree(d.tree)).catch(e => console.error(e));
}
function renderTree(tree) {
    const cont = document.getElementById('tree-container');
    cont.innerHTML = '';
    if(!tree) return;
    const accordion = document.createElement('div');
    accordion.className = 'accordion accordion-flush';
    accordion.id = 'treeAccordion';
    let idx = 0;
    Object.keys(tree).forEach(key => {
        idx++;
        const cat = tree[key];
        const item = document.createElement('div');
        item.className = 'accordion-item';
        const header = `<h2 class="accordion-header"><button class="accordion-button collapsed fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#c${idx}">${cat.name || key}</button></h2>`;
        let bodyContent = '';
        if(cat.branch) {
            Object.values(cat.branch).forEach(sub => {
                if(sub.nodes) sub.nodes.forEach(n => { bodyContent += `<button class="list-group-item list-group-item-action small py-2" onclick="loadParts('${n.node_id}', '${n.node_name}')">${n.node_name}</button>`; });
            });
        }
        const body = `<div id="c${idx}" class="accordion-collapse collapse" data-bs-parent="#treeAccordion"><div class="accordion-body p-0"><div class="list-group list-group-flush">${bodyContent}</div></div></div>`;
        item.innerHTML = header + body;
        accordion.appendChild(item);
    });
    cont.appendChild(accordion);
}
function loadParts(nodeId, nodeName) {
    document.getElementById('category-title').textContent = nodeName;
    const grid = document.getElementById('parts-grid');
    grid.innerHTML = '<div class="text-center py-5">Chargement...</div>';
    document.getElementById('exploded-view-container').classList.add('d-none');
    fetch(`${API_BASE}/levam/PartsGet?ssd=${currentVehicleData.ssd}&link=${currentVehicleData.link}&group=${nodeId}&lang=fr`).then(r => r.json()).then(d => {
        if(d.parts && d.parts.image && d.parts.image.length) renderExplodedView(d.parts.image[0], d.parts.coord);
        const parts = (d.parts?.parts || []).map(p => ({ pos: p.standart?.part_number, ref: p.standart?.part_code, name: p.standart?.part_name }));
        renderPartsList(parts);
    }).catch(e => grid.innerHTML = 'Erreur');
}
function renderExplodedView(url, coords) {
    const c = document.getElementById('exploded-view-container');
    c.classList.remove('d-none');
    const w = document.getElementById('exploded-wrapper');
    w.innerHTML = '';
    if(panzoomInstance) { panzoomInstance.dispose(); panzoomInstance = null; }
    const img = document.createElement('img'); img.src = url; w.appendChild(img);
    if(coords && coords[0]) coords[0].forEach(co => { 
        const m = document.createElement('div'); m.className = 'exploded-marker'; m.textContent = co.name; m.dataset.pos = co.name; m.style.top = co['margin-top']+'%'; m.style.left = co['margin-left']+'%'; m.onclick = (e) => { e.stopPropagation(); highlightItem(co.name); }; w.appendChild(m); 
    });
    img.onload = () => { panzoomInstance = panzoom(w, { maxZoom: 5, minZoom: 0.5, bounds: true, boundsPadding: 0.1 }); };
}
window.zoomIn = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 1.25); };
window.zoomOut = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 0.8); };
window.zoomReset = () => { if(panzoomInstance) { panzoomInstance.moveTo(0,0); panzoomInstance.zoomAbs(0,0,1); } };
function renderPartsList(parts) {
    const grid = document.getElementById('parts-grid');
    if(!parts.length) { grid.innerHTML = '<div class="alert alert-info">Aucune pièce.</div>'; return; }
    grid.innerHTML = parts.map(p => `
        <div id="row-${p.pos}" class="part-card card mb-2 p-2 shadow-sm" onclick="highlightItem('${p.pos}')" style="cursor:pointer">
            <div class="d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center"><div class="fw-bold bg-light p-2 rounded text-danger me-3" style="min-width:40px; text-align:center;">${p.pos || '-'}</div><div><h6 class="mb-0 fw-bold text-dark">${p.name}</h6><small class="text-muted">OE: ${p.ref}</small></div></div>
                <button class="btn btn-sm btn-outline-danger fw-bold shadow-sm" onclick="showTecDocOffers('${p.ref}')"><i class="fa-solid fa-tags"></i> Voir Offres</button>
            </div>
        </div>`).join('');
}
function highlightItem(posId) {
    if(!posId) return;
    document.querySelectorAll('.part-card').forEach(e => e.classList.remove('active-part'));
    document.querySelectorAll('.exploded-marker').forEach(e => e.classList.remove('active'));
    const m = document.querySelector(`.exploded-marker[data-pos="${posId}"]`); if(m) m.classList.add('active');
    const r = document.querySelectorAll(`[id="row-${posId}"]`); r.forEach(row => { row.classList.add('active-part'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}
function sendToPrestashop(ref) {
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}
