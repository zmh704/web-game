// ============================================================
// Progress Manager - Save/Load/Unlock chapters
// ============================================================

var ProgressMgr = {
  save: function () {
    var data = {
      chapters: CHAPTERS.map(function (c) { return { id: c.id, unlocked: c.unlocked } }),
      character: GS.character,
      difficulty: GS.difficulty,
      totalStars: GS.totalStars || 0
    };
    localStorage.setItem('miracleForest_progress', JSON.stringify(data));
  },
  load: function () {
    var saved = localStorage.getItem('miracleForest_progress');
    if (!saved) return;
    try {
      var data = JSON.parse(saved);
      GS.totalStars = data.totalStars || 0;
      if (data.chapters && data.chapters.length > 0) {
        data.chapters.forEach(function (savedCh) {
          var chapter = CHAPTERS.find(function (c) { return c.id === savedCh.id; });
          if (chapter) {
            chapter.unlocked = savedCh.unlocked;
          }
        });
      }
    } catch (e) {
      console.warn('加载进度失败', e);
    }
  },
  unlockChapter: function (id) {
    var chapter = CHAPTERS.find(function (c) { return c.id === id; });
    if (chapter) {
      chapter.unlocked = true;
      this.save();
    }
  }
};

// ============================================================
// Backward compatibility
// ============================================================
if (typeof window !== 'undefined') {
  window.ProgressMgr = ProgressMgr;
}
