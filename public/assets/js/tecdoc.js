// assets/js/tecdoc.js
// FRONTEND VinParts – connexion à l’API TecDoc locale
// Backend: http://localhost:3000/api/tecdoc

const apiBase = "http://localhost:3000/api/tecdoc";

document.addEventListener("DOMContentLoaded", () => {
  const brandSelect = document.getElementById("brandSelect");
  const modelSelect = document.getElementById("modelSelect");
  const vehicleSelect = document.getElementById("vehicleSelect");
  const vehicleInfo = document.getElementById("vehicleInfo");
  const categoriesDiv = document.getElementById("categories");
  const partsDiv = document.getElementById("parts");

  const oemSearchInput = document.getElementById("oemSearchInput");
  const oemSearchBtn = document.getElementById("oemSearchBtn");
  const oemClearBtn = document.getElementById("oemClearBtn");

  // On garde la dernière liste de pièces pour filtrer OEM
  let lastParts = [];

  // --- 1) Charger les marques au chargement de la page ---
  loadBrands();

  function loadBrands() {
    brandSelect.innerHTML =
      "<option value=''>-- Sélectionner une marque --</option>";
    modelSelect.innerHTML =
      "<option value=''>-- Sélectionner un modèle --</option>";
    vehicleSelect.innerHTML =
      "<option value=''>-- Sélectionner une version --</option>";

    modelSelect.disabled = true;
    vehicleSelect.disabled = true;
    if (vehicleInfo) {
      vehicleInfo.textContent = "Aucun véhicule sélectionné.";
    }

    categoriesDiv.innerHTML =
      "<div class='placeholder'>Sélectionne d'abord un véhicule pour voir les catégories disponibles.</div>";
    partsDiv.innerHTML =
      "<div class='placeholder'>Clique sur une catégorie pour afficher les pièces TecDoc.</div>";

    fetch(`${apiBase}/brands`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          console.error("Erreur API /brands:", data.error);
          return;
        }
        data.brands.forEach((b) => {
          const opt = document.createElement("option");
          opt.value = b.id;
          opt.textContent = b.name;
          brandSelect.appendChild(opt);
        });
      })
      .catch((err) => {
        console.error("Erreur réseau /brands:", err);
      });
  }

  // --- 2) Quand une marque est sélectionnée : charger les modèles ---
  brandSelect.addEventListener("change", () => {
    const mfrId = brandSelect.value;

    modelSelect.innerHTML =
      "<option value=''>-- Sélectionner un modèle --</option>";
    vehicleSelect.innerHTML =
      "<option value=''>-- Sélectionner une version --</option>";
    modelSelect.disabled = !mfrId;
    vehicleSelect.disabled = true;

    categoriesDiv.innerHTML =
      "<div class='placeholder'>Sélectionne d'abord un véhicule pour voir les catégories disponibles.</div>";
    partsDiv.innerHTML =
      "<div class='placeholder'>Clique sur une catégorie pour afficher les pièces TecDoc.</div>";
    if (vehicleInfo) {
      vehicleInfo.textContent = "Aucun véhicule sélectionné.";
    }
    lastParts = [];

    if (!mfrId) return;

    fetch(`${apiBase}/models?mfrId=${encodeURIComponent(mfrId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          console.error("Erreur API /models:", data.error);
          return;
        }
        data.models.forEach((m) => {
          const opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.name;
          modelSelect.appendChild(opt);
        });
      })
      .catch((err) => {
        console.error("Erreur réseau /models:", err);
      });
  });

  // --- 3) Quand un modèle est sélectionné : charger les véhicules ---
  modelSelect.addEventListener("change", () => {
    const mfrId = brandSelect.value;
    const modelSeriesId = modelSelect.value;

    vehicleSelect.innerHTML =
      "<option value=''>-- Sélectionner une version --</option>";
    vehicleSelect.disabled = !modelSeriesId;

    categoriesDiv.innerHTML =
      "<div class='placeholder'>Sélectionne d'abord un véhicule pour voir les catégories disponibles.</div>";
    partsDiv.innerHTML =
      "<div class='placeholder'>Clique sur une catégorie pour afficher les pièces TecDoc.</div>";
    if (vehicleInfo) {
      vehicleInfo.textContent = "Aucun véhicule sélectionné.";
    }
    lastParts = [];

    if (!mfrId || !modelSeriesId) return;

    const url = `${apiBase}/vehicles?mfrId=${encodeURIComponent(
      mfrId
    )}&modelSeriesId=${encodeURIComponent(modelSeriesId)}`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          console.error("Erreur API /vehicles:", data.error);
          return;
        }
        data.vehicles.forEach((v) => {
          const opt = document.createElement("option");
          opt.value = v.linkageTargetId;
          const label = `${v.description} (${v.beginYearMonth || "?"} - ${
            v.endYearMonth || "?"
          })`;
          opt.textContent = label;
          vehicleSelect.appendChild(opt);
        });
      })
      .catch((err) => {
        console.error("Erreur réseau /vehicles:", err);
      });
  });

  // --- 4) Quand un véhicule est sélectionné : charger l’arbre catégories/sous-catégories ---
  vehicleSelect.addEventListener("change", () => {
    const vehicleId = vehicleSelect.value;

    categoriesDiv.innerHTML =
      "<div class='placeholder'>Chargement des catégories...</div>";
    partsDiv.innerHTML =
      "<div class='placeholder'>Clique sur une catégorie pour afficher les pièces TecDoc.</div>";
    lastParts = [];

    if (!vehicleId) {
      if (vehicleInfo) {
        vehicleInfo.textContent = "Aucun véhicule sélectionné.";
      }
      return;
    }

    const brandText =
      brandSelect.options[brandSelect.selectedIndex]?.textContent || "";
    const modelText =
      modelSelect.options[modelSelect.selectedIndex]?.textContent || "";
    const vehicleText =
      vehicleSelect.options[vehicleSelect.selectedIndex]?.textContent || "";

    if (vehicleInfo) {
      vehicleInfo.textContent = `Véhicule sélectionné : ${brandText} ${modelText} – ${vehicleText}`;
    }

    fetch(
      `${apiBase}/assembly-groups?vehicleId=${encodeURIComponent(vehicleId)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          console.error("Erreur API /assembly-groups:", data.error);
          categoriesDiv.innerHTML =
            "<div class='placeholder'>Impossible de charger les catégories.</div>";
          return;
        }

        const groups = data.groups || [];
        if (!groups.length) {
          categoriesDiv.innerHTML =
            "<div class='placeholder'>Aucune catégorie trouvée pour ce véhicule.</div>";
          return;
        }

        // Séparer parents / enfants
        const parents = groups.filter(
          (g) => !g.parentNodeId || g.parentNodeId === 0
        );
        const childrenByParent = {};
        groups.forEach((g) => {
          if (g.parentNodeId && g.parentNodeId !== 0) {
            if (!childrenByParent[g.parentNodeId]) {
              childrenByParent[g.parentNodeId] = [];
            }
            childrenByParent[g.parentNodeId].push(g);
          }
        });

        categoriesDiv.innerHTML = "";

        parents.forEach((parent) => {
          const groupBlock = document.createElement("div");
          groupBlock.className = "category-group";

          const parentTitle = document.createElement("div");
          parentTitle.className = "category-parent";
          parentTitle.textContent = parent.assemblyGroupName;
          groupBlock.appendChild(parentTitle);

          const childrenContainer = document.createElement("div");
          childrenContainer.className = "category-children";

          const children =
            childrenByParent[parent.assemblyGroupNodeId] || [];

          if (!children.length) {
            const item = document.createElement("div");
            item.className = "category-item";
            item.textContent = parent.assemblyGroupName;
            item.dataset.groupId = parent.assemblyGroupNodeId;

            item.addEventListener("click", () => {
              document
                .querySelectorAll(".category-item")
                .forEach((el) => el.classList.remove("active"));
              item.classList.add("active");

              loadParts(
                vehicleId,
                parent.assemblyGroupNodeId,
                parent.assemblyGroupName
              );
            });

            childrenContainer.appendChild(item);
          } else {
            children.forEach((child) => {
              const item = document.createElement("div");
              item.className = "category-item";
              item.textContent = child.assemblyGroupName;
              item.dataset.groupId = child.assemblyGroupNodeId;

              item.addEventListener("click", () => {
                document
                  .querySelectorAll(".category-item")
                  .forEach((el) => el.classList.remove("active"));
                item.classList.add("active");

                loadParts(
                  vehicleId,
                  child.assemblyGroupNodeId,
                  child.assemblyGroupName
                );
              });

              childrenContainer.appendChild(item);
            });
          }

          groupBlock.appendChild(childrenContainer);
          categoriesDiv.appendChild(groupBlock);
        });
      })
      .catch((err) => {
        console.error("Erreur réseau /assembly-groups:", err);
        categoriesDiv.innerHTML =
          "<div class='placeholder'>Erreur de chargement des catégories.</div>";
      });
  });

  // --- 5) Chargement des pièces d’une catégorie / sous-catégorie ---
  function loadParts(vehicleId, groupId, groupName) {
    partsDiv.innerHTML =
      "<div class='placeholder'>Chargement des pièces...</div>";

    const url = `${apiBase}/parts?vehicleId=${encodeURIComponent(
      vehicleId
    )}&groupId=${encodeURIComponent(groupId)}&perPage=20&page=1`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          console.error("Erreur API /parts:", data.error);
          partsDiv.innerHTML =
            "<div class='placeholder'>Impossible de charger les pièces.</div>";
          return;
        }

        lastParts = data.articles || [];

        if (!lastParts.length) {
          partsDiv.innerHTML =
            "<div class='placeholder'>Aucune pièce trouvée pour cette catégorie.</div>";
          return;
        }

        renderParts(lastParts, groupName);
      })
      .catch((err) => {
        console.error("Erreur réseau /parts:", err);
        partsDiv.innerHTML =
          "<div class='placeholder'>Erreur de chargement des pièces.</div>";
      });
  }

  // --- 6) Rendu des pièces en grille + clic = fiche produit ---
  function renderParts(list, groupName) {
    partsDiv.innerHTML = "";

    list.forEach((a) => {
      const card = document.createElement("div");
      card.className = "part-card";

      const imgDiv = document.createElement("div");
      imgDiv.className = "part-image";

      const firstImage = (a.images && a.images[0]) || null;
      if (firstImage && firstImage.imageURL400) {
        const img = document.createElement("img");
        img.src = firstImage.imageURL400;
        img.alt = `${a.brandName} ${a.articleNumber}`;
        imgDiv.appendChild(img);
      } else if (firstImage && firstImage.imageURL200) {
        const img = document.createElement("img");
        img.src = firstImage.imageURL200;
        img.alt = `${a.brandName} ${a.articleNumber}`;
        imgDiv.appendChild(img);
      } else {
        imgDiv.textContent = "Img";
      }

      const infoDiv = document.createElement("div");
      infoDiv.className = "part-info";

      const title = document.createElement("div");
      title.className = "part-title";
      title.textContent = `${a.brandName} – ${a.articleNumber}`;

      const meta = document.createElement("div");
      meta.className = "part-meta";
      const generic =
        a.genericArticles && a.genericArticles.length
          ? a.genericArticles
              .map((g) => g.genericArticleDescription)
              .join(", ")
          : groupName || "";
      meta.textContent = generic;

      const oem = document.createElement("div");
      oem.className = "part-oem";
      const oemList =
        a.oemNumbers && a.oemNumbers.length
          ? a.oemNumbers
              .slice(0, 3)
              .map((o) => `${o.mfrName}: ${o.articleNumber}`)
              .join(" | ")
          : "";
      if (oemList) {
        oem.textContent = `Réf. OEM: ${oemList}`;
      }

      const actions = document.createElement("div");
      actions.className = "part-actions";
      const btnDetails = document.createElement("button");
      btnDetails.type = "button";
      btnDetails.textContent = "Voir la fiche";
      btnDetails.addEventListener("click", (e) => {
        e.stopPropagation();
        localStorage.setItem(
          "vinparts_selectedArticle",
          JSON.stringify(a)
        );
        window.location.href = "product.html";
      });
      actions.appendChild(btnDetails);

      infoDiv.appendChild(title);
      infoDiv.appendChild(meta);
      if (oemList) infoDiv.appendChild(oem);
      infoDiv.appendChild(actions);

      card.appendChild(imgDiv);
      card.appendChild(infoDiv);

      // clic sur toute la carte = fiche
      card.addEventListener("click", () => {
        localStorage.setItem("vinparts_selectedArticle", JSON.stringify(a));
        window.location.href = "product.html";
      });

      partsDiv.appendChild(card);
    });
  }

  // --- 7) Recherche OEM / référence croisée sur la liste courante ---
  function filterPartsByOem(term) {
    const t = (term || "").trim().toLowerCase();
    if (!t) {
      if (lastParts.length) {
        renderParts(lastParts);
      }
      return;
    }

    const filtered = lastParts.filter((a) => {
      let haystack =
        (a.articleNumber || "") + " " + (a.brandName || "");

      if (a.oemNumbers && a.oemNumbers.length) {
        haystack +=
          " " +
          a.oemNumbers
            .map(
              (o) =>
                (o.articleNumber || "") + " " + (o.mfrName || "")
            )
            .join(" ");
      }

      return haystack.toLowerCase().includes(t);
    });

    if (!filtered.length) {
      partsDiv.innerHTML =
        "<div class='placeholder'>Aucune pièce ne correspond à cette référence.</div>";
    } else {
      renderParts(filtered);
    }
  }

  if (oemSearchBtn && oemSearchInput) {
    oemSearchBtn.addEventListener("click", () => {
      filterPartsByOem(oemSearchInput.value);
    });

    oemSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        filterPartsByOem(oemSearchInput.value);
      }
    });
  }

  if (oemClearBtn && oemSearchInput) {
    oemClearBtn.addEventListener("click", () => {
      oemSearchInput.value = "";
      if (lastParts.length) {
        renderParts(lastParts);
      } else {
        partsDiv.innerHTML =
          "<div class='placeholder'>Clique sur une catégorie pour afficher les pièces TecDoc.</div>";
      }
    });
  }
});
