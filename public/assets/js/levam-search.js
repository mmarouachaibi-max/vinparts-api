// ===============================
// Recherche SANS VIN avec Levam
// Page : levam-search.html
// ===============================

var API_BASE = "http://localhost:3000";

// Infos du véhicule courant
var currentVehicle = {
  ssd: null,
  link: null,
  byId: {},
  treeSsd: null,
  treeLink: null,
  tree: null,
};

// Mapping pièces Levam pour tooltips / fusion
var currentLevamParts = [];
var currentLevamPartsMap = {}; // part_number -> { name, code, qty, info }

// Sélection Levam actuelle (ligne sur laquelle on a cliqué "Chercher TecDoc")
var currentLevamSelection = null;

// Panier TecDoc
var currentCart = [];

// Historique (VIN + Levam), stocké dans localStorage
var searchHistory = [];
var HISTORY_KEY = "vinparts_history";

// ---------------------------
// Utilitaires
// ---------------------------

function setStatus(msg, isError) {
  var el = document.getElementById("levam-status");
  if (!el) return;
  el.textContent = msg || "";
  if (isError) {
    el.className = "status error";
  } else {
    el.className = "status";
  }
}

function htmlEscape(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------
// Highlight helpers (vue éclatée)
// ---------------------------

function clearPartAndMarkerHighlights() {
  document
    .querySelectorAll("#parts-container tr.part-highlight")
    .forEach(function (tr) {
      tr.classList.remove("part-highlight");
    });

  document
    .querySelectorAll("#exploded-wrapper .exploded-marker.marker-highlight")
    .forEach(function (m) {
      m.classList.remove("marker-highlight");
    });
}

function highlightPart(partNumber, scrollIntoView) {
  clearPartAndMarkerHighlights();
  if (!partNumber) return;

  var safe = String(partNumber).replace(/"/g, '\\"');

  var row = document.querySelector(
    '#parts-container tbody tr[data-part-number="' + safe + '"]'
  );
  if (row) {
    row.classList.add("part-highlight");
    if (scrollIntoView) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  document
    .querySelectorAll(
      '#exploded-wrapper .exploded-marker[data-part-number="' + safe + '"]'
    )
    .forEach(function (marker) {
      marker.classList.add("marker-highlight");
    });
}

// ---------------------------
// Historique (localStorage)
// ---------------------------

function loadHistory() {
  try {
    var raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      searchHistory = [];
      return;
    }
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      searchHistory = parsed;
    } else {
      searchHistory = [];
    }
  } catch (e) {
    console.warn("Erreur loadHistory:", e);
    searchHistory = [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
  } catch (e) {
    console.warn("Erreur saveHistory:", e);
  }
}

function addHistoryEntry(entry) {
  entry = entry || {};
  entry.ts = Date.now();
  searchHistory.unshift(entry); // dernier en haut
  if (searchHistory.length > 100) {
    searchHistory = searchHistory.slice(0, 100);
  }
  saveHistory();
  renderHistory();
}

function renderHistory() {
  var panel = document.getElementById("history-panel");
  var list = document.getElementById("history-list");
  if (!panel || !list) return;

  if (!searchHistory.length) {
    list.innerHTML =
      "<li class='muted'>Aucune recherche enregistrée pour l’instant.</li>";
    return;
  }

  var html = searchHistory
    .map(function (h) {
      var date = new Date(h.ts);
      var labelDate =
        date.toLocaleDateString() + " " + date.toLocaleTimeString();
      var type = h.type || "Autre";

      var details = "";
      if (h.type === "LEVAM_OE") {
        details =
          "Code Levam : <strong>" +
          htmlEscape(h.oe || "") +
          "</strong> – " +
          htmlEscape(h.partName || "");
      } else if (h.type === "VIN") {
        details =
          "VIN : <strong>" +
          htmlEscape(h.vin || "") +
          "</strong> – " +
          htmlEscape(h.model || "");
      } else {
        details = htmlEscape(h.detail || "");
      }

      return (
        "<li>" +
        "<span class='history-type'>" +
        htmlEscape(type) +
        "</span> " +
        "<span class='history-detail'>" +
        details +
        "</span> " +
        "<span class='history-date'>" +
        htmlEscape(labelDate) +
        "</span>" +
        "</li>"
      );
    })
    .join("");

  list.innerHTML = html;
}

// (à utiliser dans vin.js)
// Exemple : addHistoryEntry({ type: "VIN", vin, model: "Fiat 500 1.2" });

// ---------------------------
// Panier TecDoc
// ---------------------------

function addToCart(article) {
  if (!article || !article.articleId) return;

  // éviter les doublons simples par articleId
  var exists = currentCart.some(function (a) {
    return a.articleId === article.articleId;
  });
  if (!exists) {
    currentCart.push(article);
  }
  renderCart();
}

function removeFromCart(articleId) {
  currentCart = currentCart.filter(function (a) {
    return a.articleId !== articleId;
  });
  renderCart();
}

function renderCart() {
  var panel = document.getElementById("cart-panel");
  var list = document.getElementById("cart-items");
  var badge = document.getElementById("cart-count");
  if (!panel || !list) return;

  if (!currentCart.length) {
    list.innerHTML =
      "<div class='muted'>Aucun article dans le panier pour l’instant.</div>";
  } else {
    var html = currentCart
      .map(function (a) {
        return (
          "<div class='cart-item'>" +
          "<div class='cart-main'>" +
          "<div class='cart-title'>" +
          htmlEscape(a.brandName || "") +
          " – " +
          htmlEscape(a.articleNumber || "") +
          "</div>" +
          "<div class='cart-sub'>" +
          "OE : " +
          htmlEscape(a.oe || "-") +
          "</div>" +
          "</div>" +
          "<button class='cart-remove' data-article-id='" +
          htmlEscape(String(a.articleId)) +
          "'>&times;</button>" +
          "</div>"
        );
      })
      .join("");
    list.innerHTML = html;
  }

  if (badge) {
    badge.textContent = currentCart.length.toString();
  }
}

// ---------------------------
// Initialisation
// ---------------------------

document.addEventListener("DOMContentLoaded", function () {
  var catalogSelect = document.getElementById("catalogSelect");
  var modelSelect = document.getElementById("modelSelect");
  var paramsSelect = document.getElementById("paramsSelect");
  var modSelect = document.getElementById("modificationSelect");

  if (!catalogSelect || !modelSelect || !paramsSelect || !modSelect) {
    console.error("Certains éléments <select> sont manquants dans le HTML.");
    return;
  }

  modelSelect.disabled = true;
  paramsSelect.disabled = true;
  modSelect.disabled = true;

  paramsSelect.innerHTML =
    "<option value=''>Paramètres choisis automatiquement</option>";

  // Historique & panier
  loadHistory();
  renderHistory();
  renderCart();

  // Charger les catalogues dès le début
  loadCatalogs();

  // Changement de catalogue
  catalogSelect.addEventListener("change", function () {
    var catalogCode = catalogSelect.value;
    resetBelow("catalog");
    if (catalogCode) {
      loadModels(catalogCode);
    }
  });

  // Changement de modèle (famille + modèle)
  modelSelect.addEventListener("change", function () {
    var catalogCode = catalogSelect.value;
    var sel = modelSelect.options[modelSelect.selectedIndex];
    if (!sel) return;

    var family = sel.getAttribute("data-family");
    var modelName = sel.value;

    resetBelow("model");
    if (catalogCode && family && modelName) {
      loadVehicleMods(catalogCode, family, modelName);
    }
  });

  // Changement de modification / série
  modSelect.addEventListener("change", function () {
    var modId = modSelect.value;
    if (!modId) return;

    var info = currentVehicle.byId[modId];
    if (!info || !info.ssd || !info.link) {
      setStatus(
        "Pas de ssd/link pour cette modification. Regarde la réponse JSON dans la console.",
        true
      );
      console.log("currentVehicle.byId =", currentVehicle.byId);
      return;
    }

    currentVehicle.ssd = info.ssd;
    currentVehicle.link = info.link;

    loadLevamTree(currentVehicle.ssd, currentVehicle.link);
  });

  // Boutons de zoom (si présents dans le HTML)
  var zoomRange = document.getElementById("exploded-zoom");
  if (zoomRange) {
    zoomRange.addEventListener("input", function () {
      applyZoom(parseFloat(zoomRange.value || "1"));
    });
  }

  var zoomMinus = document.getElementById("zoom-minus");
  var zoomPlus = document.getElementById("zoom-plus");
  if (zoomMinus && zoomPlus && zoomRange) {
    zoomMinus.addEventListener("click", function () {
      var v = parseFloat(zoomRange.value || "1");
      v = Math.max(0.5, v - 0.1);
      zoomRange.value = v.toFixed(2);
      applyZoom(v);
    });
    zoomPlus.addEventListener("click", function () {
      var v = parseFloat(zoomRange.value || "1");
      v = Math.min(2.5, v + 0.1);
      zoomRange.value = v.toFixed(2);
      applyZoom(v);
    });
  }

  // Event global pour supprimer du panier
  var cartPanel = document.getElementById("cart-panel");
  if (cartPanel) {
    cartPanel.addEventListener("click", function (e) {
      var btn = e.target.closest(".cart-remove");
      if (!btn) return;
      var id = btn.getAttribute("data-article-id");
      removeFromCart(id);
    });
  }
});

// Appliquer zoom sur la zone de vue éclatée
function applyZoom(factor) {
  var img = document.querySelector("#exploded-wrapper img");
  if (!img) return;
  factor = factor || 1;
  img.style.transform = "scale(" + factor + ")";
  img.style.transformOrigin = "center center";
}

/* ------------------------------------------------------------------
 * Réinitialiser l'UI sous un certain niveau
 * ------------------------------------------------------------------ */

function resetBelow(level) {
  var modelSelect = document.getElementById("modelSelect");
  var paramsSelect = document.getElementById("paramsSelect");
  var modSelect = document.getElementById("modificationSelect");

  if (level === "catalog") {
    if (modelSelect) {
      modelSelect.innerHTML = "<option value=''>-- modèle --</option>";
      modelSelect.disabled = true;
    }
  }

  if (level === "catalog" || level === "model") {
    if (paramsSelect) {
      paramsSelect.innerHTML =
        "<option value=''>Paramètres choisis automatiquement</option>";
      paramsSelect.disabled = true;
    }
  }

  if (level === "catalog" || level === "model" || level === "params") {
    if (modSelect) {
      modSelect.innerHTML = "<option value=''>-- modification --</option>";
      modSelect.disabled = true;
    }

    var treeContainer = document.getElementById("tree-container");
    var explodedWrapper = document.getElementById("exploded-wrapper");
    var explodedInfo = document.getElementById("exploded-info");
    var partsContainer = document.getElementById("parts-container");
    var tecdocResults = document.getElementById("tecdoc-results");

    if (treeContainer) treeContainer.innerHTML = "";
    if (explodedWrapper) explodedWrapper.innerHTML = "";
    if (explodedInfo) explodedInfo.innerHTML = "";
    if (partsContainer) partsContainer.innerHTML = "";
    if (tecdocResults) tecdocResults.innerHTML = "";
  }
}

/* ------------------------------------------------------------------
 * 1) CatalogsListGet – liste des catalogues / marques
 * ------------------------------------------------------------------ */

function loadCatalogs() {
  setStatus("Chargement des catalogues Levam...");
  var select = document.getElementById("catalogSelect");
  if (!select) return;

  select.innerHTML = "<option value=''>-- marque --</option>";

  fetch(API_BASE + "/api/levam/catalogs")
    .then(function (resp) {
      console.log("Appel /api/levam/catalogs, status =", resp.status);
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then(function (data) {
      console.log("CatalogsListGet JSON =", data);

      if (data.error) {
        throw new Error(data.error);
      }

      var catalogs = data.catalogs || [];
      if (!catalogs.length) {
        setStatus("Aucun catalogue reçu depuis Levam.", true);
        return;
      }

      catalogs.forEach(function (c) {
        var opt = document.createElement("option");
        opt.value = c.catalog_code;
        opt.textContent = c.name;
        select.appendChild(opt);
      });

      select.disabled = false;
      setStatus("Choisis une marque.");
    })
    .catch(function (e) {
      console.error("loadCatalogs:", e);
      setStatus("Erreur CatalogsListGet : " + e.message, true);
    });
}

/* ------------------------------------------------------------------
 * 2) ModelsListGet2 – liste des modèles par famille
 * ------------------------------------------------------------------ */

function loadModels(catalogCode) {
  setStatus("Chargement des modèles...");
  var select = document.getElementById("modelSelect");
  if (!select) return;

  select.innerHTML = "<option value=''>-- modèle --</option>";

  var qs = new URLSearchParams({
    catalog_code: catalogCode,
    lang: "fr",
  });

  fetch(API_BASE + "/api/levam/models?" + qs.toString())
    .then(function (resp) {
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then(function (data) {
      console.log("ModelsListGet2 JSON =", data);

      if (data.error) {
        throw new Error(data.error);
      }

      var families = data.families || {};
      var familyKeys = Object.keys(families);

      if (!familyKeys.length) {
        setStatus("Aucune famille / modèle pour ce catalogue.", true);
        return;
      }

      familyKeys.forEach(function (key) {
        var family = families[key];
        var familyName = family.family_name || key;
        var models = family.models || [];

        models.forEach(function (m) {
          var opt = document.createElement("option");
          opt.value = m.model;
          opt.textContent = familyName + " – " + m.model;
          opt.setAttribute("data-family", familyName);
          select.appendChild(opt);
        });
      });

      select.disabled = false;
      setStatus("Choisis un modèle.");
    })
    .catch(function (e) {
      console.error("loadModels:", e);
      setStatus("Erreur ModelsListGet2 : " + e.message, true);
    });
}

/* ------------------------------------------------------------------
 * 3) VehicleParamsSet + 4) VehicleModificationsGet
 * ------------------------------------------------------------------ */

function loadVehicleMods(catalogCode, familyName, modelName) {
  setStatus("Chargement des paramètres du véhicule...");
  var paramsSelect = document.getElementById("paramsSelect");
  var modSelect = document.getElementById("modificationSelect");
  if (!paramsSelect || !modSelect) return;

  modSelect.innerHTML = "<option value=''>-- modification --</option>";

  var qsParams = new URLSearchParams({
    catalog_code: catalogCode,
    family: familyName,
    model: modelName,
  });

  fetch(API_BASE + "/api/levam/vehicle-params?" + qsParams.toString())
    .then(function (respParams) {
      if (!respParams.ok) {
        throw new Error("HTTP " + respParams.status);
      }
      return respParams.json();
    })
    .then(function (dataParams) {
      console.log("VehicleParamsSet JSON =", dataParams);

      if (dataParams.error) {
        throw new Error(dataParams.error);
      }

      var baseSsd =
        dataParams.client && dataParams.client.ssd
          ? dataParams.client.ssd
          : null;

      if (!baseSsd) {
        throw new Error("VehicleParamsSet n'a pas retourné de ssd.");
      }

      paramsSelect.innerHTML =
        "<option value='auto'>Paramètres choisis automatiquement</option>";
      paramsSelect.disabled = true;

      setStatus("Chargement des séries / modifications...");

      var qsMods = new URLSearchParams({
        ssd: baseSsd,
      });

      return fetch(
        API_BASE + "/api/levam/vehicle-mods?" + qsMods.toString()
      ).then(function (respMods) {
        if (!respMods.ok) {
          throw new Error("HTTP " + respMods.status);
        }
        return respMods.json().then(function (dataMods) {
          return {
            baseSsd: baseSsd,
            dataMods: dataMods,
          };
        });
      });
    })
    .then(function (wrapper) {
      var baseSsd = wrapper.baseSsd;
      var dataMods = wrapper.dataMods;

      console.log("VehicleModificationsGet JSON =", dataMods);

      if (dataMods.error) {
        throw new Error(dataMods.error);
      }

      var mods = dataMods.modifications || [];
      currentVehicle.byId = {};

      if (!mods.length) {
        setStatus(
          "Aucune modification trouvée pour ce modèle (VehicleModificationsGet).",
          true
        );
        return;
      }

      var finalSsd =
        (dataMods.client && dataMods.client.ssd) || baseSsd || null;

      mods.forEach(function (m, idx) {
        var opt = document.createElement("option");
        var id = "mod_" + idx;
        opt.value = id;

        var labelParts = [];

        Object.keys(m).forEach(function (key) {
          if (key === "link") return;
          var val = m[key];
          if (val === null || val === undefined || val === "") return;

          if (/^\d+$/.test(key)) {
            labelParts.push(String(val));
          } else {
            labelParts.push(key + ": " + val);
          }
        });

        var label =
          labelParts.length > 0
            ? labelParts.join(" | ")
            : "Modification " + (idx + 1);

        opt.textContent = label;
        modSelect.appendChild(opt);

        currentVehicle.byId[id] = {
          ssd: finalSsd,
          link: m.link,
        };
      });

      modSelect.disabled = false;
      setStatus("Choisis une série / modification pour charger l'arbre.");
    })
    .catch(function (e) {
      console.error("loadVehicleMods:", e);
      setStatus(
        "Erreur VehicleParamsSet/VehicleModificationsGet : " + e.message,
        true
      );
    });
}

/* ------------------------------------------------------------------
 * 5) TreeFullGet + PartsGet
 * ------------------------------------------------------------------ */

function loadLevamTree(ssd, link) {
  var treeContainer = document.getElementById("tree-container");
  if (!treeContainer) return;

  treeContainer.innerHTML =
    "<div class='muted'>Chargement de l'arbre des pièces...</div>";

  var url =
    API_BASE +
    "/api/levam/tree?ssd=" +
    encodeURIComponent(ssd) +
    "&link=" +
    encodeURIComponent(link);

  fetch(url)
    .then(function (resp) {
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then(function (data) {
      console.log("TreeFullGet JSON =", data);

      if (data.error) {
        treeContainer.innerHTML =
          "<span class='status error'>Erreur Levam TreeFullGet : " +
          htmlEscape(data.error) +
          "</span>";
        return;
      }

      currentVehicle.tree = data;
      currentVehicle.treeSsd = ssd;
      currentVehicle.treeLink = link;

      renderLevamTree(data);
      setStatus("Arbre des groupes chargé. Choisis un groupe.");
    })
    .catch(function (err) {
      console.error("Erreur TreeFullGet:", err);
      treeContainer.innerHTML =
        "<span class='status error'>Erreur lors du chargement de l'arbre : " +
        htmlEscape(err.message) +
        "</span>";
    });
}

// Affichage de l'arbre Levam
function renderLevamTree(data) {
  var treeContainer = document.getElementById("tree-container");
  if (!treeContainer) return;

  treeContainer.innerHTML = "";

  var tree = data.tree || {};
  var groupKeys = Object.keys(tree);

  if (!groupKeys.length) {
    treeContainer.innerHTML =
      "<div class='muted'>Aucun noeud retourné par TreeFullGet.</div>";
    return;
  }

  var frag = document.createDocumentFragment();

  groupKeys.forEach(function (key) {
    var group = tree[key];
    var groupDiv = document.createElement("div");
    groupDiv.className = "tree-group";

    var title = document.createElement("div");
    title.className = "tree-group-title";
    title.textContent = key + " – " + (group.name || "");
    groupDiv.appendChild(title);

    if (group.branch) {
      Object.keys(group.branch).forEach(function (subKey) {
        var sub = group.branch[subKey];

        var subDiv = document.createElement("div");
        subDiv.className = "tree-sub";
        subDiv.textContent = subKey + " – " + (sub.name || "");
        groupDiv.appendChild(subDiv);

        if (sub.nodes && Array.isArray(sub.nodes)) {
          sub.nodes.forEach(function (node) {
            var row = document.createElement("div");
            row.className = "tree-node-row";

            var label = document.createElement("div");
            label.className = "tree-node-label";
            label.textContent = node.node_name || "";
            row.appendChild(label);

            var btn = document.createElement("button");
            btn.className = "tree-node-btn";
            btn.textContent = "Voir les pièces";

            btn.addEventListener("click", function () {
              var nodeLabel = subKey + " – " + (node.node_name || "");
              loadPartsForNode(node.node_id, nodeLabel);
            });

            row.appendChild(btn);
            groupDiv.appendChild(row);
          });
        }
      });
    }

    frag.appendChild(groupDiv);
  });

  treeContainer.appendChild(frag);
}

// Chargement des pièces pour un nœud
function loadPartsForNode(groupId, nodeLabel) {
  if (
    !currentVehicle ||
    !currentVehicle.treeSsd ||
    !currentVehicle.treeLink
  ) {
    setStatus(
      "L'arbre Levam n'est pas chargé. Refais la sélection du véhicule.",
      true
    );
    return;
  }

  var ssd = currentVehicle.treeSsd;
  var link = currentVehicle.treeLink;

  setStatus("Chargement des pièces pour le groupe sélectionné...");

  var url =
    API_BASE +
    "/api/levam/parts?ssd=" +
    encodeURIComponent(ssd) +
    "&link=" +
    encodeURIComponent(link) +
    "&group=" +
    encodeURIComponent(groupId);

  fetch(url)
    .then(function (resp) {
      if (!resp.ok) {
        throw new Error("HTTP " + resp.status);
      }
      return resp.json();
    })
    .then(function (data) {
      console.log("PartsGet RAW =", data);

      if (data.error) {
        setStatus("Erreur Levam PartsGet : " + data.error, true);
        return;
      }

      // Préparer mapping pièces pour tooltips & fusion
      var partsContainer = data.parts || {};
      currentLevamParts = partsContainer.parts || [];
      currentLevamPartsMap = {};
      currentLevamParts.forEach(function (p) {
        var s = p.standart || {};
        var num = s.part_number || "";
        currentLevamPartsMap[num] = {
          name: s.part_name || "",
          code: s.part_code || "",
          qty: s.part_quantity || "",
          info: (p.add && p.add.info) || "",
        };
      });

      renderExplodedView(data, nodeLabel);
      renderPartsTable(data);
      setStatus("Pièces chargées pour le groupe sélectionné.");
    })
    .catch(function (err) {
      console.error("Erreur PartsGet:", err);
      setStatus(
        "Erreur lors du chargement des pièces : " + err.message,
        true
      );
    });
}

/* ------------------------------------------------------------------
 * 6) Vue éclatée INTERACTIVE + ZOOM + TOOLTIP
 * ------------------------------------------------------------------ */

function renderExplodedView(data, nodeLabel) {
  var wrap = document.getElementById("exploded-wrapper");
  var info = document.getElementById("exploded-info");
  var zoomRange = document.getElementById("exploded-zoom");

  if (!wrap || !info) return;

  wrap.innerHTML = "";
  info.innerHTML = "";

  var client = data.client || {};
  var modelInfo = data.model_info || {};

  var imageUrl = null;
  var usedModelImage = false;

  if (
    data &&
    data.parts &&
    Array.isArray(data.parts.image) &&
    data.parts.image.length > 0 &&
    typeof data.parts.image[0] === "string"
  ) {
    imageUrl = data.parts.image[0];
  } else if (data.model_image) {
    imageUrl = data.model_image;
    usedModelImage = true;
  }

  if (imageUrl) {
    var img = document.createElement("img");
    img.src = imageUrl;
    img.alt = usedModelImage
      ? "Photo du véhicule (aucune vue éclatée fournie)"
      : "Vue éclatée / schéma";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "420px";
    img.style.objectFit = "contain";
    img.style.transition = "transform 0.15s ease-out";
    wrap.appendChild(img);

    // Zoom reset
    if (zoomRange) {
      zoomRange.value = "1";
      applyZoom(1);
    }

    if (usedModelImage) {
      var note = document.createElement("div");
      note.className = "muted";
      note.style.marginTop = "4px";
      note.innerHTML =
        "Image fournie par Levam : photo du véhicule. " +
        "Aucun schéma détaillé n'est disponible pour ce groupe.";
      wrap.appendChild(note);
    } else {
      var coords =
        data.parts &&
        Array.isArray(data.parts.coord) &&
        data.parts.coord.length > 0
          ? data.parts.coord[0]
          : null;

      if (coords && coords.length) {
        wrap.style.position = "relative";

        coords.forEach(function (c) {
          var marker = document.createElement("div");
          marker.className = "exploded-marker";
          marker.textContent = c.name;
          marker.setAttribute("data-part-number", c.name);

          // Tooltip : nom de la pièce si trouvé
          var infoPart = currentLevamPartsMap[c.name];
          if (infoPart && infoPart.name) {
            marker.title = infoPart.name;
          }

          marker.style.top = (c["margin-top"] || 0) + "%";
          marker.style.left = (c["margin-left"] || 0) + "%";

          marker.addEventListener("mouseenter", function () {
            highlightPart(c.name, false);
          });
          marker.addEventListener("mouseleave", function () {
            clearPartAndMarkerHighlights();
          });
          marker.addEventListener("click", function () {
            highlightPart(c.name, true);
          });

          wrap.appendChild(marker);
        });
      }
    }
  } else {
    wrap.innerHTML =
      "<em>Aucune image (ni photo, ni vue éclatée) fournie par Levam pour ce groupe. Les pièces sont listées à droite.</em>";
  }

  var partsContainer = data.parts || {};
  var partsArray = partsContainer.parts || [];

  var html =
    "<div><strong>Marque :</strong> " +
    htmlEscape(client.mark || "") +
    "</div>" +
    "<div><strong>Modèle :</strong> " +
    htmlEscape(client.model || modelInfo["Model code"] || "") +
    "</div>";

  if (nodeLabel) {
    html +=
      "<div><strong>Groupe sélectionné :</strong> " +
      htmlEscape(nodeLabel) +
      "</div>";
  }

  html +=
    "<div style='margin-top:4px;'><strong>Nombre de références :</strong> " +
    partsArray.length +
    "</div>";

  info.innerHTML = html;
}

/* ------------------------------------------------------------------
 * 7) Tableau des pièces (avec bouton TecDoc)
 * ------------------------------------------------------------------ */

function renderPartsTable(data) {
  var container = document.getElementById("parts-container");
  if (!container) return;

  var partsContainer = data.parts || {};
  var parts = partsContainer.parts || [];

  if (!parts.length) {
    container.innerHTML =
      "<div class='muted'>Aucune pièce retournée pour ce groupe.</div>";
    return;
  }

  var html =
    "<table class='parts' id='levam-parts-table'>" +
    "<thead>" +
    "<tr>" +
    "<th>#</th>" +
    "<th>Code pièce</th>" +
    "<th>Nom</th>" +
    "<th>Qté</th>" +
    "<th>Info / type</th>" +
    "<th>TecDoc</th>" +
    "</tr>" +
    "</thead>" +
    "<tbody>";

  parts.forEach(function (p, idx) {
    var s = p.standart || {};
    var add = p.add || {};
    var partNumber = s.part_number || (idx + 1).toString();
    var partCode = s.part_code || "";
    var partName = s.part_name || "";
    var partQty = s.part_quantity || "";
    var info = add.info || s.type || "";

    html +=
      "<tr data-part-number=\"" +
      htmlEscape(partNumber) +
      "\">" +
      "<td>" +
      htmlEscape(partNumber) +
      "</td>" +
      "<td>" +
      htmlEscape(partCode) +
      "</td>" +
      "<td>" +
      htmlEscape(partName) +
      "</td>" +
      "<td>" +
      htmlEscape(partQty) +
      "</td>" +
      "<td>" +
      htmlEscape(info) +
      "</td>" +
      "<td>" +
      (partCode && partCode !== "no code"
        ? "<button class=\"btn-levam-tecdoc\" " +
          "data-oe=\"" +
          htmlEscape(partCode) +
          "\" " +
          "data-part-name=\"" +
          htmlEscape(partName) +
          "\" " +
          "data-part-qty=\"" +
          htmlEscape(partQty) +
          "\">Chercher TecDoc</button>"
        : "<span class='muted'>-</span>") +
      "</td>" +
      "</tr>";
  });

  html += "</tbody></table>";
  container.innerHTML = html;

  var rows = container.querySelectorAll("tbody tr");
  rows.forEach(function (row) {
    var pn = row.getAttribute("data-part-number");
    row.addEventListener("mouseenter", function () {
      highlightPart(pn, false);
    });
    row.addEventListener("mouseleave", function () {
      clearPartAndMarkerHighlights();
    });
    row.addEventListener("click", function () {
      highlightPart(pn, true);
    });
  });

  var table = document.getElementById("levam-parts-table");
  if (table) {
    table.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-levam-tecdoc");
      if (!btn) return;

      var oe = btn.getAttribute("data-oe");
      var tr = btn.closest("tr");
      var partName = btn.getAttribute("data-part-name") || "";
      var partQty = btn.getAttribute("data-part-qty") || "";
      currentLevamSelection = {
        oe: oe,
        partName: partName,
        partQty: partQty,
      };

      // Historique
      addHistoryEntry({
        type: "LEVAM_OE",
        oe: oe,
        partName: partName,
      });

      searchTecdocForOE(oe);
    });
  }
}

/* ------------------------------------------------------------------
 * 8) Recherche dans TecDoc + fusion Levam/TecDoc + panier
 * ------------------------------------------------------------------ */

async function searchTecdocForOE(oe) {
  var tecdocResultDiv = document.getElementById("tecdoc-results");
  if (!tecdocResultDiv) {
    console.warn("Div #tecdoc-results manquante dans le HTML.");
    return;
  }

  if (!oe || oe.toLowerCase() === "no code") {
    tecdocResultDiv.innerHTML =
      "<div class='status warning'>Pas de code OEM exploitable pour cette pièce.</div>";
    return;
  }

  tecdocResultDiv.innerHTML =
    "<div class='muted'>Recherche TecDoc pour OE <strong>" +
    htmlEscape(oe) +
    "</strong>...</div>";

  try {
    var url =
      API_BASE + "/api/tecdoc/search-oe?oe=" + encodeURIComponent(oe);
    console.log("Appel TecDoc search-oe :", url);

    var resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }

    var data = await resp.json();
    console.log("Réponse /api/tecdoc/search-oe =", data);

    if (!data.success) {
      tecdocResultDiv.innerHTML =
        "<div class='status error'>Erreur TecDoc : " +
        htmlEscape(data.error || "inconnue") +
        "</div>";
      return;
    }

    var articles = data.articles || [];
    if (!articles.length) {
      tecdocResultDiv.innerHTML =
        "<div class='status warning'>Aucun article TecDoc trouvé pour OE <strong>" +
        htmlEscape(oe) +
        "</strong>.</div>";
      return;
    }

    // TecDoc pur
    var rowsHtml = articles
      .map(function (a) {
        var oemList = (a.oemNumbers || [])
          .map(function (o) {
            return o.articleNumber;
          })
          .join(", ");

        var imgUrl = null;
        if (a.images && a.images.length) {
          var firstImg = a.images[0] || {};
          imgUrl =
            firstImg.imageURL200 ||
            firstImg.imageURL100 ||
            firstImg.imageURL400 ||
            firstImg.imageURL50 ||
            null;
        }

        var imgTag = imgUrl
          ? "<img src='" +
            htmlEscape(imgUrl) +
            "' style='max-width:60px; max-height:60px; object-fit:contain;' />"
          : "<span class='muted'>-</span>";

        return (
          "<tr>" +
          "<td>" +
          imgTag +
          "</td>" +
          "<td>" +
          htmlEscape(a.brandName || "") +
          "</td>" +
          "<td>" +
          htmlEscape(a.articleNumber || "") +
          "</td>" +
          "<td>" +
          htmlEscape(oemList || "-") +
          "</td>" +
          "<td>" +
          "<button class='btn-commande' " +
          "data-article-id='" +
          htmlEscape(String(a.articleId || "")) +
          "' " +
          "data-brand='" +
          htmlEscape(a.brandName || "") +
          "' " +
          "data-ref='" +
          htmlEscape(a.articleNumber || "") +
          "' " +
          "data-oe='" +
          htmlEscape(oe) +
          "'>" +
          "Pré-commander</button>" +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    // Fusion Levam + TecDoc
    var mergedRows = "";

    // Ligne Levam
    var lev = currentLevamSelection || { oe: oe };
    mergedRows +=
      "<tr class='merged-levam'>" +
      "<td>LevAM</td>" +
      "<td>" +
      htmlEscape(lev.oe || oe) +
      "</td>" +
      "<td>" +
      htmlEscape(lev.partName || "") +
      "</td>" +
      "<td>" +
      htmlEscape(lev.partQty || "") +
      "</td>" +
      "</tr>";

    // Lignes TecDoc
    mergedRows += articles
      .map(function (a) {
        return (
          "<tr class='merged-tecdoc'>" +
          "<td>TecDoc</td>" +
          "<td>" +
          htmlEscape(a.articleNumber || "") +
          "</td>" +
          "<td>" +
          htmlEscape(a.brandName || "") +
          "</td>" +
          "<td>OE: " +
          htmlEscape(
            (a.oemNumbers || [])
              .map(function (o) {
                return o.articleNumber;
              })
              .join(", ") || "-"
          ) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    tecdocResultDiv.innerHTML =
      "<h3>Résultats TecDoc pour la pièce sélectionnée</h3>" +
      "<table class='tecdoc-result-table'>" +
      "<thead>" +
      "<tr>" +
      "<th>Image</th>" +
      "<th>Marque</th>" +
      "<th>Réf. TecDoc</th>" +
      "<th>OE associées</th>" +
      "<th>Action</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody>" +
      rowsHtml +
      "</tbody>" +
      "</table>" +
      "<h4>Vue combinée Levam / TecDoc</h4>" +
      "<table class='merged-table'>" +
      "<thead>" +
      "<tr>" +
      "<th>Source</th>" +
      "<th>Référence</th>" +
      "<th>Détail</th>" +
      "<th>Infos</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody>" +
      mergedRows +
      "</tbody>" +
      "</table>";

    // Gestion du clic "Pré-commander" (ajout panier)
    tecdocResultDiv.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-commande");
      if (!btn) return;

      var articleId = btn.getAttribute("data-article-id");
      var brandName = btn.getAttribute("data-brand") || "";
      var ref = btn.getAttribute("data-ref") || "";
      var oeCode = btn.getAttribute("data-oe") || "";

      addToCart({
        articleId: articleId,
        brandName: brandName,
        articleNumber: ref,
        oe: oeCode,
      });
    });
  } catch (err) {
    console.error("Erreur searchTecdocForOE:", err);
    tecdocResultDiv.innerHTML =
      "<div class='status error'>Erreur réseau TecDoc : " +
      htmlEscape(err.message) +
      "</div>";
  }
}
