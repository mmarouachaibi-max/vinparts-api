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

// IMPORTANT : Dossier "public"
app.use(express.static(path.join(__dirname, "public")));

const TECDOC_ENDPOINT = "https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint";
const LEVAM_BASE_URL = "https://api.levam.net/oem/v1";
const MATEROM_URL = "https://api.materom.ro/api/v1";

// --- UTILITAIRES ---

function cleanRef(ref) {
    if (!ref) return "";
    // On garde uniquement les chiffres et les lettres, en majuscule
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
        console.error("❌ Erreur Appel TecDoc:", e.message);
        throw e;
    }
}

async function callMaterom(endpoint, params = {}) {
    try {
        const token = process.env.MATEROM_TOKEN; 
        if (!token) return [];

        const res = await axios.get(`${MATEROM_URL}${endpoint}`, {
            headers: { 
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json"
            },
            params: params,
            timeout: 5000 
        });
        return res.data;
    } catch (e) { 
        console.error("⚠️ Erreur Materom:", e.message);
        return []; 
    }
}

function mapArticleData(a) {
    let img = null;
    let fullImg = null;
    let imagesList = a.images || [];
    if (!Array.isArray(imagesList) && imagesList.array) imagesList = imagesList.array;

    if (imagesList.length > 0) {
        img = imagesList[0].imageURL200;
        fullImg = imagesList[0].imageURL800 || imagesList[0].imageURL400;
    }

    let rawLinkages = a.articleLinkages || a.linkages || [];
    if (!Array.isArray(rawLinkages) && rawLinkages.array) rawLinkages = rawLinkages.array;

    return {
        id: a.legacyArticleId || a.articleId,
        ref: a.articleNumber,
        brand: a.mfrName,
        name: a.genericArticles?.[0]?.genericArticleDescription || "Pièce Auto",
        img: img,
        fullImg: fullImg,
        oems: (a.oemNumbers || []).map(o => `${o.mfrName}: ${o.articleNumber}`),
        vehicles: rawLinkages.slice(0, 100).map(v => ({
            name: v.linkageTargetDescription,
            year: v.linkageTargetBeginYearMonth ? String(v.linkageTargetBeginYearMonth).substring(0,4) : ""
        })),
        criteria: (a.articleCriteria || []).map(c => ({
            desc: c.criteriaDescription,
            val: c.formattedValue
        }))
    };
}

// --- ROUTES ---

app.get("/api/levam/:action", async (req, res) => {
    try {
        const r = await axios.get(`${LEVAM_BASE_URL}/${req.params.action}`, { 
            params: { api_key: process.env.LEVAM_API_KEY, ...req.query } 
        });
        res.json(r.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/materom/check", async (req, res) => {
    const term = req.query.ref;
    const brandFilter = req.query.brand;
    if (!term) return res.json({ success: false });
    
    try {
        const r = await callMaterom("/part_search/global", { term: term });
        if (!r || !r.length) return res.json({ success: false });
        
        let match = r[0];
        if (brandFilter) {
            const exact = r.find(i => i.article?.manufacturer?.name?.toLowerCase().includes(brandFilter.toLowerCase()));
            if(exact) match = exact;
        }

        if (!match || !match.article || !match.article.pricing) return res.json({ success: false });

        let stock = 0;
        if (match.article.pricing.available_plants) match.article.pricing.available_plants.forEach(p => stock += (p.maximum_order_quantity || 0));
        else if (match.article.pricing.delivery === 'stoc') stock = 10;

        res.json({ success: true, found: true, price: match.article.pricing.price, currency: match.article.pricing.currency, stock: stock });
    } catch (e) { res.json({ success: false }); }
});

// --- C'EST ICI QUE J'AI CORRIGÉ LE PROBLÈME ---
app.get("/api/tecdoc/search-oe", async (req, res) => {
    const rawOe = (req.query.oe || "").trim();
    const cleanOeNumber = cleanRef(rawOe); // Enlève les espaces: "21207599307"
    
    console.log(`🔍 Recherche TecDoc pour OE: "${rawOe}" -> Nettoyé: "${cleanOeNumber}"`);

    if (cleanOeNumber.length < 2) return res.json({ success: false, msg: "Trop court" });

    try {
        const payload = { 
            getArticles: { 
                provider: process.env.TECDOC_PROVIDER_ID, 
                articleCountry: "CH", 
                lang: "fr", 
                perPage: 50, 
                page: 1, 
                searchQuery: cleanOeNumber, // On envoie le numéro sans espace
                searchType: 10, // 10 = Any Number (plus large)
                includeAll: true,
                includeArticleCriteria: true,
                includeImages: true,
                includeArticleLinkages: true,
                linkageTargetType: "P" 
            } 
        };

        const body = await tecdocHttpPost(payload);
        let articles = body.articles || [];

        console.log(`✅ TecDoc a trouvé ${articles.length} articles.`);

        // J'AI SUPPRIMÉ LE FILTRE STRICT ICI.
        // On renvoie tout ce que TecDoc trouve.
        
        res.json({ 
            success: true, 
            articles: articles.map(a => mapArticleData(a)) 
        });

    } catch (e) { 
        console.error("❌ Erreur Route:", e.message);
        res.status(500).json({ error: e.message }); 
    }
});

app.get(/(.*)/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`>>> SERVEUR PRET sur ${PORT}`));
