const API_BASE = "http://localhost:3000/api"; 
let currentVehicleData = null;
let panzoomInstance = null;

// --- DONNÉES DES CATÉGORIES (CORRIGÉES AVEC TA CAPTURE) ---
const categoriesData = [
    // Ligne 1
    { name: "Huiles", img: "huiles.png", subs: ["Huile moteur", "Huile boîte de vitesses", "Huile hydraulique"] },
    { name: "Filtres", img: "filtres.png", subs: ["Filtre à huile", "Filtre à air", "Filtre à carburant", "Filtre habitacle"] },
    { name: "Freins", img: "freins.png", subs: ["Plaquettes de frein", "Disques de frein", "Étriers", "ABS"] },
    { name: "Liquides", img: "liquides.png", subs: ["Liquide de refroidissement", "Liquide de frein", "Lave-glace"] },
    
    // Ligne 2
    { name: "Essuie-glaces", img: "essuie-glaces.png", subs: ["Balais d'essuie-glace", "Moteurs", "Bras"] },
    { name: "Suspension", img: "suspension.png", subs: ["Amortisseurs", "Bras de liaison", "Ressorts"] },
    { name: "Distribution", img: "distribution.png", subs: ["Kit distribution", "Pompe à eau", "Courroies"] },
    { name: "Allumage", img: "allumages.jpg", subs: ["Bougies d'allumage", "Bobines", "Préchauffage"] },
    
    // Ligne 3
    { name: "Alimentation", img: "alimentation.png", subs: ["Injecteurs", "Pompe à carburant", "Joints"] },
    { name: "Moteur", img: "moteurs.png", subs: ["Supports moteur", "Soupapes", "Joints de culasse"] },
    { name: "Turbo", img: "turbo.png", subs: ["Turbocompresseur", "Durites", "Intercooler"] },
    { name: "Refroidissement", img: "refroidissement.png", subs: ["Radiateur", "Thermostat", "Ventilateur"] },
    
    // Ligne 4 (Images mappées intelligemment selon tes fichiers dispos)
    { name: "EGR", img: "systeme EGR.png", subs: ["Vanne EGR", "Refroidisseur EGR"] },
    { name: "Échappement", img: "echappement.png", subs: ["Sonde lambda", "Catalyseur", "Silencieux"] },
    { name: "Climatisation", img: "refroidissement.png", subs: ["Compresseur", "Condenseur"] },
    { name: "Embrayage", img: "freins.png", subs: ["Kit d'embrayage", "Volant moteur"] },
    
    // Ligne 5
    { name: "Électricité", img: "allumages.jpg", subs: ["Batterie", "Alternateur", "Démarreur"] },
    { name: "Direction", img: "suspension.png", subs: ["Rotules", "Crémaillère", "Pompe de direction"] },
    { name: "Cardan", img: "suspension.png", subs: ["Cardans", "Soufflets", "Joints"] },
    { name: "Boîte de vitesses", img: "huiles.png", subs: ["Vidange", "Supports de boîte"] },
    
    // Ligne 6
    { name: "Carrosserie", img: "essuie-glaces.png", subs: ["Rétroviseurs", "Vérins", "Pare-chocs"] },
    { name: "Fixations", img: "moteurs.png", subs: ["Vis", "Clips", "Rivets"] },
    { name: "Habitacle", img: "essuie-glaces.png", subs: ["Lève-vitre", "Comodos"] },
    { name: "Performance", img: "turbo.png", subs: ["Filtres sport", "Freins sport"] }
];

document.addEventListener("DOMContentLoaded", () => {
    initVinSearch();
    initManualLevamSearch();
    initGlobalSearch();
    initHomeCategories(); 
    initQuickNav();       
});

