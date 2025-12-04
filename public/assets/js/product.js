// assets/js/product.js
// Affichage de la fiche produit à partir de localStorage

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("productContainer");
  const raw = localStorage.getItem("vinparts_selectedArticle");

  if (!raw) {
    container.innerHTML =
      "<p>Aucun article sélectionné. Retourne au <a href='tecdoc.html'>catalogue TecDoc</a>.</p>";
    return;
  }

  let article;
  try {
    article = JSON.parse(raw);
  } catch (e) {
    console.error("Impossible de parser l'article:", e);
    container.innerHTML =
      "<p>Erreur de chargement de la fiche produit. Retourne au <a href='tecdoc.html'>catalogue TecDoc</a>.</p>";
    return;
  }

  const brandName = article.brandName || "Marque inconnue";
  const articleNumber = article.articleNumber || "";
  const generic =
    article.genericArticles && article.genericArticles.length
      ? article.genericArticles
          .map((g) => g.genericArticleDescription)
          .join(", ")
      : "";
  const images = article.images || [];
  const oems = article.oemNumbers || [];
  const criteria = article.criteria || [];
  const gtins = article.gtins || [];

  const mainImg =
    images.find((img) => img.imageURL800) ||
    images.find((img) => img.imageURL400) ||
    images.find((img) => img.imageURL200) ||
    null;

  let html = "";

  html += `<div class="product-card">`;

  // Colonne gauche : images
  html += `<div class="product-media">`;
  html += `<div class="product-image-main">`;
  if (mainImg) {
    const src =
      mainImg.imageURL800 ||
      mainImg.imageURL400 ||
      mainImg.imageURL200 ||
      mainImg.imageURL100;
    html += `<img src="${src}" alt="${brandName} ${articleNumber}" />`;
  } else {
    html += `<span>Aucune image disponible</span>`;
  }
  html += `</div>`;

  if (images.length > 1) {
    html += `<div class="product-images-thumbs">`;
    images.forEach((img) => {
      const src =
        img.imageURL200 ||
        img.imageURL100 ||
        img.imageURL50 ||
        img.imageURL400;
      if (!src) return;
      html += `<img src="${src}" data-full="${
        img.imageURL800 || img.imageURL400 || src
      }" />`;
    });
    html += `</div>`;
  }

  html += `</div>`; // fin colonne gauche

  // Colonne droite : infos
  html += `<div class="product-info">`;

  html += `<div class="product-header">`;
  html += `<h1>${brandName} – ${articleNumber}</h1>`;
  if (generic) {
    html += `<div class="ref">${generic}</div>`;
  }
  html += `</div>`;

  // OEM
  html += `<div class="product-section">`;
  html += `<h2>Références OEM</h2>`;
  if (oems.length) {
    html += `<div>`;
    oems.slice(0, 20).forEach((o) => {
      html += `<span class="badge">${(o.mfrName || "")} ${
        o.articleNumber || ""
      }</span>`;
    });
    html += `</div>`;
  } else {
    html += `<p>Aucune référence OEM fournie par TecDoc.</p>`;
  }
  html += `</div>`;

  // GTIN / EAN
  html += `<div class="product-section">`;
  html += `<h2>Codes-barres (GTIN / EAN)</h2>`;
  if (gtins.length) {
    html += `<div>`;
    gtins.forEach((g) => {
      html += `<span class="badge">${g}</span>`;
    });
    html += `</div>`;
  } else {
    html += `<p>Pas de GTIN disponible.</p>`;
  }
  html += `</div>`;

  // Caractéristiques techniques
  html += `<div class="product-section">`;
  html += `<h2>Caractéristiques techniques</h2>`;
  if (criteria.length) {
    html += `<table class="criteria"><thead><tr><th>Critère</th><th>Valeur</th></tr></thead><tbody>`;
    criteria.forEach((c) => {
      html += `<tr><td>${c.description || c.abbr || ""}</td><td>${
        c.value || ""
      }</td></tr>`;
    });
    html += `</tbody></table>`;
  } else {
    html += `<p>Aucune caractéristique technique détaillée.</p>`;
  }
  html += `</div>`;

  html += `</div>`; // fin colonne droite

  html += `</div>`; // fin product-card

  container.innerHTML = html;

  // Interaction : clic sur miniatures = changer l'image principale
  const mainImgEl = container.querySelector(".product-image-main img");
  const thumbs = container.querySelectorAll(".product-images-thumbs img");
  thumbs.forEach((thumb) => {
    thumb.addEventListener("click", () => {
      const full = thumb.dataset.full || thumb.src;
      if (mainImgEl) {
        mainImgEl.src = full;
      }
    });
  });
});
