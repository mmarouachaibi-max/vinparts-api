const API_BASE = "/api"; 
let currentVehicleData = null;
let panzoomInstance = null;

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
    initRefSearch();
    initGlobalSearch();
});

// ... (Fonctions initVinSearch, initManualLevamSearch, initGlobalSearch, initRefSearch, startCatalog, etc. -> GARDEZ LES MÊMES QUE PRÉCÉDEMMENT, ELLES FONCTIONNENT)
// JE COLLE ICI UNIQUEMENT LA NOUVELLE LOGIQUE D'AFFICHAGE "PRO" ET LA MODALE

// Fonction principale d'ouverture de la modale PRO
async function showTecDocOffers(oeCode) {
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    const mb = document.getElementById('modal-body');
    const mt = document.getElementById('modal-title');
    
    mt.textContent = `Résultats pour ${oeCode}`;
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger" style="width: 3rem; height: 3rem;"></div><br><span class="text-muted mt-3 d-block fw-bold">Analyse technique en cours...</span></div>';
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        
        if(!data.articles || data.articles.length === 0) { 
            mb.innerHTML = '<div class="alert alert-warning m-4">Aucune pièce compatible trouvée.</div>'; return; 
        }

        // Récupération des prix
        const articles = await Promise.all(data.articles.map(async (a) => {
            try { 
                const p = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json();
                return { ...a, price: p }; 
            } catch { return { ...a, price: { found: false } }; }
        }));

        // Construction du HTML Pro
        mb.innerHTML = `<div class="container-fluid p-0">${articles.map(renderProProductCard).join('<hr class="my-4">')}</div>`;

    } catch(e) { mb.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`; }
}

// LE TEMPLATE HTML "DISTRIAUTO STYLE"
function renderProProductCard(a) {
    // 1. Gestion Prix & Stock
    let priceBlock = `
        <div class="bg-light p-3 rounded text-center h-100 d-flex flex-column justify-content-center">
            <div class="text-muted small mb-2">Indisponible</div>
            <button class="btn btn-secondary btn-sm w-100" disabled>Rupture</button>
        </div>`;

    if (a.price && a.price.found && a.price.price > 0) {
        const price = (a.price.currency === 'RON' ? (a.price.price * 0.19) : a.price.price).toFixed(2);
        const inStock = a.price.stock > 0;
        const color = inStock ? 'success' : 'danger';
        const txt = inStock ? 'En stock' : 'Sur commande';
        
        priceBlock = `
        <div class="border p-3 rounded shadow-sm h-100" style="background-color:#f8f9fa;">
            <div class="fs-2 fw-bold text-danger text-center mb-0">${price} CHF</div>
            <div class="text-${color} fw-bold text-center mb-3 small"><i class="fa-solid fa-circle"></i> ${txt}</div>
            
            <div class="d-grid gap-2">
                ${inStock ? `<button class="btn btn-danger fw-bold py-2" onclick="sendToPrestashop('${a.ref}')"><i class="fa-solid fa-cart-shopping me-2"></i> AJOUTER</button>` : ''}
                <button class="btn btn-outline-dark btn-sm" onclick="alert('Devis demandé')">Demander un devis</button>
            </div>
            
            <div class="mt-3 pt-3 border-top text-muted small">
                <div class="d-flex justify-content-between"><span>Expédition :</span> <strong>24/48h</strong></div>
                <div class="d-flex justify-content-between"><span>Garantie :</span> <strong>2 ans</strong></div>
            </div>
        </div>`;
    }

    // 2. Caractéristiques (Tableau strié)
    let specs = a.criteria.slice(0, 8).map(c => `
        <tr>
            <td class="text-muted py-1" style="width:40%">${c.desc}</td>
            <td class="fw-bold py-1 text-dark">${c.val}</td>
        </tr>`).join('');

    // 3. Contenu du Kit (Images + Liste)
    let kitContent = '';
    if (a.components && a.components.length > 0) {
        kitContent = `
        <div class="mt-4">
            <h6 class="fw-bold border-bottom pb-2 mb-3">Contenu de l'ensemble</h6>
            <div class="row g-3">
                ${a.components.map(c => `
                    <div class="col-md-6">
                        <div class="d-flex align-items-center border rounded p-2 bg-white">
                            <div class="me-3 text-secondary fw-bold">x${c.qty}</div>
                            <div>
                                <div class="small fw-bold text-dark">${c.name}</div>
                                <div class="small text-muted">Réf: ${c.ref}</div>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
        </div>`;
    }

    // 4. Véhicules (Liste scrollable)
    let vehList = (a.vehicles && a.vehicles.length > 0) 
        ? `<ul class="list-group list-group-flush small" style="max-height: 200px; overflow-y: auto;">${a.vehicles.map(v => `<li class="list-group-item py-1">${v.name} <span class="text-muted ms-1">${v.year}</span></li>`).join('')}</ul>`
        : '<div class="text-muted fst-italic p-2">Non spécifié</div>';

    // 5. Structure Globale
    return `
    <div class="product-pro-card py-2">
        <!-- Header : Marque & Ref -->
        <div class="d-flex align-items-center mb-3">
            <h4 class="mb-0 fw-bold text-primary me-3">${a.brand}</h4>
            <span class="badge bg-dark fs-6">${a.ref}</span>
            <div class="ms-auto small text-muted">EAN: ${a.eans.join(', ') || 'N/A'}</div>
        </div>

        <div class="row g-4">
            <!-- COL 1 : IMAGE -->
            <div class="col-md-4 text-center">
                <div class="bg-white border rounded p-3 d-flex align-items-center justify-content-center" style="height: 250px;">
                    ${a.img ? `<img src="${a.img}" class="img-fluid" style="max-height: 100%; max-width: 100%; cursor: zoom-in;" onclick="window.open('${a.fullImg || a.img}')">` : '<i class="fa-solid fa-image fa-3x text-light"></i>'}
                </div>
            </div>

            <!-- COL 2 : SPECS -->
            <div class="col-md-5">
                <h6 class="fw-bold text-uppercase small text-muted mb-2">Caractéristiques</h6>
                <table class="table table-sm table-striped small mb-0"><tbody>${specs}</tbody></table>
                
                ${a.oems && a.oems.length > 0 ? `
                <div class="mt-3">
                    <span class="badge bg-light text-secondary border">OEM</span>
                    <span class="small text-muted ms-1 text-truncate d-inline-block" style="max-width: 250px; vertical-align: middle;">${a.oems.slice(0,3).join(', ')}...</span>
                </div>` : ''}
            </div>

            <!-- COL 3 : ACHAT -->
            <div class="col-md-3">
                ${priceBlock}
            </div>
        </div>

        <!-- SECTION BASSE : ONGLETS -->
        <div class="mt-4">
            <ul class="nav nav-tabs" role="tablist">
                ${a.components && a.components.length > 0 ? `<li class="nav-item"><a class="nav-link active fw-bold small" data-bs-toggle="tab" href="#tab-kit-${a.id}">Contenu du Kit</a></li>` : ''}
                <li class="nav-item"><a class="nav-link ${(!a.components || a.components.length===0)?'active':''} fw-bold small" data-bs-toggle="tab" href="#tab-veh-${a.id}">Véhicules Compatibles</a></li>
            </ul>
            
            <div class="tab-content border border-top-0 p-3 bg-light">
                ${a.components && a.components.length > 0 ? `<div class="tab-pane fade show active" id="tab-kit-${a.id}">${kitContent}</div>` : ''}
                <div class="tab-pane fade ${(!a.components || a.components.length===0)?'show active':''}" id="tab-veh-${a.id}">
                    ${vehList}
                </div>
            </div>
        </div>
    </div>`;
}

// ... (Gardez les fonctions initVinSearch, initManualLevamSearch, renderPartsList, sendToPrestashop telles quelles) ...
// Je remets juste les fonctions essentielles pour que le copier-coller fonctionne du premier coup

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
        showTecDocOffers(term); // On utilise directement la modale PRO pour le résultat
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
        showTecDocOffers(term);
    };
    btn.addEventListener('click', triggerSearch);
    document.getElementById('ref-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') triggerSearch(); });
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