// --- UI HELPERS ---
function initHomeCategories() {
    const container = document.getElementById('home-categories-container');
    if(!container) return;

    container.innerHTML = categoriesData.map(cat => `
        <div class="col-6 col-md-4 col-lg-3">
            <div class="category-card" onclick="triggerCategorySearch('${cat.name}')">
                <div class="category-img-wrapper">
                    <img src="assets/img/categories/${cat.img}" alt="${cat.name}" class="category-img">
                </div>
                <div class="category-body">
                    <div class="category-title">${cat.name}</div>
                    <ul class="subcategory-list">
                        ${cat.subs.slice(0, 3).map(s => `<li>• ${s}</li>`).join('')}
                    </ul>
                    <div class="view-more-link">Voir tout <i class="fa-solid fa-arrow-right"></i></div>
                </div>
            </div>
        </div>
    `).join('');
}

function initQuickNav() {
    const container = document.getElementById('quick-nav-container');
    if(!container) return;

    container.innerHTML = categoriesData.map(cat => `
        <div class="dropdown">
            <button class="btn btn-cat-nav dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                ${cat.name}
            </button>
            <ul class="dropdown-menu">
                <li class="px-3 py-2 text-center bg-light border-bottom">
                    <small class="fw-bold text-uppercase text-muted">${cat.name}</small>
                </li>
                ${cat.subs.map(sub => `
                    <li><a class="dropdown-item" href="#" onclick="triggerCategorySearch('${sub}')">${sub}</a></li>
                `).join('')}
            </ul>
        </div>
    `).join('');
}

function triggerCategorySearch(term) {
    document.getElementById('global-search-input').value = term;
    showTecDocOffers(term);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- RESTE DU CODE (FONCTIONS DE RECHERCHE) ---
function setStatus(msg, type = "info") {
    const el = document.getElementById("search-status");
    if (el) el.innerHTML = `<div class="alert alert-${type} mt-3 fw-bold shadow-sm border-0 small"><i class="fa-solid fa-circle-info me-2"></i>${msg}</div>`;
}

function updateGarage(title, subtitle) {
    document.getElementById('section-garage').classList.remove('d-none');
    document.getElementById('section-search').classList.add('d-none');
    document.getElementById('home-categories-section').classList.add('d-none');
    document.getElementById('section-catalog').classList.remove('d-none');
    document.getElementById('tree-column').classList.remove('d-none');
    document.getElementById('parts-column').className = "col-lg-9";
    document.getElementById('garage-vehicle-name').textContent = title;
    document.getElementById('garage-vehicle-details').textContent = subtitle;
}

window.resetSearch = function() { location.reload(); }

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
    // ... (Code select marques/modèles standard) ...
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
                    models.forEach(m => { const opt = new Option(m.model, m.model); opt.dataset.family = family.family_name || famKey; ms.add(opt); });
                });
                ms.disabled = false;
            } else if (d.models) { d.models.forEach(m => ms.add(new Option(m.model, m.model))); ms.disabled = false; }
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
                if(mData.modifications) {
                    const seen = new Set();
                    mData.modifications.forEach(mod => {
                        let label = [mod.name, mod.engine, mod.power_hp ? mod.power_hp+" CV" : ""].join(" ").trim() || "Standard";
                        if (!seen.has(label)) { seen.add(label); const opt = new Option(label, mod.link || mod.id); opt.dataset.ssd = ssd; vs.add(opt); }
                    });
                    vs.disabled = false;
                } else { const opt = new Option("Standard", "default"); opt.dataset.ssd = ssd; vs.add(opt); vs.disabled = false; }
            } else { vs.innerHTML = '<option>Erreur</option>'; }
        } catch(e) { console.error(e); }
    });
    const vs = document.getElementById('vehicleSelect');
    if(vs) vs.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        const ssd = selectedOption.dataset.ssd;
        let link = this.value === "default" ? "" : this.value;
        const brand = document.getElementById('brandSelect').options[document.getElementById('brandSelect').selectedIndex].text;
        const model = document.getElementById('modelSelect').options[document.getElementById('modelSelect').selectedIndex].text;
        if(!ssd) return;
        startCatalog(ssd, link, `${brand} ${model}`, selectedOption.text);
    });
}

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

function startCatalog(ssd, link, title, subtitle) {
    currentVehicleData = { ssd, link };
    updateGarage(title, subtitle);
    const url = `${API_BASE}/levam/TreeFullGet?ssd=${encodeURIComponent(ssd)}&lang=fr` + (link ? `&link=${encodeURIComponent(link)}` : "");
    fetch(url).then(r => r.json()).then(d => renderTree(d.tree)).catch(e => document.getElementById('tree-container').innerHTML = '<div class="alert alert-danger">Erreur</div>');
}

