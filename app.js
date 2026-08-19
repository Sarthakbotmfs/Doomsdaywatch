// THE ROAD TO DOOM - REACTIVE CORE APPLICATION ENGINE

(function () {
  "use strict";

  // --- STATE MANAGEMENT & LOCAL STORAGE ---
  const STORAGE_KEY = "RTD_STATE_V2";
  const DEFAULT_STATE = {
    watchedIds: [],
    ratings: {}, // { [itemId]: { rating: 5, review: "", dateWatched: "2026-08-19" } }
    activeTab: "watchlist",
    filterUniverse: "all", // all, essential, mcu, xmen, sony, phase1, phase2, phase3, phase4, phase5, phase6
    sortOrder: "release", // release, story, newest, title
    unwatchedOnly: false,
    essentialOnly: false,
    searchQuery: "",
    spoilersVisible: true,
    soundEnabled: true,
    ambientPlaying: false,
    doomClicks: 0,
    activeTrailerUrl: null,
    selectedItemDetails: null,
    selectedStubForEdit: null,
  };

  let state = loadState();

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_STATE, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn("Could not load saved state", e);
    }
    return { ...DEFAULT_STATE };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state", e);
    }
    updateBadgeStatuses();
  }

  // --- AUDIO SYNTHESIZER (Web Audio API - Zero dependencies) ---
  const AudioEngine = {
    ctx: null,
    ambientOsc: null,
    ambientGain: null,

    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
    },

    playClick() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);
      } catch (e) {}
    },

    playDoomChime() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freqs = [220, 277.18, 329.63, 440]; // A Minor chord
        freqs.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + idx * 0.04);
          gain.gain.setValueAtTime(0.12, now + idx * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.04);
          osc.stop(now + 0.6);
        });
      } catch (e) {}
    },

    playAchievement() {
      if (!state.soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25]; // C Major arpeggio
        notes.forEach((note, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(note, now + i * 0.08);
          gain.gain.setValueAtTime(0.1, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.3);
        });
      } catch (e) {}
    },

    toggleAmbient() {
      this.init();
      if (!this.ctx) return;
      if (state.ambientPlaying) {
        if (this.ambientOsc) {
          try {
            this.ambientGain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 1);
            setTimeout(() => {
              this.ambientOsc.stop();
              this.ambientOsc.disconnect();
              this.ambientOsc = null;
            }, 1000);
          } catch (e) {}
        }
        state.ambientPlaying = false;
      } else {
        try {
          if (this.ctx.state === "suspended") {
            this.ctx.resume();
          }
          this.ambientOsc = this.ctx.createOscillator();
          this.ambientGain = this.ctx.createGain();
          this.ambientOsc.type = "sine";
          this.ambientOsc.frequency.setValueAtTime(65.41, this.ctx.currentTime); // Low C drone

          // Low-pass filter for cosmic hum
          const filter = this.ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(200, this.ctx.currentTime);

          this.ambientGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
          this.ambientGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 2);

          this.ambientOsc.connect(filter);
          filter.connect(this.ambientGain);
          this.ambientGain.connect(this.ctx.destination);
          this.ambientOsc.start();
          state.ambientPlaying = true;
        } catch (e) {
          console.warn(e);
        }
      }
      renderHeaderAudioButton();
    }
  };

  // --- COUNTDOWN ENGINE ---
  function updateCountdown() {
    const target = new Date(window.DOOM_DATA.targetReleaseDate).getTime();
    const now = new Date().getTime();
    const diff = target - now;

    const daysEl = document.getElementById("countdown-days");
    const hoursEl = document.getElementById("countdown-hours");
    const minsEl = document.getElementById("countdown-mins");
    const secsEl = document.getElementById("countdown-secs");

    if (diff <= 0) {
      if (daysEl) daysEl.innerText = "00";
      if (hoursEl) hoursEl.innerText = "00";
      if (minsEl) minsEl.innerText = "00";
      if (secsEl) secsEl.innerText = "00";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (daysEl) daysEl.innerText = String(days).padStart(2, "0");
    if (hoursEl) hoursEl.innerText = String(hours).padStart(2, "0");
    if (minsEl) minsEl.innerText = String(minutes).padStart(2, "0");
    if (secsEl) secsEl.innerText = String(seconds).padStart(2, "0");

    const daysBanner = document.getElementById("doomsday-days-banner");
    if (daysBanner) {
      daysBanner.innerText = `${days} days until Avengers: Doomsday`;
    }
  }

  // --- PROGRESS CALCULATOR ---
  function updateStats() {
    const allItems = window.DOOM_DATA.items;
    const watched = state.watchedIds;

    const totalCount = allItems.length;
    const watchedCount = watched.length;
    const percentage = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;

    let totalMinutes = 0;
    let watchedMinutes = 0;

    allItems.forEach((item) => {
      totalMinutes += item.runtime;
      if (watched.includes(item.id)) {
        watchedMinutes += item.runtime;
      }
    });

    const remainingMinutes = totalMinutes - watchedMinutes;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMinsRem = remainingMinutes % 60;

    const watchedHours = Math.floor(watchedMinutes / 60);
    const watchedMinsRem = watchedMinutes % 60;

    // Fast track stats
    const shortRoadTotal = window.DOOM_DATA.shortRoadIds.length;
    const shortRoadWatched = window.DOOM_DATA.shortRoadIds.filter((id) => watched.includes(id)).length;
    const shortRoadPercentage = Math.round((shortRoadWatched / shortRoadTotal) * 100);

    // Update UI elements
    const progressFill = document.getElementById("global-progress-fill");
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }

    const statCountEl = document.getElementById("stat-watched-count");
    if (statCountEl) {
      statCountEl.innerText = `${watchedCount} / ${totalCount}`;
    }

    const statPctEl = document.getElementById("stat-percentage");
    if (statPctEl) {
      statPctEl.innerText = `${percentage}%`;
    }

    const statRemainingTimeEl = document.getElementById("stat-remaining-time");
    if (statRemainingTimeEl) {
      statRemainingTimeEl.innerText = `${remainingHours}h ${remainingMinsRem}m left`;
    }

    const statWatchedTimeEl = document.getElementById("stat-watched-time");
    if (statWatchedTimeEl) {
      statWatchedTimeEl.innerText = `${watchedHours}h ${watchedMinsRem}m watched`;
    }

    // Fast track banner
    const fastTrackStatEl = document.getElementById("stat-fast-track");
    if (fastTrackStatEl) {
      fastTrackStatEl.innerText = `${shortRoadWatched} / ${shortRoadTotal} (${shortRoadPercentage}%)`;
    }
  }

  // --- ITEM TOGGLING ---
  window.toggleWatched = function (itemId) {
    const index = state.watchedIds.indexOf(itemId);
    if (index > -1) {
      state.watchedIds.splice(index, 1);
      AudioEngine.playClick();
    } else {
      state.watchedIds.push(itemId);
      AudioEngine.playDoomChime();
      triggerConfetti();
    }
    saveState();
    updateStats();
    renderActiveTab();
    checkBadgesForNotification();
  };

  // --- SPOILER TOGGLING ---
  window.toggleSpoilers = function () {
    state.spoilersVisible = !state.spoilersVisible;
    saveState();
    renderSpoilerButton();
    renderActiveTab();
  };

  function renderSpoilerButton() {
    const btn = document.getElementById("toggle-spoilers-btn");
    if (btn) {
      if (state.spoilersVisible) {
        btn.innerHTML = `<span class="text-green-400">🛡️ Spoilers: Visible</span>`;
        document.body.classList.remove("spoilers-hidden");
      } else {
        btn.innerHTML = `<span class="text-emerald-300/70">🔒 Spoilers: Concealed</span>`;
        document.body.classList.add("spoilers-hidden");
      }
    }
  }

  // --- SOUND TOGGLING ---
  window.toggleSound = function () {
    state.soundEnabled = !state.soundEnabled;
    saveState();
    renderSoundButton();
  };

  function renderSoundButton() {
    const btn = document.getElementById("toggle-sound-btn");
    if (btn) {
      btn.innerHTML = state.soundEnabled
        ? `<span class="text-green-400">🔊 SFX On</span>`
        : `<span class="text-emerald-300/60">🔇 SFX Off</span>`;
    }
  }

  window.toggleAmbientMusic = function () {
    AudioEngine.toggleAmbient();
  };

  function renderHeaderAudioButton() {
    const btn = document.getElementById("toggle-ambient-btn");
    if (btn) {
      btn.innerHTML = state.ambientPlaying
        ? `<span class="text-amber-400 animate-pulse">⚡ Latveria Ambiance: Playing</span>`
        : `<span class="text-emerald-300/60">🌌 Latveria Ambiance: Muted</span>`;
    }
  }

  // --- DOOM MASK EASTER EGG ---
  window.handleDoomMaskClick = function () {
    state.doomClicks = (state.doomClicks || 0) + 1;
    AudioEngine.playDoomChime();

    // Visual pulse
    const logo = document.getElementById("doom-logo-container");
    if (logo) {
      logo.classList.add("scale-105", "rotate-1");
      setTimeout(() => logo.classList.remove("scale-105", "rotate-1"), 300);
    }

    if (state.doomClicks === 5) {
      showToast("👑 KNEEL BEFORE DOOM! Secret achievement unlocked!");
      AudioEngine.playAchievement();
    }
    saveState();
  };

  // --- FILTER & SORT ---
  window.setFilter = function (filter) {
    state.filterUniverse = filter;
    saveState();
    renderFilterButtons();
    renderWatchlist();
  };

  window.setSortOrder = function (order) {
    state.sortOrder = order;
    saveState();
    renderWatchlist();
  };

  window.toggleUnwatched = function () {
    state.unwatchedOnly = !state.unwatchedOnly;
    saveState();
    renderWatchlist();
  };

  window.toggleEssentialOnly = function () {
    state.essentialOnly = !state.essentialOnly;
    saveState();
    renderWatchlist();
  };

  window.handleSearch = function (e) {
    state.searchQuery = e.target.value.toLowerCase().trim();
    renderWatchlist();
  };

  // --- TAB NAVIGATION ---
  window.switchTab = function (tabName) {
    state.activeTab = tabName;
    AudioEngine.playClick();
    saveState();

    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add("bg-green-600", "text-white", "shadow-lg", "shadow-green-600/30");
        btn.classList.remove("text-emerald-300/70", "hover:text-green-400");
      } else {
        btn.classList.remove("bg-green-600", "text-white", "shadow-lg", "shadow-green-600/30");
        btn.classList.add("text-emerald-300/70", "hover:text-green-400");
      }
    });

    document.querySelectorAll(".tab-content-panel").forEach((panel) => {
      panel.classList.add("hidden");
    });

    const activePanel = document.getElementById(`tab-panel-${tabName}`);
    if (activePanel) {
      activePanel.classList.remove("hidden");
    }

    renderActiveTab();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function renderActiveTab() {
    if (state.activeTab === "watchlist") {
      renderWatchlist();
    } else if (state.activeTab === "fasttrack") {
      renderFastTrack();
    } else if (state.activeTab === "doomsday") {
      renderDoomsdayDossier();
    } else if (state.activeTab === "characters") {
      renderCharacters();
    } else if (state.activeTab === "wall") {
      renderStubWall();
    } else if (state.activeTab === "badges") {
      renderBadges();
    } else if (state.activeTab === "lore") {
      renderLore();
    } else if (state.activeTab === "creator") {
      renderCreator();
    }
  }

  // --- CREATOR & SUPPORT RENDER ---
  function renderCreator() {
    const container = document.getElementById("creator-container");
    if (!container) return;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Creator Bio Card -->
        <div class="doom-card rounded-2xl p-6 sm:p-8 border border-green-500/40 relative overflow-hidden bg-gradient-to-br from-emerald-950/40 via-[var(--doom-card)] to-black">
          <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div class="relative flex-shrink-0">
              <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-950 p-1 border-2 border-green-400 shadow-xl shadow-green-950/60 flex items-center justify-center text-4xl select-none">
                👨‍💻
              </div>
              <span class="absolute -bottom-2 -right-2 bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                14 YO DEV
              </span>
            </div>

            <div class="space-y-2 flex-1">
              <div class="flex flex-wrap items-center justify-center sm:justify-between gap-2">
                <div>
                  <h3 class="doom-display text-2xl sm:text-3xl font-black text-white">Sarthak Tiwari</h3>
                  <p class="text-xs text-green-400 font-semibold tracking-wide">14-Year-Old Creator & Full-Stack Builder</p>
                </div>
                <span class="text-xs px-3 py-1 rounded-full bg-emerald-950 border border-emerald-700/60 text-emerald-300">
                  Marvel & MCU Enthusiast
                </span>
              </div>

              <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed pt-2">
                Hey there! I am Sarthak Tiwari, a 14-year-old student and passionate developer. I created <strong>The Road to Doom</strong> to build the ultimate, cleanest, and most responsive MCU watch tracker ahead of <em>Avengers: Doomsday</em> — cutting out the filler, preserving the essential multiversal narrative spine, and adding cool features like synthesized audio, holographic stubs, and comic lore research.
              </p>
            </div>
          </div>
        </div>

        <!-- Support & Donation Card -->
        <div class="doom-card rounded-2xl p-6 sm:p-8 border border-amber-500/40 text-center bg-gradient-to-b from-amber-950/20 via-[var(--doom-card)] to-black">
          <span class="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-2">Support the Creator</span>
          <h4 class="doom-display text-2xl font-bold text-white mb-2">Enjoying The Road to Doom?</h4>
          <p class="text-xs sm:text-sm text-[var(--doom-muted)] max-w-lg mx-auto mb-6 leading-relaxed">
            If this guide helps you prepare for <em>Avengers: Doomsday</em>, consider supporting my coding journey with a warm cup of chai! Every contribution fuels more open-source tools and updates.
          </p>

          <div class="flex justify-center">
            <a href="https://buymeachai.ezee.li/Sarthakbroke" target="_blank" rel="noopener noreferrer" class="inline-block transition-transform duration-300 hover:scale-105 active:scale-95 shadow-xl shadow-amber-500/20 rounded-xl overflow-hidden">
              <img src="https://buymeachai.ezee.li/assets/images/buymeachai-button.png" alt="Buy Me A Chai" width="200" class="block">
            </a>
          </div>
        </div>

        <!-- Project Story Card -->
        <div class="doom-card rounded-xl p-5 border border-[var(--doom-border)] space-y-3">
          <h4 class="font-bold text-sm text-green-400">Why was this created?</h4>
          <p class="text-xs text-emerald-200/80 leading-relaxed">
            Most MCU trackers either list 90+ releases with no distinction for relevance, or ignore key comic lore like Incursions and Secret Wars. This project was built from scratch using clean vanilla web standards, Web Audio API, and verified Marvel storylines to give every fan the best preparation journey possible.
          </p>
        </div>
      </div>
    `;
  }

  // --- FILTER BUTTONS RENDER ---
  function renderFilterButtons() {
    const filters = [
      { id: "all", label: "All Titles", count: window.DOOM_DATA.items.length },
      { id: "essential", label: "⭐ Essential Road", count: window.DOOM_DATA.items.filter((i) => i.essential).length },
      { id: "mcu", label: "MCU Canon", count: window.DOOM_DATA.items.filter((i) => i.universe === "mcu").length },
      { id: "xmen", label: "Fox Mutants", count: window.DOOM_DATA.items.filter((i) => i.universe === "xmen").length },
      { id: "sony", label: "Sony Spider-Verse", count: window.DOOM_DATA.items.filter((i) => i.universe === "sony").length },
      { id: "movies", label: "Movies Only", count: window.DOOM_DATA.items.filter((i) => i.type === "movie").length },
      { id: "series", label: "Required Series Only", count: window.DOOM_DATA.items.filter((i) => i.type === "series").length },
      { id: "phase1", label: "Phase 1", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 1").length },
      { id: "phase2", label: "Phase 2", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 2").length },
      { id: "phase3", label: "Phase 3", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 3").length },
      { id: "phase4", label: "Phase 4", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 4").length },
      { id: "phase5", label: "Phase 5", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 5").length },
      { id: "phase6", label: "Phase 6", count: window.DOOM_DATA.items.filter((i) => i.phase === "Phase 6").length },
    ];

    const container = document.getElementById("filter-buttons-container");
    if (!container) return;

    container.innerHTML = filters
      .map((f) => {
        const active = state.filterUniverse === f.id;
        return `
        <button 
          type="button" 
          onclick="window.setFilter('${f.id}')"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all border ${
            active
              ? "bg-green-600 border-green-500 text-white shadow-sm shadow-green-500/20"
              : "bg-[var(--doom-card)] border-[var(--doom-border)] text-emerald-300/80 hover:border-green-500/50 hover:text-green-300"
          }">
          <span>${f.label}</span>
          <span class="text-[10px] px-1 py-0.2 rounded-full ${active ? "bg-green-800 text-green-100" : "bg-[var(--doom-dark)] text-emerald-400/60"}">${f.count}</span>
        </button>
      `;
      })
      .join("");
  }

  // --- WATCHLIST RENDER ENGINE ---
  function renderWatchlist() {
    const listContainer = document.getElementById("watchlist-items-container");
    if (!listContainer) return;

    let items = [...window.DOOM_DATA.items];

    // Filter by Universe/Category
    if (state.filterUniverse === "essential") {
      items = items.filter((i) => i.essential);
    } else if (state.filterUniverse === "mcu") {
      items = items.filter((i) => i.universe === "mcu");
    } else if (state.filterUniverse === "xmen") {
      items = items.filter((i) => i.universe === "xmen");
    } else if (state.filterUniverse === "sony") {
      items = items.filter((i) => i.universe === "sony");
    } else if (state.filterUniverse === "movies") {
      items = items.filter((i) => i.type === "movie");
    } else if (state.filterUniverse === "series") {
      items = items.filter((i) => i.type === "series");
    } else if (state.filterUniverse.startsWith("phase")) {
      const phaseNum = state.filterUniverse.replace("phase", "Phase ");
      items = items.filter((i) => i.phase === phaseNum);
    }

    // Filter unwatched
    if (state.unwatchedOnly) {
      items = items.filter((i) => !state.watchedIds.includes(i.id));
    }

    // Filter essential toggle
    if (state.essentialOnly) {
      items = items.filter((i) => i.essential);
    }

    // Search query
    if (state.searchQuery) {
      const q = state.searchQuery;
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.year.toString().includes(q) ||
          (i.synopsis && i.synopsis.toLowerCase().includes(q)) ||
          (i.keyCharacters && i.keyCharacters.some((c) => c.toLowerCase().includes(q))) ||
          (i.doomConnection && i.doomConnection.toLowerCase().includes(q))
      );
    }

    // Sort order
    if (state.sortOrder === "release") {
      items.sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
    } else if (state.sortOrder === "story") {
      items.sort((a, b) => a.storyOrder - b.storyOrder);
    } else if (state.sortOrder === "newest") {
      items.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    } else if (state.sortOrder === "title") {
      items.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (items.length === 0) {
      listContainer.innerHTML = `
        <div class="doom-card rounded-xl p-8 text-center text-emerald-400/60 border border-[var(--doom-border)]">
          <div class="text-3xl mb-2">🔍</div>
          <h3 class="text-base font-semibold text-[var(--foreground)]">No titles found</h3>
          <p class="text-xs text-[var(--doom-muted)] mt-1">Try relaxing your search terms or active filters.</p>
          <button onclick="window.setFilter('all'); state.searchQuery=''; document.getElementById('title-search-input').value=''; renderWatchlist();" class="mt-4 px-4 py-2 bg-green-700/50 hover:bg-green-600 text-xs rounded-md text-white">Reset Filters</button>
        </div>
      `;
      return;
    }

    // Grouping by Phase/Category if Release Order or Story Order
    let html = "";
    let currentGroup = null;

    items.forEach((item, index) => {
      const isWatched = state.watchedIds.includes(item.id);
      const isShortRoad = window.DOOM_DATA.shortRoadIds.includes(item.id);
      const hours = Math.floor(item.runtime / 60);
      const mins = item.runtime % 60;
      const timeStr = `${hours}h ${mins}m`;

      // Group header
      const groupKey = state.sortOrder === "story" ? "Chronological Storyline Order" : item.phase || "Multiverse & Legacy";
      if (groupKey !== currentGroup && state.sortOrder !== "newest" && state.sortOrder !== "title") {
        currentGroup = groupKey;
        const groupItems = items.filter((it) => (state.sortOrder === "story" ? true : (it.phase || "Multiverse & Legacy") === currentGroup));
        const groupWatched = groupItems.filter((it) => state.watchedIds.includes(it.id)).length;
        
        html += `
          <div class="mt-8 mb-3 flex items-baseline justify-between gap-3 px-1">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-green-500"></span>
              <h3 class="text-xs font-semibold uppercase tracking-wider text-green-400">${currentGroup}</h3>
            </div>
            <span class="text-xs tabular-nums text-[var(--doom-muted)]">${groupWatched} / ${groupItems.length} watched</span>
          </div>
        `;
      }

      // Card item
      html += `
        <div class="doom-card rounded-xl border border-[var(--doom-border)] mb-3 overflow-hidden transition-all ${
          isWatched ? "bg-[#0b140f]/90 border-green-900/60" : ""
        }" id="card-item-${item.id}">
          <!-- Main Bar -->
          <div class="flex items-center gap-3 p-3 sm:p-4">
            <!-- Watched Checkbox -->
            <button 
              type="button" 
              onclick="window.toggleWatched('${item.id}')"
              class="flex-shrink-0 flex items-center justify-center h-6 w-6 rounded border-2 transition-all cursor-pointer ${
                isWatched
                  ? "bg-green-500 border-green-400 text-black shadow-md shadow-green-500/30"
                  : "border-[var(--doom-border)] hover:border-green-400 text-transparent"
              }"
              aria-label="Mark ${item.title} as watched">
              <svg class="h-4 w-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </button>

            <!-- Title & Metadata clickable to expand -->
            <div class="min-w-0 flex-1 cursor-pointer" onclick="window.toggleCardDetails('${item.id}')">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-medium text-sm sm:text-base ${isWatched ? "text-green-300 line-through opacity-80" : "text-[var(--foreground)]"}">
                  ${item.title}
                </h4>
                <span class="text-xs text-[var(--doom-muted)]">(${item.year})</span>
                
                ${
                  item.type === "series"
                    ? `<span class="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-semibold tracking-wider uppercase">Essential Series</span>`
                    : ""
                }
                ${
                  isShortRoad
                    ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-semibold flex items-center gap-1">🔥 Fast Track</span>`
                    : ""
                }
              </div>
              
              <div class="flex flex-wrap items-center gap-3 mt-1 text-xs text-[var(--doom-muted)]">
                <span class="tabular-nums">⏱️ ${timeStr}</span>
                <span>•</span>
                <span class="uppercase tracking-wider text-[10px]">${item.universe.toUpperCase()}</span>
                ${item.incursionRisk ? `<span>•</span><span class="text-amber-400/80 text-[10px]">Incursion Risk: ${item.incursionRisk}</span>` : ""}
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1 sm:gap-2">
              ${
                item.trailerUrl
                  ? `
                <button 
                  type="button" 
                  onclick="window.openTrailerModal('${item.trailerUrl}', '${encodeURIComponent(item.title)}')"
                  title="Watch Trailer"
                  class="p-2 text-[var(--doom-muted)] hover:text-green-400 hover:bg-[var(--doom-dark)] rounded transition-colors">
                  <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </button>
              `
                  : ""
              }
              
              <button 
                type="button" 
                onclick="window.openStubEditor('${item.id}')"
                title="Create Ticket Stub / Review"
                class="p-2 text-[var(--doom-muted)] hover:text-amber-400 hover:bg-[var(--doom-dark)] rounded transition-colors">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg>
              </button>

              <button 
                type="button" 
                onclick="window.toggleCardDetails('${item.id}')"
                class="p-2 text-green-400/70 hover:text-green-400 rounded transition-transform"
                id="toggle-btn-${item.id}">
                <svg class="h-4 w-4 transition-transform duration-300" id="arrow-${item.id}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Expandable Details Section -->
          <div class="hidden border-t border-[var(--doom-border)] bg-[var(--doom-dark)]/70 p-4 space-y-4" id="details-${item.id}">
            <!-- Synopsis -->
            <div>
              <h5 class="text-xs uppercase font-semibold tracking-wider text-green-400 mb-1">Synopsis</h5>
              <p class="text-xs sm:text-sm text-emerald-200/80 leading-relaxed spoiler-text">${item.synopsis || "No synopsis available."}</p>
            </div>

            <!-- Why it matters for Doomsday -->
            <div class="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/40">
              <h5 class="text-xs uppercase font-semibold tracking-wider text-amber-400 flex items-center gap-1.5 mb-1">
                <span>⚡</span> The Road to Doom Significance
              </h5>
              <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed spoiler-text">${item.doomConnection || "Key character progression and multiversal groundwork."}</p>
            </div>

            <!-- Post Credits Scene -->
            ${
              item.postCredits
                ? `
              <div class="p-3 rounded-lg bg-black/40 border border-[var(--doom-border)]">
                <h5 class="text-xs uppercase font-semibold tracking-wider text-green-400 flex items-center gap-1.5 mb-1">
                  <span>🎬</span> Post-Credits Scene & Sequel Clues
                </h5>
                <p class="text-xs sm:text-sm text-[var(--doom-muted)] leading-relaxed spoiler-text">${item.postCredits}</p>
              </div>
            `
                : ""
            }

            <!-- Characters Appearing -->
            ${
              item.keyCharacters && item.keyCharacters.length > 0
                ? `
              <div>
                <h5 class="text-xs uppercase font-semibold tracking-wider text-[var(--doom-muted)] mb-2">Key Characters</h5>
                <div class="flex flex-wrap gap-1.5">
                  ${item.keyCharacters
                    .map(
                      (char) => `
                    <span class="text-[11px] px-2 py-0.5 rounded bg-[var(--doom-card)] border border-[var(--doom-border)] text-emerald-300">${char}</span>
                  `
                    )
                    .join("")}
                </div>
              </div>
            `
                : ""
            }

            <!-- Quick Stub / Rating Display -->
            ${
              state.ratings[item.id]
                ? `
              <div class="pt-2 border-t border-[var(--doom-border)] flex items-center justify-between text-xs">
                <div class="flex items-center gap-2">
                  <span class="text-amber-400 font-bold">Your Rating: ${"⭐".repeat(state.ratings[item.id].rating || 0)}</span>
                  ${state.ratings[item.id].review ? `<span class="text-[var(--doom-muted)] italic">"${state.ratings[item.id].review}"</span>` : ""}
                </div>
                <button onclick="window.openStubEditor('${item.id}')" class="text-green-400 hover:underline text-[11px]">Edit Stub</button>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  }

  window.toggleCardDetails = function (itemId) {
    const details = document.getElementById(`details-${itemId}`);
    const arrow = document.getElementById(`arrow-${itemId}`);
    if (details) {
      if (details.classList.contains("hidden")) {
        details.classList.remove("hidden");
        if (arrow) arrow.classList.add("rotate-180");
      } else {
        details.classList.add("hidden");
        if (arrow) arrow.classList.remove("rotate-180");
      }
    }
  };

  // --- FAST TRACK SHORT ROAD RENDER ---
  function renderFastTrack() {
    const container = document.getElementById("fasttrack-items-container");
    if (!container) return;

    const shortIds = window.DOOM_DATA.shortRoadIds;
    const allItems = window.DOOM_DATA.items;
    const fastItems = shortIds.map((id) => allItems.find((i) => i.id === id)).filter(Boolean);

    let totalFastRuntime = fastItems.reduce((acc, it) => acc + it.runtime, 0);
    let totalFastHours = Math.floor(totalFastRuntime / 60);

    let html = `
      <div class="doom-card rounded-xl p-6 border border-green-500/40 bg-gradient-to-br from-emerald-950/30 to-black/80 mb-6">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 class="doom-display text-xl font-bold text-green-400">Marvel's Shortest Road to Avengers: Doomsday</h3>
            <p class="text-xs sm:text-sm text-[var(--doom-muted)] mt-1">
              Curated by Marvel Studios: 16 essential titles (${totalFastHours} hours total) to understand Doctor Doom, the Multiverse collapse, and the Battleworld crisis.
            </p>
          </div>
          <div class="text-right">
            <span class="text-2xl font-bold text-green-400 tabular-nums">${fastItems.filter((i) => state.watchedIds.includes(i.id)).length} / ${fastItems.length}</span>
            <p class="text-xs text-[var(--doom-muted)]">Completed</p>
          </div>
        </div>
      </div>

      <div class="space-y-4 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-green-500/20">
    `;

    fastItems.forEach((item, index) => {
      const isWatched = state.watchedIds.includes(item.id);
      const hours = Math.floor(item.runtime / 60);
      const mins = item.runtime % 60;

      html += `
        <div class="relative flex items-start gap-4 pl-2">
          <!-- Step Number Bubble -->
          <div class="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            isWatched
              ? "bg-green-600 border-green-400 text-white shadow-lg shadow-green-600/40"
              : "bg-[var(--doom-dark)] border-[var(--doom-border)] text-emerald-300"
          }">
            <span class="text-xs font-bold">${index + 1}</span>
          </div>

          <!-- Card Content -->
          <div class="doom-card flex-1 rounded-xl p-4 border border-[var(--doom-border)] hover:border-green-500/60 transition-all ${
            isWatched ? "bg-[#0b140f]/90" : ""
          }">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h4 class="font-bold text-sm sm:text-base ${isWatched ? "text-green-300 line-through opacity-80" : "text-[var(--foreground)]"}">
                  ${item.title}
                </h4>
                <div class="flex items-center gap-2 text-xs text-[var(--doom-muted)]">
                  <span>${item.year}</span>
                  <span>•</span>
                  <span>${hours}h ${mins}m</span>
                  <span>•</span>
                  <span class="uppercase">${item.universe}</span>
                </div>
              </div>

              <button 
                type="button" 
                onclick="window.toggleWatched('${item.id}')"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  isWatched
                    ? "bg-green-900/60 border border-green-500 text-green-300"
                    : "bg-green-600 hover:bg-green-500 text-white shadow-md shadow-green-600/30"
                }">
                ${isWatched ? "✓ Watched" : "Mark Watched"}
              </button>
            </div>

            <p class="text-xs text-emerald-100/90 leading-relaxed spoiler-text mb-2">${item.doomConnection}</p>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  // --- DOOMSDAY DOSSIER RENDER ---
  function renderDoomsdayDossier() {
    const container = document.getElementById("doomsday-dossier-container");
    if (!container) return;

    container.innerHTML = `
      <!-- Banner Section -->
      <div class="doom-card rounded-2xl p-6 sm:p-8 border border-green-500/40 relative overflow-hidden mb-8">
        <div class="relative z-10 max-w-2xl">
          <span class="text-xs font-bold uppercase tracking-widest text-green-400">The Multiverse Saga Climax</span>
          <h2 class="doom-display text-3xl sm:text-5xl font-black text-white mt-1 mb-3">AVENGERS: DOOMSDAY</h2>
          <p class="text-sm text-emerald-200/80 leading-relaxed mb-6">
            Directed by <strong class="text-green-300">Anthony and Joe Russo</strong> • Written by <strong class="text-green-300">Stephen McFeely</strong> • Marvel Studios
          </p>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div class="doom-card p-3 rounded-lg border border-[var(--doom-border)]">
              <span class="block text-[10px] uppercase text-[var(--doom-muted)]">Release Date</span>
              <span class="text-xs font-bold text-white">Dec 18, 2026</span>
            </div>
            <div class="doom-card p-3 rounded-lg border border-[var(--doom-border)]">
              <span class="block text-[10px] uppercase text-[var(--doom-muted)]">Main Antagonist</span>
              <span class="text-xs font-bold text-green-400">Victor Von Doom</span>
            </div>
            <div class="doom-card p-3 rounded-lg border border-[var(--doom-border)]">
              <span class="block text-[10px] uppercase text-[var(--doom-muted)]">Portrayed By</span>
              <span class="text-xs font-bold text-amber-400">Robert Downey Jr.</span>
            </div>
            <div class="doom-card p-3 rounded-lg border border-[var(--doom-border)]">
              <span class="block text-[10px] uppercase text-[var(--doom-muted)]">Next Chapter</span>
              <span class="text-xs font-bold text-white">Secret Wars (2027)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Trailer Section -->
      <div class="mb-10">
        <h3 class="text-xs font-bold uppercase tracking-widest text-[var(--doom-muted)] mb-3 flex items-center gap-2">
          <span>🎬</span> Official Teaser / Trailer
        </h3>
        <div class="aspect-video w-full overflow-hidden rounded-xl border border-[var(--doom-border)] bg-black">
          <iframe 
            src="https://www.youtube-nocookie.com/embed/-JrbS8ZpTFQ?rel=0" 
            title="Avengers Doomsday Teaser" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen 
            class="h-full w-full">
          </iframe>
        </div>
      </div>

      <!-- Deep Dive Q&A -->
      <div class="space-y-4 mb-10">
        <div class="doom-card p-5 rounded-xl border border-[var(--doom-border)]">
          <h4 class="font-bold text-base text-green-400 mb-2">🎭 Who is Victor Von Doom in the MCU?</h4>
          <p class="text-xs sm:text-sm text-emerald-200/90 leading-relaxed">
            Robert Downey Jr. returns to Marvel not as Iron Man, but as Victor Von Doom, monarch of Latveria and master of both cosmic science and dark sorcery. 
            Originating in the retro-future universe alongside the Fantastic Four, Doom believes the heroes of Earth-616 have lived "stolen lives" and seeks to prevent universal extinction by imposing absolute authoritarian order over the dying multiverse.
          </p>
        </div>

        <div class="doom-card p-5 rounded-xl border border-[var(--doom-border)]">
          <h4 class="font-bold text-base text-green-400 mb-2">🌌 Why are Multiversal Incursions Happening?</h4>
          <p class="text-xs sm:text-sm text-emerald-200/90 leading-relaxed">
            As introduced in <em>Doctor Strange in the Multiverse of Madness</em> and <em>Loki</em>, excessive dimensional travel and timeline interference cause the boundaries between realities to erode. When two universes touch, an Incursion begins — inexorably drawing their Earths together until both are annihilated unless one is destroyed or harnessed by an omnipotent power.
          </p>
        </div>

        <div class="doom-card p-5 rounded-xl border border-[var(--doom-border)]">
          <h4 class="font-bold text-base text-green-400 mb-2">🔄 The Pivot from Kang to Doctor Doom</h4>
          <p class="text-xs sm:text-sm text-emerald-200/90 leading-relaxed">
            Originally titled <em>Avengers: The Kang Dynasty</em>, Marvel Studios shifted direction following Jonathan Majors' departure in December 2023. Marvel enlisted the Russo Brothers and Robert Downey Jr. at San Diego Comic-Con 2024 to bring Marvel's most iconic and revered comic book villain — Doctor Doom — into center stage.
          </p>
        </div>
      </div>
    `;
  }

  // --- CHARACTERS MATRIX RENDER ---
  function renderCharacters() {
    const container = document.getElementById("characters-matrix-container");
    if (!container) return;

    const chars = window.DOOM_DATA.characters;

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${chars
          .map(
            (c) => `
          <div class="doom-card rounded-xl p-5 border border-[var(--doom-border)] hover:border-green-500/60 transition-all flex flex-col justify-between">
            <div>
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h4 class="font-bold text-base text-green-300">${c.name}</h4>
                  <p class="text-xs text-amber-400 font-medium">${c.actor}</p>
                </div>
                <span class="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 uppercase font-semibold">
                  ${c.threatLevel}
                </span>
              </div>

              <div class="space-y-2 text-xs text-[var(--doom-muted)] mb-3">
                <div class="flex gap-2">
                  <span class="text-[var(--foreground)] font-semibold min-w-[70px]">Universe:</span>
                  <span class="text-emerald-200">${c.universe}</span>
                </div>
                <div class="flex gap-2">
                  <span class="text-[var(--foreground)] font-semibold min-w-[70px]">Status:</span>
                  <span class="text-emerald-300 font-medium">${c.status}</span>
                </div>
              </div>

              <div class="p-3 rounded-lg bg-[var(--doom-dark)] border border-[var(--doom-border)] text-xs text-emerald-100/90 leading-relaxed mb-3">
                <strong class="text-green-400 block mb-1">MCU Role in Doomsday:</strong>
                ${c.mcuRole}
              </div>
            </div>

            <div class="pt-3 border-t border-[var(--doom-border)]">
              <span class="text-[10px] uppercase tracking-wider text-[var(--doom-muted)] block mb-1">Key Appearances:</span>
              <div class="flex flex-wrap gap-1">
                ${c.essentialAppearances.map((app) => `<span class="text-[10px] px-1.5 py-0.5 bg-[var(--doom-card)] rounded text-emerald-400/80 border border-[var(--doom-border)]">${app}</span>`).join("")}
              </div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // --- STUB WALL & TICKET GENERATOR ---
  function renderStubWall() {
    const container = document.getElementById("stub-wall-container");
    if (!container) return;

    const watchedItems = window.DOOM_DATA.items.filter((i) => state.watchedIds.includes(i.id));

    if (watchedItems.length === 0) {
      container.innerHTML = `
        <div class="doom-card rounded-xl p-10 text-center border border-[var(--doom-border)]">
          <div class="text-4xl mb-3">🎟️</div>
          <h3 class="text-lg font-bold text-white">Your Stub Wall is Empty</h3>
          <p class="text-xs sm:text-sm text-[var(--doom-muted)] mt-1 max-w-md mx-auto">
            Mark movies and shows as watched to collect collectible holographic Marvel movie ticket stubs, rate them, and build your Road to Doom portfolio!
          </p>
          <button onclick="window.switchTab('watchlist')" class="mt-4 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-xs font-bold rounded-lg text-white">
            Go to Watchlist
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h3 class="doom-display text-2xl font-bold text-green-400">Your Holographic Stub Wall</h3>
          <p class="text-xs text-[var(--doom-muted)]">Showing ${watchedItems.length} collectible ticket stubs</p>
        </div>
        <button onclick="window.printStubWall()" class="px-4 py-2 bg-[var(--doom-card)] border border-[var(--doom-border)] hover:border-green-500 text-xs font-semibold rounded-lg text-emerald-300 flex items-center gap-2">
          <span>🖨️</span> Print / Save Stubs
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="printable-stub-wall">
        ${watchedItems
          .map((item) => {
            const userRating = state.ratings[item.id] || { rating: 5, review: "", dateWatched: "2026" };
            return `
            <div class="ticket-stub rounded-xl p-4 sm:p-5 border border-green-500/30 text-[var(--foreground)] flex flex-col justify-between">
              <div class="ticket-notch-left"></div>
              <div class="ticket-notch-right"></div>

              <div>
                <div class="flex items-start justify-between gap-2 border-b border-green-500/20 pb-3 mb-3">
                  <div>
                    <span class="text-[9px] uppercase tracking-widest text-green-400 font-bold">MARVEL MULTIVERSE PASS</span>
                    <h4 class="font-bold text-base sm:text-lg text-white">${item.title}</h4>
                    <span class="text-xs text-[var(--doom-muted)]">${item.year} • ${item.phase || item.universe.toUpperCase()}</span>
                  </div>
                  <div class="text-right">
                    <span class="text-xs font-bold text-amber-400">${"⭐".repeat(userRating.rating || 5)}</span>
                    <span class="block text-[9px] text-[var(--doom-muted)] mt-0.5">${userRating.dateWatched || "Watched"}</span>
                  </div>
                </div>

                ${
                  userRating.review
                    ? `<p class="text-xs text-emerald-200/90 italic mb-3">"${userRating.review}"</p>`
                    : `<p class="text-xs text-[var(--doom-muted)] italic mb-3">No personal review notes added yet.</p>`
                }
              </div>

              <div class="pt-2 border-t border-dashed border-green-500/20 flex items-center justify-between text-[10px] text-[var(--doom-muted)]">
                <span class="font-mono">ADMIT ONE • EARTH-616</span>
                <button onclick="window.openStubEditor('${item.id}')" class="text-green-400 hover:underline font-semibold">
                  Edit Note & Stars
                </button>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>
    `;
  }

  window.printStubWall = function () {
    window.print();
  };

  // --- STUB EDITOR MODAL ---
  window.openStubEditor = function (itemId) {
    const item = window.DOOM_DATA.items.find((i) => i.id === itemId);
    if (!item) return;

    state.selectedStubForEdit = itemId;
    const current = state.ratings[itemId] || { rating: 5, review: "", dateWatched: new Date().toISOString().split("T")[0] };

    const modal = document.getElementById("stub-editor-modal");
    const content = document.getElementById("stub-editor-content");
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="doom-card rounded-2xl p-6 border border-green-500/50 max-w-md w-full mx-auto bg-[var(--doom-bg)]">
        <h3 class="doom-display text-xl font-bold text-green-400 mb-1">Edit Stub: ${item.title}</h3>
        <p class="text-xs text-[var(--doom-muted)] mb-4">Set your rating and personal review for this title.</p>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-white mb-1">Your Star Rating (1 to 5):</label>
            <select id="stub-rating-select" class="w-full bg-[var(--doom-card)] border border-[var(--doom-border)] rounded-lg p-2 text-sm text-white focus:border-green-500 outline-none">
              <option value="5" ${current.rating == 5 ? "selected" : ""}>⭐⭐⭐⭐⭐ (Masterpiece)</option>
              <option value="4" ${current.rating == 4 ? "selected" : ""}>⭐⭐⭐⭐ (Great)</option>
              <option value="3" ${current.rating == 3 ? "selected" : ""}>⭐⭐⭐ (Good)</option>
              <option value="2" ${current.rating == 2 ? "selected" : ""}>⭐⭐ (Mediocre)</option>
              <option value="1" ${current.rating == 1 ? "selected" : ""}>⭐ (Skip)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-white mb-1">Date Watched:</label>
            <input type="date" id="stub-date-input" value="${current.dateWatched || ""}" class="w-full bg-[var(--doom-card)] border border-[var(--doom-border)] rounded-lg p-2 text-sm text-white focus:border-green-500 outline-none"/>
          </div>

          <div>
            <label class="block text-xs font-semibold text-white mb-1">Your Review / Notes:</label>
            <textarea id="stub-review-input" rows="3" placeholder="What did you think? Favorite scene or connection..." class="w-full bg-[var(--doom-card)] border border-[var(--doom-border)] rounded-lg p-2 text-sm text-white focus:border-green-500 outline-none">${current.review || ""}</textarea>
          </div>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-[var(--doom-border)]">
            <button onclick="window.closeStubEditor()" class="px-4 py-2 text-xs font-medium text-[var(--doom-muted)] hover:text-white">Cancel</button>
            <button onclick="window.saveStubDetails('${itemId}')" class="px-5 py-2 bg-green-600 hover:bg-green-500 text-xs font-bold text-white rounded-lg shadow-md shadow-green-600/30">Save Stub</button>
          </div>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
  };

  window.closeStubEditor = function () {
    const modal = document.getElementById("stub-editor-modal");
    if (modal) modal.classList.add("hidden");
  };

  window.saveStubDetails = function (itemId) {
    const rating = parseInt(document.getElementById("stub-rating-select").value, 10) || 5;
    const dateWatched = document.getElementById("stub-date-input").value;
    const review = document.getElementById("stub-review-input").value.trim();

    state.ratings[itemId] = { rating, dateWatched, review };
    if (!state.watchedIds.includes(itemId)) {
      state.watchedIds.push(itemId);
    }
    saveState();
    closeStubEditor();
    renderActiveTab();
    showToast("Ticket stub updated!");
  };

  // --- BADGES RENDER ---
  function renderBadges() {
    const container = document.getElementById("badges-container");
    if (!container) return;

    const badges = window.DOOM_DATA.badges;
    const allItems = window.DOOM_DATA.items;

    let unlockedCount = 0;

    const badgeCards = badges.map((badge) => {
      let isUnlocked = false;
      try {
        isUnlocked = badge.condition(state, allItems);
      } catch (e) {
        console.warn(e);
      }

      if (isUnlocked) unlockedCount++;

      return `
        <div class="doom-card rounded-xl p-4 border transition-all ${
          isUnlocked
            ? badge.category === "Secret"
              ? "badge-gold"
              : "badge-unlocked"
            : "border-[var(--doom-border)] opacity-60 bg-black/40"
        }">
          <div class="flex items-start justify-between gap-3 mb-2">
            <span class="text-xs font-bold tracking-wider ${isUnlocked ? "text-green-300" : "text-[var(--doom-muted)]"}">
              ${badge.title}
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded uppercase font-semibold ${
              isUnlocked ? "bg-green-950 border border-green-600 text-green-300" : "bg-[var(--doom-dark)] text-[var(--doom-muted)]"
            }">
              ${isUnlocked ? "UNLOCKED" : "LOCKED"}
            </span>
          </div>
          <p class="text-xs text-emerald-100/80 leading-relaxed">${badge.description}</p>
        </div>
      `;
    });

    const pct = Math.round((unlockedCount / badges.length) * 100);

    container.innerHTML = `
      <div class="doom-card rounded-xl p-6 border border-green-500/30 mb-6 bg-gradient-to-r from-emerald-950/40 to-black/80">
        <div class="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <h3 class="doom-display text-2xl font-bold text-green-400">Road to Doom Achievements</h3>
            <p class="text-xs text-[var(--doom-muted)]">Earn badges by completing MCU phases, watching essential stories, and discovering secrets.</p>
          </div>
          <div class="text-right">
            <span class="text-3xl font-bold text-green-400 tabular-nums">${unlockedCount} / ${badges.length}</span>
            <p class="text-xs text-[var(--doom-muted)]">${pct}% Complete</p>
          </div>
        </div>

        <div class="h-2 w-full rounded-full bg-[var(--doom-border)] overflow-hidden">
          <div class="h-full bg-green-500 transition-all duration-700" style="width: ${pct}%"></div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${badgeCards.join("")}
      </div>
    `;
  }

  function updateBadgeStatuses() {
    // Check if badges changed
  }

  function checkBadgesForNotification() {
    // Optional toast notification on badge earn
  }

  // --- COMIC LORE RENDER ---
  function renderLore() {
    const container = document.getElementById("comic-lore-container");
    if (!container) return;

    const lore = window.DOOM_DATA.lore;

    container.innerHTML = `
      <div class="space-y-6">
        <!-- Secret Wars 2015 -->
        <div class="doom-card rounded-xl p-6 border border-green-500/40">
          <span class="text-[10px] uppercase font-bold tracking-widest text-amber-400">The Definitive Comic Source</span>
          <h3 class="doom-display text-2xl font-bold text-white mt-1 mb-3">${lore.secretWars2015.title}</h3>
          <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed mb-4">${lore.secretWars2015.summary}</p>
          
          <div class="p-4 rounded-lg bg-emerald-950/50 border border-emerald-700/50 mb-3">
            <h4 class="font-bold text-sm text-green-300 mb-1">👑 God Emperor Doom</h4>
            <p class="text-xs text-emerald-100/90 leading-relaxed">${lore.secretWars2015.godEmperorDoom}</p>
          </div>

          <div class="p-4 rounded-lg bg-black/50 border border-[var(--doom-border)]">
            <h4 class="font-bold text-sm text-amber-300 mb-1">✨ The Ultimate Resolution</h4>
            <p class="text-xs text-[var(--doom-muted)] leading-relaxed">${lore.secretWars2015.theResolution}</p>
          </div>
        </div>

        <!-- Secret Wars 1984 -->
        <div class="doom-card rounded-xl p-6 border border-[var(--doom-border)]">
          <span class="text-[10px] uppercase font-bold tracking-widest text-green-400">Classic Marvel Origin</span>
          <h3 class="doom-display text-xl font-bold text-white mt-1 mb-2">${lore.secretWars1984.title}</h3>
          <p class="text-xs sm:text-sm text-emerald-100/80 leading-relaxed mb-3">${lore.secretWars1984.summary}</p>
          <p class="text-xs text-[var(--doom-muted)] leading-relaxed italic">${lore.secretWars1984.doomTriumph}</p>
        </div>

        <!-- Incursions Guide -->
        <div class="doom-card rounded-xl p-6 border border-[var(--doom-border)]">
          <h3 class="doom-display text-xl font-bold text-red-400 mb-2">${lore.incursionsConcept.title}</h3>
          <p class="text-xs sm:text-sm text-emerald-100/90 leading-relaxed mb-3">${lore.incursionsConcept.definition}</p>
          <p class="text-xs text-amber-300/80 leading-relaxed">${lore.incursionsConcept.mcuTriggers}</p>
        </div>
      </div>
    `;
  }

  // --- TRAILER MODAL ---
  window.openTrailerModal = function (url, title) {
    const modal = document.getElementById("trailer-modal");
    const iframe = document.getElementById("trailer-iframe");
    const titleEl = document.getElementById("trailer-modal-title");

    if (modal && iframe) {
      iframe.src = `${url}?autoplay=1`;
      if (titleEl) titleEl.innerText = decodeURIComponent(title);
      modal.classList.remove("hidden");
    }
  };

  window.closeTrailerModal = function () {
    const modal = document.getElementById("trailer-modal");
    const iframe = document.getElementById("trailer-iframe");
    if (modal && iframe) {
      iframe.src = "";
      modal.classList.add("hidden");
    }
  };

  // --- EXPORT & IMPORT BACKUP ---
  window.openBackupModal = function () {
    const modal = document.getElementById("backup-modal");
    const textarea = document.getElementById("backup-json-textarea");
    if (modal && textarea) {
      textarea.value = JSON.stringify(state, null, 2);
      modal.classList.remove("hidden");
    }
  };

  window.closeBackupModal = function () {
    const modal = document.getElementById("backup-modal");
    if (modal) modal.classList.add("hidden");
  };

  window.copyBackupJson = function () {
    const textarea = document.getElementById("backup-json-textarea");
    if (textarea) {
      textarea.select();
      navigator.clipboard.writeText(textarea.value);
      showToast("Progress JSON copied to clipboard!");
    }
  };

  window.restoreBackupJson = function () {
    const textarea = document.getElementById("backup-json-textarea");
    if (!textarea) return;
    try {
      const parsed = JSON.parse(textarea.value);
      if (parsed && Array.isArray(parsed.watchedIds)) {
        state = { ...DEFAULT_STATE, ...parsed };
        saveState();
        closeBackupModal();
        updateStats();
        renderActiveTab();
        showToast("Progress restored successfully!");
      } else {
        alert("Invalid backup data format.");
      }
    } catch (e) {
      alert("Invalid JSON format.");
    }
  };

  window.resetAllProgress = function () {
    if (confirm("Are you sure you want to reset all watch progress and ratings? This cannot be undone.")) {
      state = { ...DEFAULT_STATE };
      saveState();
      updateStats();
      renderActiveTab();
      showToast("All progress reset.");
    }
  };

  // --- TOAST NOTIFICATIONS ---
  function showToast(msg) {
    const toast = document.getElementById("global-toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.remove("opacity-0", "translate-y-4");
    toast.classList.add("opacity-100", "translate-y-0");

    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "translate-y-4");
    }, 3200);
  }

  // --- CONFETTI EFFECT ---
  function triggerConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ["#10b981", "#4ade80", "#f59e0b", "#ffffff", "#059669"];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        r: Math.random() * 5 + 2,
        d: Math.random() * 40,
        color: colors[Math.floor(Math.random() * colors.length)],
        tilt: Math.floor(Math.random() * 10) - 10,
        tiltAngleIncremental: Math.random() * 0.07 + 0.05,
        tiltAngle: 0,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.7) * 12,
        alpha: 1,
      });
    }

    let frames = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25; // gravity
        p.alpha -= 0.015;

        if (p.alpha > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2, false);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.fill();
        }
      });

      frames++;
      if (frames < 70) {
        requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    draw();
  }

  // --- INITIALIZATION ---
  window.addEventListener("DOMContentLoaded", () => {
    updateCountdown();
    setInterval(updateCountdown, 1000);

    renderSpoilerButton();
    renderSoundButton();
    renderFilterButtons();
    updateStats();
    renderActiveTab();
  });
})();
