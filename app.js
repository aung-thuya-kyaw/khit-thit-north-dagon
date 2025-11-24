// gviz JSON URL for your sheet
// const sheetURL = "https://docs.google.com/spreadsheets/d/1jAwrqILCSrxqmAi7YUt9Z-MFC-MCbRjtfRxCHRjl7IY/gviz/tq?tqx=out:json";
const sheetURL = "https://docs.google.com/spreadsheets/d/1yJhIHRAXnXQHtHp0aQ_fsJu648Dd_fu9vZs41CpQ7mQ/gviz/tq?tqx=out:json";

let allData = [];

// helper: try to match a label against list of candidates (case-insensitive)
function findColIndexByLabels(cols, candidates) {
  if (!cols || !cols.length) return -1;
  const lowerCandidates = candidates.map(s => s.toLowerCase());
  for (let i = 0; i < cols.length; i++) {
    const label = (cols[i].label || "").toString().trim().toLowerCase();
    if (!label) continue;
    for (const cand of lowerCandidates) {
      if (label === cand) return i;
      // substring match to be more flexible
      if (label.includes(cand) || cand.includes(label)) return i;
    }
  }
  return -1;
}

fetch(sheetURL)
  .then(res => res.text())
  .then(raw => {
    // parse gviz JSON
    const json = JSON.parse(raw.substr(47).slice(0, -2));
    const cols = json.table.cols; // header metadata (label)
    const rows = json.table.rows;

    // Candidate header names for each field (English and Myanmar / variations)
    const ID_CANDIDATES = ["id", "ID", "Id"];
    const ADDRESS_CANDIDATES = ["adress", "လိပ်စာ", "လိပ္စာ", "Address"];
    const TYPE_CANDIDATES = ["Type Of Property", "property of type", "အိမ်/မြေကွက်", "အိမ်/မြေ", "Type"];
    const FEET_CANDIDATES = ["size", "feet", "ပေအကျယ်", "ပေအကွာ", "ပေအကျယ်", "Feet"];
    const PRICE_CANDIDATES = ["price", "ဈေး", "စျေး", "Price"];
    const STATUS_CANDIDATES = ["status", "အနေအထား", "Status"];
    const WARD_CANIDATES = ["Ward", "ward", "ရပ်ကွက်"];
    const BENEFIT_CANIDATES = ["Benefit"];


    // find header indices from cols metadata first
    let idx = {};
    idx.id = findColIndexByLabels(cols, ID_CANDIDATES);
    idx.address = findColIndexByLabels(cols, ADDRESS_CANDIDATES);
    idx.type = findColIndexByLabels(cols, TYPE_CANDIDATES);
    idx.feet = findColIndexByLabels(cols, FEET_CANDIDATES);
    idx.price = findColIndexByLabels(cols, PRICE_CANDIDATES);
    idx.status = findColIndexByLabels(cols, STATUS_CANDIDATES);
    idx.ward = findColIndexByLabels(cols, WARD_CANIDATES);
    idx.benefit = findColIndexByLabels(cols, BENEFIT_CANIDATES);

    // If cols metadata had empty labels (sometimes), fallback to using first row values as header names
    if ((idx.id === -1 || idx.price === -1 || idx.address === -1) && rows.length > 0) {
      const headerRow = rows[0].c || [];
      const headerLabels = headerRow.map(cell => (cell ? (cell.v || "").toString().trim() : ""));
      const findByHeader = (candidates) => {
        const lcands = candidates.map(s => s.toLowerCase());
        for (let i = 0; i < headerLabels.length; i++) {
          const lab = (headerLabels[i] || "").toLowerCase();
          if (!lab) continue;
          for (const c of lcands) {
            if (lab === c || lab.includes(c) || c.includes(lab)) return i;
          }
        }
        return -1;
      };

      idx.id = idx.id === -1 ? findByHeader(ID_CANDIDATES) : idx.id;
      idx.address = idx.address === -1 ? findByHeader(ADDRESS_CANDIDATES) : idx.address;
      idx.type = idx.type === -1 ? findByHeader(TYPE_CANDIDATES) : idx.type;
      idx.feet = idx.feet === -1 ? findByHeader(FEET_CANDIDATES) : idx.feet;
      idx.price = idx.price === -1 ? findByHeader(PRICE_CANDIDATES) : idx.price;
      idx.status = idx.status === -1 ? findByHeader(STATUS_CANDIDATES) : idx.status;
      idx.ward = idx.ward === -1 ? findByHeader(WARD_CANIDATES) : idx.ward;
      idx.ward = idx.ward === -1 ? findByHeader(BENEFIT_CANIDATES) : idx.benefit;
    }

    // If header detection still failed for price, attempt a best-effort guess
    if (idx.price === -1) {
      // try common positions where price often sits (e.g., index 3 or 4)
      const likely = [4, 3, 5, 2];
      for (const p of likely) {
        if (rows[0] && rows[0].c && rows[0].c[p] && rows[0].c[p].v) {
          // quick heuristic: numeric or contains digits and commas
          const sample = String(rows[0].c[p].v);
          if (/\d/.test(sample)) {
            idx.price = p;
            break;
          }
        }
      }
    }

    // Now map rows -> objects using the detected indices
    // If the first row was header labels (and we used it to find indices), skip it when building data
    const startRow = (rows.length > 0 && (idx.id !== -1 && rows[0].c && String(rows[0].c[idx.id]?.v || "").toLowerCase().includes("id"))) ? 1 : 0;

    allData = rows.slice(startRow).map((r, i) => {
      const d = r.c || [];
      const parseCell = (index) => (index >= 0 && d[index] && typeof d[index].v !== "undefined") ? d[index].v : "";

      return {
        no: i + 1,
        id: parseCell(idx.id),
        address: parseCell(idx.address),
        type: parseCell(idx.type),
        feet: parseCell(idx.feet),
        price: parseCell(idx.price),
        status: parseCell(idx.status), // still available for filter only
        ward: parseCell(idx.ward),   // ⭐ ADD THIS LINE
        benefit: parseCell(idx.benefit)
      };
    });

    // Debug: log detected indices (useful while testing)
    console.log("Detected column indices:", idx);
    renderTable(allData); // <--- slice 
  })
  .catch(err => {
    console.error("Failed to load sheet:", err);
  });