function renderTree(tree) {
    const cont = document.getElementById('tree-container');
    cont.innerHTML = '';
    if(!tree) { cont.innerHTML = '<div class="p-3">Vide</div>'; return; }
    const accordion = document.createElement('div'); accordion.className = 'accordion accordion-flush'; accordion.id = 'treeAccordion';
    let idx = 0;
    Object.keys(tree).forEach(key => {
        idx++; const cat = tree[key];
        const item = document.createElement('div'); item.className = 'accordion-item';
        const header = `<h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#c${idx}">${cat.name || key}</button></h2>`;
        let bodyContent = '';
        if(cat.branch) {
            Object.values(cat.branch).forEach(sub => {
                if(sub.nodes) sub.nodes.forEach(n => { bodyContent += `<button class="list-group-item list-group-item-action small py-2 border-0 ps-4" onclick="loadParts('${n.node_id}', '${n.node_name}')">${n.node_name}</button>`; });
            });
        }
        const body = `<div id="c${idx}" class="accordion-collapse collapse" data-bs-parent="#treeAccordion"><div class="accordion-body p-0"><div class="list-group list-group-flush">${bodyContent}</div></div></div>`;
        item.innerHTML = header + body; accordion.appendChild(item);
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
    }).catch(e => grid.innerHTML = 'Erreur');
}

