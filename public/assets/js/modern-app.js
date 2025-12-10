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

// 2. RECHERCHE MANUELLE (CORRIGÉE : VERSION INCONNUE)
function initManualLevamSearch() {
    // 1. Marques
    fetch(`${API_BASE}/levam/CatalogsListGet?type=0&lang=fr`).then(r => r.json()).then(d => {
        const sel = document.getElementById('brandSelect');
        if(sel && d.catalogs) {
            d.catalogs.sort((a,b) => a.name.localeCompare(b.name));
            d.catalogs.forEach(c => sel.add(new Option(c.name, c.catalog_code)));
        }
    });

    // 2. Modèles
    const bs = document.getElementById('brandSelect');
    if(bs) bs.addEventListener('change', function() {
        const cat = this.value;
        const ms = document.getElementById('modelSelect');
        const vs = document.getElementById('vehicleSelect');
        
        // Reset propre
        ms.innerHTML = '<option value="">-- Choisir le Modèle --</option>'; ms.disabled = true;
        vs.innerHTML = '<option value="">-- Choisir la Version --</option>'; vs.disabled = true;
        
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

    // 3. Versions (CORRECTION ICI)
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
                
                // Remise à zéro du select avec un placeholder clair
                vs.innerHTML = '<option value="">-- Choisir la Version --</option>';
                
                if(mData.modifications && mData.modifications.length > 0) {
                    const seen = new Set();

                    mData.modifications.forEach(mod => {
                        // CONSTRUCTION DU NOM
                        let parts = [];
                        if(mod.name && mod.name !== "Standard") parts.push(mod.name);
                        if(mod.engine) parts.push(mod.engine);
                        if(mod.power_hp) parts.push(mod.power_hp + " CV");
                        else if(mod.power) parts.push(mod.power);
                        if(mod.body_type) parts.push(mod.body_type);
                        if(mod.prod_year) parts.push(`[${mod.prod_year}]`);
                        
                        let label = parts.join(" ").trim();
                        
                        // CORRECTION : Si label vide, on met "Standard" au lieu de "Inconnue"
                        if(!label) label = "Version Standard";

                        if (!seen.has(label)) {
                            seen.add(label);
                            // On vérifie que le lien existe bien
                            const linkValue = mod.link || mod.id; // Fallback sur ID si link vide
                            const opt = new Option(label, linkValue);
                            opt.dataset.ssd = ssd;
                            vs.add(opt);
                        }
                    });
                    vs.disabled = false;
                } else {
                    // Si aucune modification n'est renvoyée mais que le SSD est bon, 
                    // on propose une option "Standard" par défaut qui utilise les paramètres actuels
                    // Note: Le lien est parfois vide ici, on utilisera le SSD global
                    const opt = new Option("Version Standard", "default");
                    opt.dataset.ssd = ssd;
                    vs.add(opt);
                    vs.disabled = false;
                }
            } else { vs.innerHTML = '<option>Erreur (Pas de SSD)</option>'; }
        } catch(e) { console.error(e); vs.innerHTML = '<option>Erreur réseau</option>'; }
    });

    // 4. Lancement Catalogue
    const vs = document.getElementById('vehicleSelect');
    if(vs) vs.addEventListener('change', function() {
        // On récupère le SSD de l'option sélectionnée (ou global si manquant)
        const selectedOption = this.options[this.selectedIndex];
        const ssd = selectedOption.dataset.ssd;
        let link = this.value;
        
        // Si le lien est "default" (cas fallback), on utilise une chaîne vide ou le modèle
        if(link === "default") link = "";

        const brand = document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text;
        const model = document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text;
        const version = selectedOption.text;
        
        // Sécurité
        if(!ssd) {
            alert("Erreur de sélection : Impossible de récupérer l'identifiant SSD du véhicule.");
            return;
        }

        // On lance
        startCatalog(ssd, link, `${brand} ${model}`, version);
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

// CATALOGUE LEVAM
function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    
    // Si link est vide (cas "Standard"), l'API Levam utilise parfois juste le SSD
    // On passe les params proprement
    const url = `${API_BASE}/levam/TreeFullGet?ssd=${encodeURIComponent(ssd)}&lang=fr` + (link ? `&link=${encodeURIComponent(link)}` : "");

    fetch(url)
        .then(r => r.json())
        .then(d => renderTree(d.tree))
        .catch(e => {
            console.error(e);
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
        const header = `<h2 class="accordion-header"><button class="accordion-button collapsed fw-bold" type="button" data-bs-toggle="collapse" data-bs-target="#c${idx}">${cat.name || key}</button></h2>`;
        
        let bodyContent = '';
        if(cat.branch) {
            Object.values(cat.branch).forEach(sub => {
                if(sub.nodes) sub.nodes.forEach(n => { 
                    bodyContent += `<button class="list-group-item list-group-item-action small py-2" onclick="loadParts('${n.node_id}', '${n.node_name}')">${n.node_name}</button>`; 
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
    grid.innerHTML = '<div class="text-center py-5">Chargement...</div>';
    document.getElementById('exploded-view-container').classList.add('d-none');
    
    // Appel Parts
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

// 5. MODALE PRIX PRO (DISTRIAUTO STYLE)
async function showTecDocOffers(oeCode) {
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    const mb = document.getElementById('modal-body');
    const mt = document.getElementById('modal-title');
    mt.textContent = `Résultats pour ${oeCode}`;
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br><span class="text-muted">Recherche...</span></div>';
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const data = await res.json();
        if(!data.articles || data.articles.length === 0) { 
            mb.innerHTML = '<div class="alert alert-warning m-4">Aucune pièce compatible.</div>'; return; 
        }

        const articles = await Promise.all(data.articles.map(async (a) => {
            try { 
                const p = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(a.ref)}&brand=${encodeURIComponent(a.brand)}`)).json();
                return { ...a, price: p }; 
            } catch { return { ...a, price: { found: false } }; }
        }));

        mb.innerHTML = `<div class="container-fluid p-0">${articles.map(renderProProductCard).join('<hr class="my-4">')}</div>`;
    } catch(e) { mb.innerHTML = `<div class="alert alert-danger m-4">${e.message}</div>`; }
}

function renderProProductCard(a) {
    let priceBlock = `<div class="bg-light p-3 rounded text-center h-100 d-flex flex-column justify-content-center"><div class="text-muted small">Indisponible</div></div>`;
    if (a.price && a.price.found && a.price.price > 0) {
        const price = (a.price.currency === 'RON' ? (a.price.price * 0.19) : a.price.price).toFixed(2);
        const inStock = a.price.stock > 0;
        priceBlock = `
        <div class="border p-3 rounded shadow-sm h-100 bg-white">
            <div class="fs-2 fw-bold text-danger text-center">${price} CHF</div>
            <div class="text-${inStock?'success':'danger'} fw-bold text-center mb-3 small"><i class="fa-solid fa-circle"></i> ${inStock?'En stock':'Sur commande'}</div>
            <div class="d-grid gap-2">${inStock ? `<button class="btn btn-danger fw-bold" onclick="sendToPrestashop('${a.ref}')">AJOUTER</button>` : ''}</div>
        </div>`;
    }

    let specs = a.criteria.slice(0, 8).map(c => `<tr><td class="text-muted py-1" style="width:40%">${c.desc}</td><td class="fw-bold py-1 text-dark">${c.val}</td></tr>`).join('');
    
    let kitContent = '';
    if (a.components && a.components.length > 0) {
        kitContent = `<div class="mt-3"><h6 class="fw-bold border-bottom pb-2">Contenu du kit</h6><div class="row g-2">${a.components.map(c => `<div class="col-6 small border p-2 bg-light"><b>x${c.qty}</b> ${c.name} (${c.ref})</div>`).join('')}</div></div>`;
    }

    let vehList = (a.vehicles && a.vehicles.length > 0) ? `<ul class="list-group list-group-flush small" style="max-height: 200px; overflow-y: auto;">${a.vehicles.map(v => `<li class="list-group-item py-1">${v.name} <span class="text-muted">${v.year}</span></li>`).join('')}</ul>` : '<div class="text-muted p-2">Non spécifié</div>';

    return `
    <div class="py-2">
        <div class="d-flex align-items-center mb-3"><h4 class="mb-0 fw-bold text-primary me-3">${a.brand}</h4><span class="badge bg-dark">${a.ref}</span></div>
        <div class="row g-4">
            <div class="col-md-4 text-center"><div class="bg-white border rounded p-3 d-flex align-items-center justify-content-center" style="height: 200px;">${a.img ? `<img src="${a.img}" class="img-fluid" style="max-height:100%;cursor:zoom-in" onclick="window.open('${a.fullImg||a.img}')">` : '<i class="fa-solid fa-image fa-3x text-light"></i>'}</div></div>
            <div class="col-md-5"><h6 class="fw-bold small text-muted">Caractéristiques</h6><table class="table table-sm table-striped small mb-0"><tbody>${specs}</tbody></table>${a.oems ? `<div class="mt-2 small text-muted">OEM: ${a.oems.slice(0,3).join(', ')}...</div>` : ''}</div>
            <div class="col-md-3">${priceBlock}</div>
        </div>
        <div class="mt-4"><ul class="nav nav-tabs"><li class="nav-item"><a class="nav-link active small fw-bold" data-bs-toggle="tab" href="#tab-veh-${a.id}">Véhicules</a></li>${a.components && a.components.length ? `<li class="nav-item"><a class="nav-link small fw-bold" data-bs-toggle="tab" href="#tab-kit-${a.id}">Kit</a></li>`:''}</ul><div class="tab-content border border-top-0 p-3 bg-light"><div class="tab-pane fade show active" id="tab-veh-${a.id}">${vehList}</div>${a.components && a.components.length ? `<div class="tab-pane fade" id="tab-kit-${a.id}">${kitContent}</div>`:''}</div></div>
    </div>`;
}

function sendToPrestashop(ref) {
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}