/* -------------------------
   renderTable & filters (same as before)
   ------------------------- */

function renderTable(data) {
  const body = document.getElementById("tableBody");
  const countBox = document.getElementById("listingCount");

  // old update listing count
  // countBox.textContent = "Total Listings: " + data.length;
  countBox.textContent = "Total Listings: " + data.length;

  const parseP = (p) => Number(String(p).replace(/[^\d.]/g, "")) || 0;

  // Extract numeric prices
  const prices = data.map(item => parseP(item.price)).filter(n => n > 0);

  // Average price (mean)
  let avg = 0;
  if (prices.length > 0) {
    avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  }
  document.getElementById("avgPrice").textContent = "Average Price: " + avg + " သိန်း";

  // Median price
  let median = 0;
  if (prices.length > 0) {
    const sorted = prices.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    median = sorted.length % 2 !== 0
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  document.getElementById("medianPrice").textContent = "Median Price: " + median + " သိန်း";


  body.innerHTML = "";

  const favs = getFavorites();

  data.forEach(item => {
    body.innerHTML += `
        <tr>
            <td>${item.no}</td>
            <td>${item.id}</td>
            <td>${item.type}</td>
            <td>${item.address}</td>
            <td>${item.feet}</td>
            <td>${item.price}</td>
            <td>${item.ward}</td>
            <td>
                <button class="fav-btn" onclick="toggleFav('${item.id}')">
                    ${favs.includes(item.id) ? "❤️" : "🤍"}
                </button>
            </td>
        </tr>
        `;
  });

}

/* SEARCH + FILTERS (same listeners as before) */
document.getElementById("searchInput").addEventListener("keyup", filterTable);
document.getElementById("statusFilter").addEventListener("change", filterTable);
document.getElementById("typeFilter").addEventListener("change", filterTable);
document.getElementById("priceFilter").addEventListener("change", filterTable);
document.getElementById("wardFilter").addEventListener("change", filterTable);
document.getElementById("benefitFilter").addEventListener("change", filterTable);
document.getElementById("feetFilter").addEventListener("change", filterTable);



function parsePriceNumber(priceStr) {
  if (!priceStr && priceStr !== 0) return 0;
  // remove commas, spaces, MMK, တိုက်, သိန်း etc. extract digits
  let s = String(priceStr).replace(/[,| ]+/g, "");
  // remove non-numeric except dot
  s = s.replace(/[^\d.]/g, "");
  return parseFloat(s) || 0;
}

function filterTable() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const statusF = document.getElementById("statusFilter").value;
  const typeF = document.getElementById("typeFilter").value;
  const priceF = document.getElementById("priceFilter").value;
  const wardF = document.getElementById("wardFilter").value;
  const benefitF = document.getElementById("benefitFilter").value;
  const feetF = document.getElementById("feetFilter").value;

  let filtered = allData.filter(item => {
    let ok = true;

    // search everything (id + type + address)
    if (search) {
      const text = `${item.id} ${item.type} ${item.address} ${item.feet}`.toLowerCase(); //i add feet check
      if (!text.includes(search)) ok = false;
    }

    // status
    if (statusF && item.status !== statusF) ok = false;

    // type
    if (typeF && item.type !== typeF) ok = false;

    // price range
    if (priceF) {
      const [min, max] = priceF.split("-").map(Number);
      const priceValue = parsePriceNumber(item.price);
      if (priceValue < min || priceValue > max) ok = false;
    }
    // ward filter
    if (wardF && item.ward !== wardF) ok = false;

    // benefit filter 

    if (benefitF && item.benefit !== benefitF) ok = false;

    // Feet filter
    if (feetF) {
      const feetText = String(item.feet).replace(/\s+/g, "").toLowerCase();

      if (feetF === "others") {
        // Show items NOT matching known sizes
        const known = ["20x60", "30x60", "40x60", "60x80", "80x60"];
        if (known.some(size => feetText.includes(size))) ok = false;
      } else {
        // Exact size filter
        if (!feetText.includes(feetF.toLowerCase())) ok = false;
      }
    }


    return ok;
  });

  renderTable(filtered);
}

