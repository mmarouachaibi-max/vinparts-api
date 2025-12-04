require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 1. CONFIGURATION
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 2. CONSTANTES API
const TECDOC_ENDPOINT = "https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint";
const LEVAM_BASE_URL = "https://api.levam.net/oem/v1";

// MATEROM
const MATEROM_URL = "https://api.materom.ro/api/v1";
const MATEROM_TOKEN = "1816|HOdgVM1HTevulaN9u1RMEEqRgeIUd6hvgUQckIIz";

// 3. HELPERS

function cleanRef(ref) {
    if (!ref) return "";
    return String(ref).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function callLevam(endpoint, params = {}) {
    try {
        const finalParams = { api_key: process.env.LEVAM_API_KEY, ...params };
        const res = await axios.get(`${LEVAM_BASE_URL}${endpoint}`, { params: finalParams });
        return res.data;
    } catch (e) {
        console.error(`Erreur Levam ${endpoint}:`, e.message);
        throw e;
    }
}

async function tecdocHttpPost(payload) {
    try {
        const res = await axios.post(TECDOC_ENDPOINT, payload, { headers: { "X-Api-Key": process.env.TECDOC_API_KEY } });
        return res.data;
    } catch (e) {
        console.error("Erreur TecDoc:", e.message);
        throw e;
    }
}

async function callMaterom(endpoint, params = {}) {
    try {
        // console.log(`[Materom] Request: ${endpoint}`, params);
        const res = await axios.get(`${MATEROM_URL}${endpoint}`, {
            headers: { 
                "Authorization": `Bearer ${MATEROM_TOKEN}`,
                "Accept": "application/json"
            },
            params: params
        });
        return res.data;
    } catch (e) {
        console.error(`[Materom] Erreur:`, e.response?.data || e.message);
        return []; // Retourne tableau vide en cas d'erreur pour ne pas planter
    }
}

// 4. ROUTES API - LEVAM (Structure)

app.get("/api/levam/vin", async (req, res) => { try { res.json(await callLevam("/VinFind", { vin: req.query.vin })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/catalogs", async (req, res) => { try { res.json(await callLevam("/CatalogsListGet", {})); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/models", async (req, res) => { try { res.json(await callLevam("/ModelsListGet2", req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/vehicle-params", async (req, res) => { try { res.json(await callLevam("/VehicleParamsSet", req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/vehicle-mods", async (req, res) => { try { res.json(await callLevam("/VehicleModificationsGet", req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/tree", async (req, res) => { try { res.json(await callLevam("/TreeFullGet", { ssd: req.query.ssd, link: req.query.link, lang: "fr" })); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/levam/parts", async (req, res) => { try { res.json(await callLevam("/PartsGet", { ssd: req.query.ssd, link: req.query.link, group: req.query.group, lang: "fr" })); } catch (e) { res.status(500).json({ error: e.message }); } });

// 5. ROUTES API - TECDOC (Structure de secours)
app.get("/api/tecdoc/brands", async (req, res) => { try { const r = await tecdocHttpPost({ getLinkageTargets: { provider: process.env.TECDOC_PROVIDER_ID, linkageTargetCountry: "CH", lang: "fr", linkageTargetType: "P", perPage: 0, includeMfrFacets: true } }); res.json({ success: true, brands: (r.mfrFacets?.counts || []).map(m => ({ id: m.id, name: m.name })) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/tecdoc/models", async (req, res) => { try { const r = await tecdocHttpPost({ getLinkageTargets: { provider: process.env.TECDOC_PROVIDER_ID, linkageTargetCountry: "CH", lang: "fr", linkageTargetType: "P", mfrIds: parseInt(req.query.mfrId), perPage: 0, includeVehicleModelSeriesFacets: true } }); res.json({ success: true, models: (r.vehicleModelSeriesFacets?.counts || []).map(m => ({ id: m.id, name: m.name })) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/tecdoc/vehicles", async (req, res) => { try { const r = await tecdocHttpPost({ getLinkageTargets: { provider: process.env.TECDOC_PROVIDER_ID, linkageTargetCountry: "CH", lang: "fr", linkageTargetType: "P", mfrIds: parseInt(req.query.mfrId), vehicleModelSeriesIds: parseInt(req.query.modelSeriesId), perPage: 100 } }); res.json({ success: true, vehicles: (r.linkageTargets || []).map(v => ({ linkageTargetId: v.linkageTargetId, description: v.description, beginYearMonth: v.beginYearMonth, endYearMonth: v.endYearMonth })) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/tecdoc/assembly-groups", async (req, res) => { try { const r = await tecdocHttpPost({ getArticles: { provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", assemblyGroupFacetOptions: { enabled: true, assemblyGroupType: "P", includeCompleteTree: true }, linkageTargetType: "P", linkageTargetId: parseInt(req.query.vehicleId) } }); res.json({ success: true, groups: (r.assemblyGroupFacets?.counts || []).map(g => ({ assemblyGroupNodeId: g.assemblyGroupNodeId, assemblyGroupName: g.assemblyGroupName, parentNodeId: g.parentNodeId })) }); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get("/api/tecdoc/parts", async (req, res) => { try { const r = await tecdocHttpPost({ getArticles: { provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", perPage: 20, assemblyGroupNodeIds: parseInt(req.query.groupId), linkageTargetType: "P", linkageTargetId: parseInt(req.query.vehicleId), includeAll: true } }); res.json({ success: true, articles: r.articles || [] }); } catch (e) { res.status(500).json({ error: e.message }); } });

// 6. ROUTE MATEROM (PRIX & STOCK)
app.get("/api/materom/check", async (req, res) => {
    const term = req.query.ref; // Référence pièce
    const brandFilter = req.query.brand; // Marque (ex: BOSCH)

    if (!term) return res.json({ success: false, error: "Term manquant" });

    try {
        // Recherche globale Materom
        const results = await callMaterom("/part_search/global", { term: term });
        
        if (!results || !Array.isArray(results) || results.length === 0) {
            console.log(`[Materom] Rien trouvé pour ${term}`);
            return res.json({ success: false, found: false });
        }

        // Filtrage Intelligent : Materom renvoie plein de marques pour la même ref
        // On essaie de trouver celle qui correspond à la marque TecDoc
        let match = null;
        
        if (brandFilter) {
            // On cherche la marque exacte (ex: "ATE" dans "ATE - TEVES")
            match = results.find(item => {
                const mName = item.article?.manufacturer?.name?.toLowerCase() || "";
                return mName.includes(brandFilter.toLowerCase());
            });
        }

        // Si pas de match exact sur la marque, on prend le premier résultat disponible
        if (!match) match = results[0];

        const art = match.article;
        if (!art || !art.pricing) {
            return res.json({ success: false, found: false });
        }

        // Calcul du stock
        let totalStock = 0;
        if (art.pricing.available_plants) {
            art.pricing.available_plants.forEach(plant => {
                totalStock += (plant.maximum_order_quantity || 0);
            });
        } else if (art.pricing.delivery === 'stoc') {
            totalStock = 10; // "En stock" sans précision
        }

        res.json({
            success: true,
            found: true,
            price: art.pricing.price,
            currency: art.pricing.currency, // RON ou EUR
            stock: totalStock,
            delivery: art.pricing.delivery || "Sur commande",
            sku: art.number,
            brand: art.manufacturer.name
        });

    } catch (e) {
        console.error("[Materom Route Error]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// 7. ROUTE SEARCH OE (TECDOC HYBRIDE)
app.get("/api/tecdoc/search-oe", async (req, res) => {
    const rawOe = (req.query.oe || "").trim();
    const cleanOeNumber = cleanRef(rawOe);

    if (!cleanOeNumber || cleanOeNumber.length < 3) return res.json({ success: false, error: "Ref courte" });

    try {
        // Recherche large (99)
        const body = await tecdocHttpPost({ 
            getArticles: { provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", perPage: 50, page: 1, searchQuery: rawOe, searchType: 99, includeAll: true } 
        });
        
        let articles = body.articles || [];

        // Filtre strict JS
        const validArticles = articles.filter(a => {
            const articleRefClean = cleanRef(a.articleNumber);
            if (articleRefClean === cleanOeNumber) return true;
            if (a.oemNumbers && a.oemNumbers.length > 0) return a.oemNumbers.some(o => cleanRef(o.articleNumber) === cleanOeNumber);
            return false;
        });

        // Fallback
        let finalList = validArticles;
        if (finalList.length === 0 && articles.length > 0) finalList = articles.slice(0, 5).map(a => { a.isFuzzy = true; return a; });

        const simplified = finalList.map(a => ({
            id: a.legacyArticleId || a.articleId,
            ref: a.articleNumber,
            brand: a.mfrName,
            name: a.genericArticles?.[0]?.genericArticleDescription || "Pièce Auto",
            img: a.images?.[0]?.imageURL200,
            isFuzzy: a.isFuzzy || false
        }));
        
        res.json({ success: true, articles: simplified });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. CATCH ALL & START
app.get(/(.*)/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`>>> SERVEUR PRET : http://localhost:${PORT}`));