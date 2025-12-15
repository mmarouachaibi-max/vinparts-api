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

// Middleware
app.use(morgan("dev"));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Configuration API
const TECDOC_URL = "https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint";
const PROVIDER_ID = Number(process.env.TECDOC_PROVIDER_ID); 
const API_KEY = process.env.TECDOC_API_KEY;
const LEVAM_BASE = "https://api.levam.net/oem/v1";
const MATEROM_BASE = "https://api.materom.ro/api/v1";

// --- FONCTION UTILITAIRE ---
function getSafeArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.array && Array.isArray(data.array)) return data.array;
    return [];
}

// --- MAPPING PROFESSIONNEL ---
function mapArticle(a) {
    const images = getSafeArray(a.images);
    let img = null;
    let fullImg = null;
    if (images.length > 0) {
        img = images[0].imageURL200 || images[0].imageURL400;
        fullImg = images[0].imageURL800 || images[0].imageURL400 || img;
    }

    let name = "Pièce Auto";
    const generics = getSafeArray(a.genericArticles);
    if (generics.length > 0 && generics[0].genericArticleDescription) {
        name = generics[0].genericArticleDescription;
    } else if (a.articleName) {
        name = a.articleName;
    }

    const rawVehicles = getSafeArray(a.articleLinkages);
    const vehicles = rawVehicles.slice(0, 100).map(v => ({
        name: v.linkageTargetDescription || "Véhicule non spécifié",
        year: v.linkageTargetBeginYearMonth ? String(v.linkageTargetBeginYearMonth).substring(0,4) : "-"
    }));

    const rawOems = getSafeArray(a.oemNumbers);
    const oems = rawOems.map(o => `${o.mfrName}: ${o.articleNumber}`);

    const rawCriteria = getSafeArray(a.articleCriteria);
    const criteria = rawCriteria.map(c => ({
        desc: c.criteriaDescription,
        val: c.formattedValue
    }));

    return {
        id: a.articleId,
        ref: a.articleNumber,
        brand: a.mfrName,
        name: name,
        img: img,
        fullImg: fullImg,
        vehicles: vehicles,
        criteria: criteria,
        oems: oems,
        price: { found: true, price: 0, stock: 1 } // Prix temporaire
    };
}

// --- APPEL TECDOC GÉNÉRIQUE ---
async function callTecDoc(query, country, type) {
    try {
        const payload = {
            getArticles: {
                provider: PROVIDER_ID,
                articleCountry: country,
                lang: "fr",
                searchQuery: query,
                searchType: type, 
                includeAll: true,
                includeImages: true,
                includeArticleLinkages: true,
                includeArticleParts: true,
                includeGenericArticles: true,
                includeArticleCriteria: true
            }
        };
        const res = await axios.post(TECDOC_URL, payload, { headers: { "X-Api-Key": API_KEY } });
        return res.data.articles || [];
    } catch (e) {
        console.error("Erreur TecDoc:", e.message);
        return [];
    }
}

// --- ROUTES ---

// 1. RECHERCHE INTELLIGENTE (OEM ou MOT CLÉ)
app.get("/api/tecdoc/search-oe", async (req, res) => {
    let rawRef = (req.query.oe || "").trim();
    if (rawRef.length < 2) return res.json({ success: false, msg: "Ref trop courte" });

    console.log(`🔍 RECHERCHE: "${rawRef}"`);

    let articles = [];
    
    // LOGIQUE DE DÉTECTION IMPORTANTE :
    // Si la recherche contient des chiffres -> C'est probablement une référence (Type 10)
    // Si la recherche ne contient QUE des lettres (ex: "Huiles") -> C'est du texte (Type 99)
    const hasNumbers = /\d/.test(rawRef);
    const searchType = hasNumbers ? 10 : 99; 

    console.log(`👉 Type détecté : ${hasNumbers ? "NUMÉRO (Type 10)" : "TEXTE (Type 99 - Mot Clé)"}`);

    // TENTATIVE 1 : SUISSE (CH)
    articles = await callTecDoc(rawRef, "CH", searchType);

    // TENTATIVE 2 : SI VIDE & C'EST UN NUMÉRO -> TENTER ALLEMAGNE (DE)
    // (On ne tente pas l'Allemagne pour les mots clés français comme "Huiles", ça ne marcherait pas)
    if (articles.length === 0 && hasNumbers) {
        console.log(`👉 Tentative 2: DE / Type 10`);
        articles = await callTecDoc(rawRef, "DE", 10);
    }

    if (articles.length > 0) {
        console.log(`✅ SUCCÈS: ${articles.length} articles trouvés.`);
        res.json({ success: true, articles: articles.map(mapArticle) });
    } else {
        console.log(`❌ ECHEC: Aucun résultat.`);
        res.json({ success: false, msg: "Aucune pièce trouvée" });
    }
});

// 2. PROXY LEVAM
app.get("/api/levam/:action", async (req, res) => {
    try {
        const r = await axios.get(`${LEVAM_BASE}/${req.params.action}`, { params: { api_key: process.env.LEVAM_API_KEY, ...req.query } });
        res.json(r.data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. PROXY MATEROM
app.get("/api/materom/check", async (req, res) => {
    try {
        const { ref, brand } = req.query;
        if(!process.env.MATEROM_TOKEN) return res.json({ success: false });

        const r = await axios.get(`${MATEROM_BASE}/part_search/global`, {
            headers: { "Authorization": `Bearer ${process.env.MATEROM_TOKEN}`, "Accept": "application/json" },
            params: { term: ref }
        });
        
        if (r.data && r.data.length > 0) {
            let match = r.data[0]; 
            if(brand) {
                const precise = r.data.find(i => i.article?.manufacturer?.name?.toLowerCase().includes(brand.toLowerCase()));
                if(precise) match = precise;
            }
            if(match.article && match.article.pricing) {
                return res.json({
                    success: true,
                    found: true,
                    price: match.article.pricing.price,
                    currency: match.article.pricing.currency,
                    stock: match.article.pricing.delivery === 'stoc' ? 10 : 0
                });
            }
        }
        res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

app.get(/(.*)/, (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`>>> SERVEUR PRET: http://localhost:${PORT}`));