// fav icon
function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites") || "[]");
}

function saveFavorites(list) {
  localStorage.setItem("favorites", JSON.stringify(list));
}

function toggleFav(id) {
  let favs = getFavorites();

  if (favs.includes(id)) {
    favs = favs.filter(x => x !== id);
  } else {
    favs.push(id);
  }

  saveFavorites(favs);
  renderFavorites();
}

// Render Fav icon

function renderFavorites() {
  const favBody = document.getElementById("favBody");
  const favs = getFavorites();

  favBody.innerHTML = "";

  const favList = allData.filter(item => favs.includes(item.id));

  favList.forEach((item, index) => {
    favBody.innerHTML += `
        <tr>
            <td>${index + 1}</td>
            <td>${item.id}</td>
            <td>${item.type}</td>
            <td>${item.address}</td>
            <td>${item.feet}</td>
            <td>${item.price}</td>
            <td>${item.ward}</td>
        </tr>
        `;
  });
}

renderFavorites();

// Save fav permantely

function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites") || "[]");
}

function saveFavorites(list) {
  localStorage.setItem("favorites", JSON.stringify(list));
}

// toggle fav for each property

function toggleFav(id) {
  let favs = getFavorites();

  if (favs.includes(id)) {
    favs = favs.filter(x => x !== id); // remove
  } else {
    favs.push(id); // add
  }

  saveFavorites(favs);
  renderFavorites();
  renderTable(allData); // update icons
}

// Add fav for each row

// <td>
// <button class="fav-btn" onclick="toggleFav('${item.id}')">
//  ${getFavorites().includes(item.id) ? "❤️" : "🤍"}
//</button>
//</td>

// 

// function renderFavorites() {
//     const favBody = document.getElementById("favBody");
//     const favs = getFavorites();

//     favBody.innerHTML = "";

//     const favList = allData.filter(item => favs.includes(item.id));

//     favList.forEach((item, index) => {
//         favBody.innerHTML += `
//         <tr>
//             <td>${index + 1}</td>
//             <td>${item.id}</td>
//             <td>${item.type}</td>
//             <td>${item.address}</td>
//             <td>${item.feet}</td>
//             <td>${item.price}</td>
//         </tr>
//         `;
//     });
// }




// renderFavorites();

// top button

document.getElementById("showFavBtn").addEventListener("click", () => {
  const favs = getFavorites();
  const favList = allData.filter(item => favs.includes(item.id));
  renderTable(favList);
});

document.getElementById("showAllBtn").addEventListener("click", () => {
  renderTable(allData); // ⭐ limit to first 30
});

//remove all fav

document.getElementById("clearFavBtn").addEventListener("click", () => {
  localStorage.removeItem("favorites");   // delete permanently
  renderFavorites();                      // refresh favorites list
  renderTable(allData);                   // refresh main table hearts
  alert("All favorites have been removed ❌");
});


// nav 

document.getElementById("navFavorites").addEventListener("click", () => {
  const favs = getFavorites();
  const favList = allData.filter(item => favs.includes(item.id));
  renderTable(favList);
});

document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("menuLinks").classList.toggle("show");
});



