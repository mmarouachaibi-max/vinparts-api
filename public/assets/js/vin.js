// vin.js - Frontend VIN + Levam (Option C avec backend vinparts-api/server.js)

// Adapter ici si ton API n'est pas sur localhost:3000
const API_BASE = "http://localhost:3000";

/* ------------------------------------------------------------------
 * Helpers généraux
 * ------------------------------------------------------------------ */

function setStatus(message, isError = false) {
  const el = document.getElementById("vin-status");
  el.textContent = message || "";
  el.className = "status" + (isError ? " error" : "");
}

function htmlEscape(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------
 * Recherche VIN
 * ------------------------------------------------------------------ */

let currentVinData = null; // JSON de VinFind (ssd, link, etc.)

async function searchVin() {
  const vinInput = document.getElementById("vin-input");
  const vin = vinInput.value.trim();

  if (!vin) {
    setStatus("Merci de saisir un VIN.", true);
    return;
  }

  setStatus("Recherche du véhicule en cours...");
  currentVinData = null;

  try {
    const url = `${API_BASE}/api/levam/vin?vin=${encodeURIComponent(vin)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    // Exemple de réponse : { error:"", client:{...}, models:[...] }

    if (data.error) {
      setStatus("Erreur Levam VinFind : " + data.error, true);
      return;
    }

    currentVinData = data;
    setStatus("Véhicule trouvé, chargement de l'arbre des pièces...");

    renderVehicleInfo(data);

    // Pour TreeFullGet on utilise le même ssd + link retournés par VinFind
    const ssd = data.client && data.client.ssd;
    const firstModel = (data.models && data.models[0]) || null;
    const link = firstModel ? firstModel.link : data.client && data.client.modification;

    if (!ssd || !link) {
      setStatus(
        "VIN trouvé mais aucune combinaison ssd/link exploitable. Vérifie la réponse VinFind dans la console.",
        true
      );
      console.log("VinFind RAW =", data);
      return;
    }

    await loadLevamTree(ssd, link);
    setStatus("Véhicule et arbre des pièces chargés. Choisis un groupe à gauche.");
  } catch (err) {
    console.error("Erreur searchVin:", err);
    setStatus("Erreur lors de la recherche VIN : " + err.message, true);
  }
}

function renderVehicleInfo(data) {
  const el = document.getElementById("vehicle-info");
  const client = data.client || {};

  el.innerHTML = `
    <div class="vehicle-info-row"><span class="label">Marque :</span> ${htmlEscape(
      client.mark || ""
    )}</div>
    <div class="vehicle-info-row"><span class="label">Famille :</span> ${htmlEscape(
      client.family || ""
    )}</div>
    <div class="vehicle-info-row"><span class="label">Modèle :</span> ${htmlEscape(
      client.model || ""
    )}</div>
    <div class="vehicle-info-row"><span class="label">VIN :</span> ${htmlEscape(
      client.vin || ""
    )}</div>
    <div class="vehicle-info-row"><span class="label">Modification :</span> ${htmlEscape(
      client.modification || ""
    )}</div>
  `;
}

/* ------------------------------------------------------------------
 * Chargement de l'arbre des pièces (TreeFullGet)
 * ------------------------------------------------------------------ */

async function loadLevamTree(ssd, link) {
  const treeContainer = document.getElementById("tree-container");
  treeContainer.innerHTML = `<div class="muted">Chargement de l'arbre des pièces...</div>`;

  try {
    const url =
      `${API_BASE}/api/levam/tree?` +
      `ssd=${encodeURIComponent(ssd)}&link=${encodeURIComponent(link)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.error) {
      treeContainer.innerHTML =
        `<span class="status error">Erreur Levam TreeFullGet : ${htmlEscape(
          data.error
        )}</span>`;
      return;
    }

    // On sauve les infos nécessaires pour PartsGet
    currentVinData = currentVinData || {};
    currentVinData.tree = data;
    currentVinData.treeSsd = ssd;
    currentVinData.treeLink = link;

    renderLevamTree(data);
  } catch (err) {
    console.error("Erreur TreeFullGet:", err);
    treeContainer.innerHTML =
      `<span class="status error">Erreur lors du chargement de l'arbre : ${htmlEscape(
        err.message
      )}</span>`;
  }
}

function renderLevamTree(data) {
  const treeContainer = document.getElementById("tree-container");
  treeContainer.innerHTML = "";

  const tree = data.tree || {};
  const groupKeys = Object.keys(tree);
  if (!groupKeys.length) {
    treeContainer.innerHTML =
      '<div class="muted">Aucun nœud retourné par TreeFullGet.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  groupKeys.forEach((key) => {
    const group = tree[key];
    const groupDiv = document.createElement("div");
    groupDiv.className = "tree-group";

    const title = document.createElement("div");
    title.className = "tree-group-title";
    title.textContent = `${key} – ${group.name}`;
    groupDiv.appendChild(title);

    // Sous-groupes
    if (group.branch) {
      Object.keys(group.branch).forEach((subKey) => {
        const sub = group.branch[subKey];

        const subDiv = document.createElement("div");
        subDiv.className = "tree-sub";
        subDiv.textContent = `${subKey} – ${sub.name}`;
        groupDiv.appendChild(subDiv);

        // Nœuds "leaf" (assemblies) avec bouton Voir les pièces
        if (sub.nodes && Array.isArray(sub.nodes)) {
          sub.nodes.forEach((node) => {
            const row = document.createElement("div");
            row.className = "tree-node-row";

            const label = document.createElement("div");
            label.className = "tree-node-label";
            label.textContent = `${node.node_name}`;
            row.appendChild(label);

            const btn = document.createElement("button");
            btn.className = "tree-node-btn";
            btn.textContent = "Voir les pièces";

            // Pour PartsGet on passe le node_id tel quel comme "group"
            btn.addEventListener("click", () => {
              const nodeLabel = `${subKey} – ${node.node_name}`;
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

/* ------------------------------------------------------------------
 * Chargement des pièces (PartsGet) + affichage
 * ------------------------------------------------------------------ */

async function loadPartsForNode(groupId, nodeLabel) {
  if (!currentVinData || !currentVinData.treeSsd || !currentVinData.treeLink) {
    setStatus(
      "L'arbre Levam n'est pas chargé. Refais une recherche VIN.",
      true
    );
    return;
  }

  const ssd = currentVinData.treeSsd;
  const link = currentVinData.treeLink;

  setStatus("Chargement des pièces pour le groupe sélectionné...");

  try {
    const url =
      `${API_BASE}/api/levam/parts?` +
      `ssd=${encodeURIComponent(ssd)}&link=${encodeURIComponent(
        link
      )}&group=${encodeURIComponent(groupId)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.error) {
      setStatus("Erreur Levam PartsGet : " + data.error, true);
      console.log("PartsGet RAW =", data);
      return;
    }

    console.log("PartsGet RAW =", data);

    renderExplodedView(data, nodeLabel);
    renderPartsTable(data);
    setStatus("Pièces chargées pour le groupe sélectionné.");
  } catch (err) {
    console.error("Erreur PartsGet:", err);
    setStatus("Erreur lors du chargement des pièces : " + err.message, true);
  }
}

