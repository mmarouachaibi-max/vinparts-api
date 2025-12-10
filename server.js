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

// --- MAPPING PROFESSIONNEL ---
function mapArticleData(a) {
    // Images
    let img = null;
    let imagesList = a.images || (a.images && a.images.array) || [];
    if (!Array.isArray(imagesList) && a.images && a.images.array) imagesList = a.images.array;
    if (imagesList.length > 0) img = imagesList[0].imageURL800 || imagesList[0].imageURL400 || imagesList[0].imageURL200;

    // Critères
    let criteriaList = a.articleCriteria || [];
    if (!Array.isArray(criteriaList) && a.articleCriteria && a.articleCriteria.array) criteriaList = a.articleCriteria.array;

    // Linkages (Véhicules)
    let rawLinkages = a.articleLinkages || a.linkages || [];
    if (!Array.isArray(rawLinkages) && rawLinkages.array) rawLinkages = rawLinkages.array;

    // Parts (Contenu du kit)
    let rawParts = a.articleParts || [];
    if (!Array.isArray(rawParts) && a.articleParts && a.articleParts.array) rawParts = a.articleParts.array;

    return {
        id: a.legacyArticleId || a.articleId,
        ref: a.articleNumber || a.articleNo || "Inconnu",
        brand: a.mfrName || a.brandName || "Marque Inconnue",
        name: a.genericArticles?.[0]?.genericArticleDescription || a.articleName || "Pièce Auto",
        img: img,
        
        // Données complètes
        oems: (a.oemNumbers && a.oemNumbers.array ? a.oemNumbers.array : (a.oemNumbers || [])).map(o => `${o.mfrName}: ${o.articleNumber}`),
        eans: (a.gtins && a.gtins.array ? a.gtins.array : (a.gtins || [])).concat(a.eanNumber ? [a.eanNumber] : []),
        
        criteria: criteriaList.map(c => ({
            desc: c.criteriaDescription,
            val: c.formattedValue
        })),

        vehicles: rawLinkages.slice(0, 200).map(v => ({
            name: v.linkageTargetDescription,
            year: v.linkageTargetBeginYearMonth ? String(v.linkageTargetBeginYearMonth).substring(0,4) : ""
        })),

        // NOUVEAU : Contenu du kit (ex: Disque, Butée...)
        components: rawParts.map(p => ({
            name: p.genericArticleDescription,
            ref: p.articleNumber,
            qty: p.quantity
        }))
    };
}

// ROUTES API

app.get("/api/levam/:action", async (req, res) => {
    try {
        const r = await axios.get(`${LEVAM_BASE_URL}/${req.params.action}`, { params: { api_key: process.env.LEVAM_API_KEY, ...req.query } });
        res.json(r.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/materom/check", async (req, res) => {
    const term = req.query.ref;
    if (!term || term === "undefined") return res.json({ success: false });
    try {
        const r = await callMaterom("/part_search/global", { term: term });
        if (!r || !r.length) return res.json({ success: false });
        
        let match = r[0]; // Simplification : on prend le premier résultat pertinent
        if (req.query.brand) {
            const exact = r.find(i => i.article?.manufacturer?.name?.toLowerCase().includes(req.query.brand.toLowerCase()));
            if(exact) match = exact;
        }

        if (!match || !match.article || !match.article.pricing) return res.json({ success: false });

        let stock = 0;
        if (match.article.pricing.available_plants) match.article.pricing.available_plants.forEach(p => stock += (p.maximum_order_quantity || 0));
        else if (match.article.pricing.delivery === 'stoc') stock = 10;

        res.json({ success: true, found: true, price: match.article.pricing.price, currency: match.article.pricing.currency, stock: stock });
    } catch (e) { res.json({ success: false }); }
});

// SEARCH OE COMPLET
app.get("/api/tecdoc/search-oe", async (req, res) => {
    const rawOe = (req.query.oe || "").trim();
    const cleanOeNumber = cleanRef(rawOe);
    if (cleanOeNumber.length < 2) return res.json({ success: false });

    try {
        // 1. Recherche Large
        const searchPayload = { 
            getArticleDirectSearchAllNumbersWithState: { 
                provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", articleNumber: cleanOeNumber, numberType: 10, searchExact: true 
            } 
        };
        const searchRes = await tecdocHttpPost(searchPayload);
        let foundItems = searchRes.data ? searchRes.data.array : [];
        if (!foundItems.length) return res.json({ success: true, articles: [] });

        // 2. Détails COMPLETS (avec articleParts pour le contenu du kit)
        const relevantIds = foundItems.slice(0, 10).map(i => i.articleId || i.legacyArticleId);
        
        const detailsPayload = {
            getDirectArticlesByIds6: {
                provider: process.env.TECDOC_PROVIDER_ID, articleCountry: "CH", lang: "fr", 
                articleId: { array: relevantIds },
                includeImages: true,
                includeArticleCriteria: true,
                includeArticleLinkages: true,
                includeArticleParts: true, // <--- C'EST CA QUI DONNE LE CONTENU DU KIT
                linkingTargetType: "P"
            }
        };

        const detailsRes = await tecdocHttpPost(detailsPayload);
        let finalRawArticles = (detailsRes.data && detailsRes.data.array) ? detailsRes.data.array : [];

        res.json({ success: true, articles: finalRawArticles.map(a => mapArticleData(a)) });

    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/tecdoc/search-any", async (req, res) => { /* Même logique, simplifiée pour l'exemple */ });

app.get(/(.*)/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`>>> SERVEUR PRET`));
