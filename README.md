# Project Rail Tabs

An intelligent Chrome extension that organizes your tabs into projects using a persistent vertical sidebar.

## Features

- **Intelligent Tab Classification**: Automatically groups tabs into projects using a hybrid approach:
  - Tier A: Fast deterministic matching (domain, path patterns, navigation chain)
  - Tier B: Lightweight semantic similarity (token-based)

- **Minimal UI Footprint**:
  - Collapses to a thin 12px rail
  - Expands to 320px on hover or click
  - Uses Shadow DOM for complete style isolation
  - Works on most websites without conflicts

- **Context-Aware**:
  - Tracks your active project based on recent activity
  - Uses a 30-minute rolling window
  - Boosts relevance of recently-used projects

- **Hierarchical Organization**:
  - Projects contain subprojects
  - Subprojects auto-detect based on host + path patterns
  - Example: `github.com:org/repo` becomes a subproject

- **High Performance**:
  - IndexedDB for scalable storage (handles hundreds of tabs)
  - In-memory LRU cache for hot data
  - Candidate narrowing to avoid O(n²) comparisons
  - Debounced event processing

## Installation

### Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project directory

### Watch Mode

For development with auto-rebuild:
```bash
npm run watch
```

## Architecture

### Components

- **Service Worker** (`src/sw.ts`): Manages state, listens to tab events, performs classification
- **Content Script** (`src/content.ts`): Injects Shadow DOM UI, extracts page signals
- **Rail UI** (`src/ui/rail.ts`): Renders project tree and tab list
- **Classifier** (`src/classifier/matcher.ts`): Hybrid scoring algorithm
- **Storage** (`src/storage/db.ts`): IndexedDB wrapper with caching

### Data Flow

1. Tab activated → Service worker receives event
2. Extract URL/title metadata → Compute token hash
3. Load projects from IndexedDB (with caching)
4. Narrow candidates by host/domain
5. Score candidates using hybrid classifier
6. Assign tab to best-matching project (or create new)
7. Update UI via message passing

### Classification Algorithm

```typescript
Score = 3.0 * hostMatch      // Exact host or domain
      + 2.0 * pathMatch      // Path prefix depth
      + 2.0 * chainProximity // Navigation chain
      + 1.5 * tokenSimilarity // Cosine + Jaccard
      + 1.0 * recencyBoost   // Active context
```

Threshold: 0.3 minimum, >0.5 for assignment, >0.8 for deterministic

## Usage

### Basic

- Hover over the rail to preview your projects
- Click to pin the panel open
- Click a tab to activate it
- Hover over a tab and click × to close it

### Project Actions (Coming Soon)

- Rename projects
- Pin important projects
- Lock project rules (prevent reassignment)
- Split/merge subprojects
- Create manual rules

## Performance

Optimized for:
- **200+ tabs**: Fast thanks to candidate narrowing and caching
- **Real-time**: Debounced events, incremental updates
- **Low memory**: LRU cache (200 tabs max), lazy embedding computation

## Limitations

- Cannot run on `chrome://` internal pages
- Page signals (H1, meta) only available on sites with permissions
- Incognito requires separate user enablement

## Roadmap

- [ ] User-configurable rules
- [ ] Project templates
- [ ] Export/import projects
- [ ] Cross-window project sync
- [ ] Optional semantic embeddings (Tier C)
- [ ] Keyboard shortcuts
- [ ] Dark/light theme toggle

## License

MIT