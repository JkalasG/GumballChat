class GumballState {
  constructor() {
    this.messages = [];
    this.languageCounts = {};
    this.selectedFilter = 'all';
    this.idCounter = 0;
  }

  nextId() {
    return `gum-${++this.idCounter}`;
  }

  add(message) {
    this.messages.push(message);
    if (this.messages.length > 120) this.messages.shift();
    this.languageCounts[message.sourceLanguage] = (this.languageCounts[message.sourceLanguage] || 0) + 1;
  }

  setFilter(category) {
    this.selectedFilter = category || 'all';
  }

  snapshot(streamerLanguage) {
    return {
      messages: this.messages,
      languageCounts: this.languageCounts,
      selectedFilter: this.selectedFilter,
      streamerLanguage,
      mode: 'simulator'
    };
  }
}

module.exports = { GumballState };