/* ------------------------------------------------------------------
 * Helper : chercher une vraie image de schéma dans la réponse PartsGet
 * (en évitant la simple photo de modèle "model_image")
 * ------------------------------------------------------------------ */

function findDiagramImage(data) {
  let found = null;

  function walk(obj) {
    if (!obj || found) return;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (found) break;
        walk(item);
      }
      return;
    }

    if (typeof obj === "object") {
      for (const [key, value] of Object.entries(obj)) {
        if (found) break;

        // On ignore volontairement la photo marketing du modèle
        if (key === "model_image") continue;

        // Si on trouve une clé qui contient "image" avec une URL HTTP, on la prend
        if (
          typeof value === "string" &&
          key.toLowerCase().includes("image") &&
          /^https?:\/\//.test(value)
        ) {
          found = value;
          break;
        }

        if (typeof value === "object" && value !== null) {
          walk(value);
        }
      }
    }
  }

  walk(data);
  return found;
}

/* ------------------------------------------------------------------
 * Vue éclatée (colonne du milieu)
 * ------------------------------------------------------------------ */

function renderExplodedView(data, nodeLabel) {
  const wrap = document.getElementById("exploded-wrapper");
  const info = document.getElementById("exploded-info");

  wrap.innerHTML = "";
  info.textContent = "";

  const client = data.client || {};
  const modelInfo = data.model_info || {};

  // 1) On cherche d'abord une vraie vue éclatée dans tout le JSON
  let imageUrl = findDiagramImage(data);

  // 2) Si rien trouvé, on retombe sur model_image (photo de la voiture)
  if (!imageUrl && data.model_image) {
    imageUrl = data.model_image;
  }

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "Vue éclatée / schéma";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "420px";
    img.style.objectFit = "contain";
    wrap.appendChild(img);
  } else {
    wrap.innerHTML =
      "<em>Aucune image de vue éclatée fournie par Levam pour ce groupe. Les pièces sont néanmoins listées à droite.</em>";
  }

  // Infos texte sous l'image
  const partsContainer = data.parts || {};
  const partsArray = partsContainer.parts || [];

  info.innerHTML = `
    <div><strong>Marque :</strong> ${htmlEscape(client.mark || "")}</div>
    <div><strong>Modèle :</strong> ${htmlEscape(
      client.model || modelInfo["Model code"] || ""
    )}</div>
    ${
      nodeLabel
        ? `<div><strong>Groupe sélectionné :</strong> ${htmlEscape(
            nodeLabel
          )}</div>`
        : ""
    }
    <div style="margin-top:4px;">
      <strong>Nombre de références :</strong> ${partsArray.length}
    </div>
  `;
}

/* ------------------------------------------------------------------
 * Tableau des pièces (colonne de droite)
 * ------------------------------------------------------------------ */

function renderPartsTable(data) {
  const container = document.getElementById("parts-container");

  const partsContainer = data.parts || {};
  const parts = partsContainer.parts || [];

  if (!parts.length) {
    container.innerHTML =
      '<div class="muted">Aucune pièce retournée pour ce groupe.</div>';
    return;
  }

  let html = `
    <table class="parts">
      <thead>
        <tr>
          <th>#</th>
          <th>Code pièce</th>
          <th>Nom</th>
          <th>Qté</th>
          <th>Info / type</th>
        </tr>
      </thead>
      <tbody>
  `;

  parts.forEach((p, idx) => {
    const s = p.standart || {};
    const add = p.add || {};

    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${htmlEscape(s.part_code || "")}</td>
        <td>${htmlEscape(s.part_name || "")}</td>
        <td>${htmlEscape(s.part_quantity || "")}</td>
        <td>${htmlEscape(add.info || s.type || "")}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

/* ------------------------------------------------------------------
 * Init
 * ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("vin-search-btn");
  btn.addEventListener("click", searchVin);

  document
    .getElementById("vin-input")
    .addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        searchVin();
      }
    });
});