function renderExplodedView(url, coords) {
    const c = document.getElementById('exploded-view-container'); c.classList.remove('d-none');
    const w = document.getElementById('exploded-wrapper'); w.innerHTML = '';
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
    if(!parts.length) { grid.innerHTML = '<div class="alert alert-light border">Aucune pièce.</div>'; return; }
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
    const m = document.querySelector(`.exploded-marker[data-pos="${posId}"]`); if(m) m.classList.add('active');
    const r = document.querySelectorAll(`[id="row-${posId}"]`); r.forEach(row => { row.classList.add('active-part'); row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
}

// --- AFFICHAGE MODAL ---
async function showTecDocOffers(oeCode) {
    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    const mb = document.getElementById('modal-body');
    const mt = document.getElementById('modal-title');
    const displayOE = oeCode.replace(/[^a-zA-Z0-9]/g, " ").trim();
    
    mt.innerHTML = `Résultats pour <span class="text-danger">${displayOE}</span>`;
    mb.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div><br><span class="text-muted mt-2">Recherche Origine & Adaptable...</span></div>';
    modal.show();

    try {
        const resTecDoc = await fetch(`${API_BASE}/tecdoc/search-oe?oe=${encodeURIComponent(oeCode)}`);
        const dataTecDoc = await resTecDoc.json();
        let allArticles = [];

        try {
            const cleanOE = oeCode.replace(/[^a-zA-Z0-9]/g, "");
            const resPriceOEM = await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(cleanOE)}`);
            const priceOEM = await resPriceOEM.json();
            if (priceOEM.success && priceOEM.found) {
                allArticles.push({ id: "OEM-"+cleanOE, ref: displayOE, brand: "CONSTRUCTEUR / OE", name: "Pièce d'Origine", img: null, fullImg: null, criteria: [], vehicles: [], oems: [displayOE], price: priceOEM, isOEM: true });
            }
        } catch (err) {}

        if (dataTecDoc.articles && dataTecDoc.articles.length > 0) {
            const aftermarket = await Promise.all(dataTecDoc.articles.map(async (a) => {
                try { 
                    const cleanRef = a.ref.replace(/[^a-zA-Z0-9]/g, "");
                    const p = await (await fetch(`${API_BASE}/materom/check?ref=${encodeURIComponent(cleanRef)}&brand=${encodeURIComponent(a.brand)}`)).json();
                    return { ...a, price: p, isOEM: false }; 
                } catch { return { ...a, price: { found: false }, isOEM: false }; }
            }));
            allArticles = allArticles.concat(aftermarket);
        }

        if(allArticles.length === 0) { mb.innerHTML = '<div class="alert alert-warning m-4">Aucune pièce.</div>'; return; }
        mb.innerHTML = `<div class="container-fluid p-3" style="background:#f4f6f9;">${allArticles.map(renderProProductCard).join('')}</div>`;

    } catch(e) { mb.innerHTML = `<div class="alert alert-danger m-4">Erreur</div>`; }
}

function renderProProductCard(a) {
    let priceBlock = `<div class="bg-light p-3 text-center"><small class="text-muted">Prix indisponible</small></div>`;
    if (a.price && a.price.found && a.price.price > 0) {
        const finalPrice = (a.price.currency === 'RON' ? (a.price.price * 0.19) : a.price.price).toFixed(2);
        const inStock = a.price.stock > 0;
        priceBlock = `<div class="h-100 d-flex flex-column justify-content-between"><div class="text-end"><div class="price-tag">${finalPrice} CHF</div><div class="stock-badge ${inStock?'text-success-pro':'text-warning-pro'}"><i class="fa-solid fa-circle fa-xs"></i> ${inStock?'En Stock':'Sur commande'}</div></div><button class="btn btn-danger w-100 fw-bold py-2 shadow-sm" onclick="sendToPrestashop('${a.ref}')"><i class="fa-solid fa-cart-shopping me-2"></i> AJOUTER</button></div>`;
    }

    let imageHTML = a.img ? `<img src="${a.img}" onclick="window.open('${a.fullImg||a.img}')" style="cursor:zoom-in">` : (a.isOEM ? `<div class="text-primary d-flex flex-column align-items-center justify-content-center h-100"><i class="fa-solid fa-certificate fa-3x mb-2"></i><small class="fw-bold">ORIGINE</small></div>` : `<div class="text-muted d-flex flex-column align-items-center justify-content-center h-100"><i class="fa-solid fa-image fa-3x mb-2"></i><small>Pas d'image</small></div>`);
    
    const uniqueId = `prod-${String(a.id).replace(/[^a-z0-9]/gi,'')}-${Math.random().toString(36).substr(2, 5)}`;
    
    return `
    <div class="product-card ${a.isOEM ? 'border-primary border-2 shadow' : 'border-1'}" style="position:relative; overflow:hidden;">
        ${a.isOEM ? '<div class="position-absolute top-0 start-0 w-100 bg-primary text-white text-center fw-bold small py-1">⭐ PIÈCE D\'ORIGINE ⭐</div>' : ''}
        <div class="row g-0 ${a.isOEM ? 'mt-4' : ''}">
            <div class="col-md-3 text-center mb-3 mb-md-0"><div class="product-img-container rounded border mb-2">${imageHTML}</div><div class="brand-badge ${a.isOEM?'text-primary':''}">${a.brand}</div><div class="ref-badge mt-1">${a.ref}</div></div>
            <div class="col-md-6 px-md-4 d-flex flex-column"><h5 class="fw-bold mb-3 text-dark text-start">${a.name}</h5><div class="mt-auto"><ul class="nav nav-tabs nav-tabs-pro mb-0"><li class="nav-item"><button class="nav-link active small py-1" data-bs-toggle="tab" data-bs-target="#tab-specs-${uniqueId}">Détails</button></li></ul></div></div>
            <div class="col-md-3 border-start ps-md-3">${priceBlock}</div>
        </div>
        <div class="tab-content border-start border-end border-bottom bg-white rounded-bottom"><div class="tab-pane fade show active p-3" id="tab-specs-${uniqueId}">
            <table class="table table-striped table-bordered small mb-0"><tbody>${(a.criteria||[]).map(c => `<tr><td style="width:40%">${c.desc}</td><td class="fw-bold">${c.val}</td></tr>`).join('') || '<tr><td>Aucun détail</td></tr>'}</tbody></table>
        </div></div>
    </div>`;
}

function sendToPrestashop(ref) {
    const url = `https://vinparts.ch/index.php?controller=search&s=${encodeURIComponent(ref)}`;
    window.open(url, '_blank');
}
