require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TECDOC_ENDPOINT = "https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint";
const LEVAM_BASE_URL = "https://api.levam.net/oem/v1";
const MATEROM_URL = "https://api.materom.ro/api/v1";

function cleanRef(ref) {
    if (!ref) return "";
    return String(ref).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function tecdocHttpPost(payload) {
    try {
        const res = await axios.post(TECDOC_ENDPOINT, payload, { 
            headers: { "X-Api-Key": process.env.TECDOC_API_KEY },
            timeout: 25000 
        });
        return res.data;
    } catch (e) {
        console.error("❌ Erreur TecDoc:", e.message);
        throw e;
    }
}

async function callMaterom(endpoint, params = {}) {
    try {
        const res = await axios.get(`${MATEROM_URL}${endpoint}`, {
            headers: { 
                "Authorization": `Bearer ${process.env.MATEROM_TOKEN || "1816|HOdgVM1HTevulaN9u1RMEEqRgeIUd6hvgUQckIIz"}`,
                "Accept": "application/json"
            },
            params: params,
            timeout: 5000 
        });
        return res.data;
    } catch (e) { return []; }
}

// --- MAPPING ENRICHI (PLUS DE DÉTAILS) ---
function mapArticleData(a) {
    let rawLinkages = a.articleLinkages || a.linkages || [];
    if (!Array.isArray(rawLinkages) && rawLinkages.array) rawLinkages = rawLinkages.array;

    const ref = a.articleNumber || a.articleNo || "Inconnu";
    const brand = a.mfrName || a.brandName || "Marque Inconnue";
    const name = a.genericArticles?.[0]?.genericArticleDescription || a.articleName || "Pièce Auto";

    // Images
    let img = null;
    let fullImg = null;
    let imagesList = a.images || [];
    if (a.images && a.images.array) imagesList = a.images.array;

    if (imagesList.length > 0) {
        img = imagesList[0].imageURL200;
        fullImg = imagesList[0].imageURL800 || imagesList[0].imageURL400;
    } else if (a.thumbnails && (a.thumbnails.length > 0 || a.thumbnails.array)) {
        let thumbs = a.thumbnails.array || a.thumbnails;
        if(thumbs.length > 0) {
            img = thumbs[0].imageURL200;
            fullImg = thumbs[0].imageURL800;
        }
    }

    // Critères
    let rawCriteria = a.articleCriteria || [];
    if (!Array.isArray(rawCriteria) && rawCriteria.array) rawCriteria = rawCriteria.array;

    // OEM
    let rawOems = a.oemNumbers || [];
    if (!Array.isArray(rawOems) && rawOems.array) rawOems = rawOems.array;
    
    // EAN
    let eans = [];
    if (a.gtins && a.gtins.array) eans = a.gtins.array;
    else if (Array.isArray(a.gtins)) eans = a.gtins;
    else if (a.eanNumber) eans = [a.eanNumber];

    // Trade Numbers (Ref courtes, anciennes ref...) - NOUVEAU
    let rawTrade = a.tradeNumbers || [];
    if (!Array.isArray(rawTrade) && rawTrade.array) rawTrade = rawTrade.array;

    return {
        id: a.legacyArticleId || a.articleId,
        ref: ref,
        brand: brand,
        name: name,
        img: img,
        fullImg: fullImg,
        
        oems: rawOems.map(o => `${o.mfrName}: ${o.articleNumber}`),
        eans: eans,
        trade: rawTrade.map(t => t.tradeNumber), // Ajout des Trade Numbers
        
        criteria: rawCriteria.map(c => ({
            desc: c.criteriaDescription,
            val: c.formattedValue
        })),

        vehicles: rawLinkages.slice(0, 200).map(v => ({ // Augmenté à 200 véhicules
            name: v.linkageTargetDescription,
            year: v.linkageTargetBeginYearMonth ? String(v.linkageTargetBeginYearMonth).substring(0,4) : ""
        }))
    };
}

// ROUTES

app.get("/api/levam/vin", async (req, res) => { try { const r = await axios.get(`${LEVAM_BASE_URL}/VinFind`, { params: { api_key: process.env.LEVAM_API_KEY, vin: req.query.vin } }); res.json(r.data); } catch (e) { res.status(500).json({ error: e.message }); } });

app.get("/api/levam/:action", async (req, res) => {
    try {
        const action = req.params.action;
        const r = await axios.get(`${LEVAM_BASE_URL}/${action}`, { params: { api_key: process.env.LEVAM_API_KEY, ...req.query } });
        res.json(r.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/materom/check", async (req, res) => {
    const term = req.query.ref;
    const brandFilter = req.query.brand;
    if (!term || term === "undefined") return res.json({ success: false, found: false });
    try {
        const results = await callMaterom("/part_search/global", { term: term });
        if (!results || !Array.isArray(results) || results.length === 0) return res.json({ success: false, found: false });
        let match = null;
        if (brandFilter) match = results.find(i => i.article?.manufacturer?.name?.toLowerCase().includes(brandFilter.toLowerCase()));
        if (!match) match = results[0];
        const art = match.article;
        if (!art || !art.pricing) return res.json({ success: false, found: false });
        let totalStock = 0;
        if (art.pricing.available_plants) art.pricing.available_plants.forEach(p => totalStock += (p.maximum_order_quantity || 0));
        else if (art.pricing.delivery === 'stoc') totalStock = 10;
        res.json({ success: true, found: true, price: art.pricing.price, currency: art.pricing.currency, stock: totalStock, delivery: art.pricing.delivery || "Sur commande", sku: art.number, brand: art.manufacturer.name });
    } catch (e) { res.json({ success: false, found: false }); }
});

app.get("/api/tecdoc/search-oe", async (req, res) => {
    const rawOe = (req.query.oe || "").trim();
    const cleanOeNumber = cleanRef(rawOe);
    if (!cleanOeNumber || cleanOeNumber.length < 2) return res.json({ success: false, error: "Ref courte" });

    try {
        const payload = { 
            getArticles: { 
                provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", perPage: 50, page: 1, searchQuery: cleanOeNumber, searchType: 10, includeAll: true, includeArticleCriteria: true, includeArticleLinkages: true 
            } 
        };
        const body = await tecdocHttpPost(payload);
        let articles = body.articles || [];
        const validArticles = articles.filter(a => {
            const jsonStr = JSON.stringify(a).toUpperCase().replace(/[^A-Z0-9]/g, "");
            return jsonStr.includes(cleanOeNumber);
        });
        const mapped = validArticles.map(a => mapArticleData(a));
        const final = mapped.filter(a => a.ref !== "Inconnu");
        res.json({ success: true, articles: final });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/tecdoc/search-any", async (req, res) => {
    const term = (req.query.term || "").trim();
    const page = parseInt(req.query.page) || 1; 
    try {
        const payload = { 
            getArticles: { provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", perPage: 50, page: page, searchQuery: term, searchType: 99, includeAll: true, includeArticleCriteria: true, includeArticleLinkages: true } 
        };
        const body = await tecdocHttpPost(payload);
        let articles = body.articles || [];
        res.json({ success: true, total: body.totalMatchingArticles || 0, page: page, articles: articles.map(a => mapArticleData(a)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get(/(.*)/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`>>> SERVEUR PRET SUR LE PORT ${PORT}`));
