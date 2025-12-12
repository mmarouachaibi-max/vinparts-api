const API_BASE = "https://vinparts-api.onrender.com/api"; 
let currentVehicleData = null;
let panzoomInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
    initRefSearch();
    initGlobalSearch();
});

// UI HELPERS
function setStatus(msg, type = "info") {
    const el = document.getElementById("search-status");
    if (el) el.innerHTML = `<div class="alert alert-${type} mt-3 fw-bold shadow-sm border-0 small"><i class="fa-solid fa-circle-info me-2"></i>${msg}</div>`;
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
        if (!vin) return setStatus("Veuillez entrer un VIN valide.", "warning");
        setStatus("Identification du véhicule...", "info");
        try {
            const res = await fetch(`${API_BASE}/levam/VinFind?vin=${encodeURIComponent(vin)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            if (!data.client?.ssd) throw new Error("Véhicule introuvable.");
            startCatalog(data.client.ssd, (data.models && data.models[0]?.link) || data.client.modification, `${data.client.mark} ${data.client.model}`, `VIN: ${data.client.vin}`);
        } catch (e) { setStatus("Erreur: " + e.message, "danger"); }
    });
}

// 2. RECHERCHE MANUELLE
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
        ms.innerHTML = '<option value="">-- Modèle --</option>'; ms.disabled = true;
        vs.innerHTML = '<option value="">-- Version --</option>'; vs.disabled = true;
        
        if(!cat) return;
        
        fetch(`${API_BASE}/levam/ModelsListGet2?catalog_code=${cat}&lang=fr`).then(r => r.json()).then(d => {
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
                vs.innerHTML = '<option value="">-- Version --</option>';
                
                if(mData.modifications && mData.modifications.length > 0) {
                    const seen = new Set();
                    mData.modifications.forEach(mod => {
                        let parts = [];
                        if(mod.name && mod.name !== "Standard") parts.push(mod.name);
                        if(mod.engine) parts.push(mod.engine);
                        if(mod.power_hp) parts.push(mod.power_hp + " CV");
                        else if(mod.power) parts.push(mod.power);
                        if(mod.body_type) parts.push(mod.body_type);
                        if(mod.prod_year) parts.push(`[${mod.prod_year}]`);
                        
                        let label = parts.join(" ").trim() || "Version Standard";
                        if (!seen.has(label)) {
                            seen.add(label);
                            const opt = new Option(label, mod.link || mod.id);
                            opt.dataset.ssd = ssd;
                            vs.add(opt);
                        }
                    });
                    vs.disabled = false;
                } else {
                    const opt = new Option("Version Standard", "default");
                    opt.dataset.ssd = ssd;
                    vs.add(opt);
                    vs.disabled = false;
                }
            } else { vs.innerHTML = '<option>Erreur (Pas de SSD)</option>'; }
        } catch(e) { console.error(e); vs.innerHTML = '<option>Erreur réseau</option>'; }
    });

    const vs = document.getElementById('vehicleSelect');
    if(vs) vs.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const ssd = selectedOption.dataset.ssd;
        let link = this.value === "default" ? "" : this.value;
        const brand = document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text;
        const model = document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text;
        
        if(!ssd) { alert("Erreur identifiant véhicule."); return; }
        startCatalog(ssd, link, `${brand} ${model}`, selectedOption.text);
    });
}

// 3. RECHERCHE GLOBALE
function initGlobalSearch() {
    const desktopInput = document.getElementById('global-search-input');
    const btn = document.getElementById('btn-global-search');
    const doSearch = async (term) => {
        if (!term || term.length < 2) { alert("2 caractères min."); return; }
        showTecDocOffers(term);
    };
    if(btn) btn.addEventListener('click', () => doSearch(desktopInput.value));
    if(desktopInput) desktopInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') doSearch(desktopInput.value); });
}

function initRefSearch() {
    // Peut être supprimé si non utilisé, mais gardé pour compatibilité
}

// 4. CATALOGUE & ARBRE
function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    const url = `${API_BASE}/levam/TreeFullGet?ssd=${encodeURIComponent(ssd)}&lang=fr` + (link ? `&link=${encodeURIComponent(link)}` : "");

    fetch(url).then(r => r.json()).then(d => renderTree(d.tree)).catch(e => {
        document.getElementById('tree-container').innerHTML = '<div class="alert alert-danger">Erreur chargement arbre.</div>';
    });
}

function renderTree(tree) {
    const cont = document.getElementById('tree-container');
    cont.innerHTML = '';
    if(!tree) { cont.innerHTML = '<div class="p-3">Aucune catégorie.</div>'; return; }
    
    const accordion = document.createElement('div');
    accordion.className = 'accordion accordion-flush';
    accordion.id = 'treeAccordion';
    let idx = 0;
    
    Object.keys(tree).forEach(key => {
        idx++;
        const cat = tree[key];
        const item = document.createElement('div');
        item.className = 'accordion-item';
        const header = `<h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#c${idx}">${cat.name || key}</button></h2>`;
        
        let bodyContent = '';
        if(cat.branch) {
            Object.values(cat.branch).forEach(sub => {
                if(sub.nodes) sub.nodes.forEach(n => { 
                    bodyContent += `<button class="list-group-item list-group-item-action small py-2 border-0 ps-4" onclick="loadParts('${n.node_id}', '${n.node_name}')"><i class="fa-solid fa-angle-right text-muted me-2"></i>${n.node_name}</button>`; 
                });
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
    grid.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div></div>';
    document.getElementById('exploded-view-container').classList.add('d-none');
    
    const url = `${API_BASE}/levam/PartsGet?ssd=${currentVehicleData.ssd}&group=${nodeId}&lang=fr` + (currentVehicleData.link ? `&link=${currentVehicleData.link}` : "");

    fetch(url).then(r => r.json()).then(d => {
        if(d.parts && d.parts.image && d.parts.image.length) renderExplodedView(d.parts.image[0], d.parts.coord);
        const parts = (d.parts?.parts || []).map(p => ({ pos: p.standart?.part_number, ref: p.standart?.part_code, name: p.standart?.part_name }));
        renderPartsList(parts);
    }).catch(e => grid.innerHTML = 'Erreur chargement pièces');
}

function renderExplodedView(url, coords) {
    const c = document.getElementById('exploded-view-container');
    c.classList.remove('d-none');
    const w = document.getElementById('exploded-wrapper');
    w.innerHTML = '';
    if(panzoomInstance) { panzoomInstance.dispose(); panzoomInstance = null; }
    
    const img = document.createElement('img'); 
    img.src = url; 
    w.appendChild(img);
    
    if(coords && coords[0]) coords[0].forEach(co => { 
        const m = document.createElement('div'); 
        m.className = 'exploded-marker'; 
        m.textContent = co.name; 
        m.dataset.pos = co.name; 
        m.style.top = co['margin-top']+'%'; 
        m.style.left = co['margin-left']+'%'; 
        m.onclick = (e) => { e.stopPropagation(); highlightItem(co.name); }; 
        w.appendChild(m); 
    });
    
    img.onload = () => { 
        panzoomInstance = panzoom(w, { maxZoom: 5, minZoom: 0.5, bounds: true, boundsPadding: 0.1 }); 
    };
}

window.zoomIn = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 1.25); };
window.zoomOut = () => { if(panzoomInstance) panzoomInstance.smoothZoom(0, 0, 0.8); };
window.zoomReset = () => { if(panzoomInstance) { panzoomInstance.moveTo(0,0); panzoomInstance.zoomAbs(0,0,1); } };

function renderPartsList(parts) {
    const grid = document.getElementById('parts-grid');
    if(!parts.length) { grid.innerHTML = '<div class="alert alert-light border">Aucune pièce listée pour cette catégorie.</div>'; return; }
    
    grid.innerHTML = parts.map(p => `
        <div id="row-${p.pos}" class="part-card mb-2 p-2 shadow-sm d-flex justify-content-between align-items-center" onclick="highlightItem('${p.pos}')" style="cursor:pointer">
            <div class="d-flex align-items-center">
                <div class="fw-bold bg-light p-2 rounded text-danger me-3 border" style="min-width:40px; text-align:center;">${p.pos || '-'}</div>
                <div><h6 class="mb-0 fw-bold text-dark">${p.name}</h6><small class="text-muted">OE: ${p.ref}</small></div>
            </div>
            <button class="btn btn-sm btn-outline-danger fw-bold" onclick="showTecDocOffers('${p.ref}')"><i class="fa-solid fa-tags"></i> PRIX</button>
        </div>`).join('');
}

function highlightItem(posId) {
    if(!posId) return;
    document.querySelectorAll('.part-card').forEach(e => e.classList.remove('active-part'));
    document.querySelectorAll('.exploded-marker').forEach(e => e.classList.remove('active'));
    
    const m = document.querySelector(`.exploded-marker[data-pos="${posId}"]`); 
    if(m) m.classList.add('active');
    
    const r = document.querySelectorAll(`[id="row-${posId}"]`); 
    r.forEach(row => { 
        row.classList.add('active-part'); 
        row.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
    });
}

// 5. AFFICHAGE MODAL PRODUIT (C'est ICI que tout se joue)
async function showTecDocOffers(oeCode) {
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    const mb = document.getElementById('modal-body');
    const mt = document.getElementById('modal-title');
    mt.textContent = `Résultats pour OEM: ${oeCode}`;
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br><span class="text-muted mt-2">Recherche des équivalences et prix...</span></div>';
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        if(!data.articles || data.articles.length === 0) { 
            mb.innerHTML = '<div class="alert alert-warning m-4">Aucune pièce compatible trouvée dans le catalogue Aftermarket.</div>'; 
            return; 
        }

        // On récupère les prix en parallèle pour aller vite
        const articles = await Promise.all(data.articles.map(async (a) => {
            try { 
                const p = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json();
                return { ...a, price: p }; 
            } catch { return { ...a, price: { found: false } }; }
        }));

        mb.innerHTML = `<div class="container-fluid p-3" style="background:#f4f6f9;">${articles.map(renderProProductCard).join('')}</div>`;
    } catch(e) { mb.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`; }
}

// 6. LA NOUVELLE CARTE PRODUIT "PRO" AVEC ONGLETS
function renderProProductCard(a) {
    // 1. Calcul du Prix et Stock
    let priceBlock = `<div class="bg-light p-3 rounded text-center h-100 d-flex flex-column justify-content-center"><div class="text-muted small">Prix sur demande</div></div>`;
    
    if (a.price && a.price.found && a.price.price > 0) {
        const finalPrice = (a.price.currency === 'RON' ? (a.price.price * 0.19) : a.price.price).toFixed(2);
        const inStock = a.price.stock > 0;
        
        priceBlock = `
        <div class="h-100 d-flex flex-column justify-content-between">
            <div class="text-end">
                <div class="price-tag">${finalPrice} CHF</div>
                <div class="stock-badge ${inStock ? 'text-success-pro' : 'text-warning-pro'} mb-3">
                    <i class="fa-solid fa-circle fa-xs"></i> ${inStock ? 'En Stock' : 'Sur commande (2-3j)'}
                </div>
            </div>
            <button class="btn btn-danger w-100 fw-bold py-2 shadow-sm" onclick="sendToPrestashop('${a.ref}')">
                <i class="fa-solid fa-cart-shopping me-2"></i> AJOUTER
            </button>
        </div>`;
    }

    // 2. Caractéristiques Techniques
    let specsRows = a.criteria.slice(0, 6).map(c => `
        <tr>
            <td class="specs-label">${c.desc}</td>
            <td class="specs-value text-truncate" style="max-width: 150px;" title="${c.val}">${c.val}</td>
        </tr>
    `).join('');

    // 3. Liste des Véhicules Compatibles
    let vehListHTML = '<div class="p-3 text-muted small">Aucune info compatibilité.</div>';
    if (a.vehicles && a.vehicles.length > 0) {
        vehListHTML = `<div class="vehicle-list-container">`;
        a.vehicles.forEach(v => {
            vehListHTML += `
            <div class="vehicle-item d-flex justify-content-between">
                <span><i class="fa-solid fa-car-side text-muted me-2"></i> ${v.name}</span>
                <span class="badge bg-light text-dark border">${v.year}</span>
            </div>`;
        });
        vehListHTML += `</div>`;
    }

    // ID Unique pour les onglets
    const uniqueId = `prod-${a.id}-${Math.random().toString(36).substr(2, 9)}`;
    
    return `
    <div class="product-card">
        <div class="row g-0">
            <!-- COLONNE GAUCHE : IMAGE -->
            <div class="col-md-3 text-center mb-3 mb-md-0">
                <div class="product-img-container rounded border mb-2">
                     ${a.img ? `<img src="${a.img}" alt="${a.name}" onclick="window.open('${a.fullImg||a.img}')" style="cursor:zoom-in">` : '<i class="fa-solid fa-image fa-3x text-muted"></i>'}
                </div>
                <div class="brand-badge">${a.brand}</div>
                <div class="ref-badge mt-1">${a.ref}</div>
            </div>

            <!-- COLONNE MILIEU : INFOS -->
            <div class="col-md-6 px-md-4 d-flex flex-column">
                <h5 class="fw-bold mb-3 text-dark">${a.name}</h5>
                
                <table class="table table-sm specs-table mb-3">
                    <tbody>${specsRows}</tbody>
                </table>

                <div class="mt-auto">
                    <ul class="nav nav-tabs nav-tabs-pro mb-0" id="tabs-${uniqueId}" role="tablist">
                        <li class="nav-item">
                            <button class="nav-link active small py-1" data-bs-toggle="tab" data-bs-target="#tab-veh-${uniqueId}">
                                Véhicules Compatibles (${a.vehicles ? a.vehicles.length : 0})
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link small py-1" data-bs-toggle="tab" data-bs-target="#tab-oem-${uniqueId}">
                                OEM
                            </button>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- COLONNE DROITE : PRIX -->
            <div class="col-md-3 border-start ps-md-3">
                ${priceBlock}
            </div>
        </div>

        <!-- CONTENU DES ONGLETS -->
        <div class="tab-content border-start border-end border-bottom bg-white rounded-bottom">
            <div class="tab-pane fade show active" id="tab-veh-${uniqueId}">
                ${vehListHTML}
            </div>
            <div class="tab-pane fade p-3" id="tab-oem-${uniqueId}">
                <div class="small text-muted text-break">${a.oems ? a.oems.join(', ') : 'Aucun code OEM disponible'}</div>
            </div>
        </div>
    </div>`;
}

function sendToPrestashop(ref) {
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}
