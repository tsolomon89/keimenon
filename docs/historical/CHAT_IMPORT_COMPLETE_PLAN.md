# Complete Chat Import Feature - Implementation Plan

## Current State ✅

### Backend (Complete)

- ✅ Chat parsers: ChatGPT, Claude, Gemini with auto-detection
- ✅ Code extraction from assistant messages
- ✅ Sources Mode: stitching user/assistant segments
- ✅ Basic deduplication (hash-based)
- ✅ Graph persistence to Neo4j
- ✅ API: `/api/v1/import/chat` and `/api/v1/import/chat/batch`

### Frontend (Partial)

- ✅ `ChatImportModal` with basic config
- ✅ File upload with drag & drop
- ✅ Wired to UI buttons

## Missing Features - Detailed Implementation

---

## Phase 1: Enhanced ChatImportModal - Exact Form Controls 🎯

### Current Modal Structure

```
[File Upload Zone]
    ↓
[Platform Detection Display] ← NEW
    ↓
[Processing/Loading Bar] ← NEW
    ↓
[Configuration Form] ← REDESIGN with exact controls
```

### 1.1 Platform Detection & Progress (NEW)

**After file selection, before form display:**

```tsx
// Show platform detection
<div className="platform-detection">
  <CheckCircle className="text-green-500" />
  <span>Detected: ChatGPT (conversations.json)</span>
  <Badge>142 conversations found</Badge>
</div>

// Processing bar (animated)
<div className="progress-container">
  <ProgressBar
    stage="parsing" // parsing → extracting → analyzing
    percent={45}
    message="Extracting code blocks from messages..."
  />
</div>
```

**States:**

- Uploading → Detecting platform → Parsing → Analyzing → Ready for config

---

### 1.2 Configuration Form - EXACT CONTROLS

**Section 1: Extraction**

```tsx
<FormSection title="Extraction">
  <CheckboxGroup label="Include messages from:">
    <Checkbox value="user" defaultChecked>
      User messages
    </Checkbox>
    <Checkbox value="assistant">AI/Assistant messages</Checkbox>
  </CheckboxGroup>

  {/* Helper text */}
  <p className="text-xs text-slate-400">Select which message types to extract from conversations</p>
</FormSection>
```

**Section 2: Branches** (Critical - affects output structure)

```tsx
<FormSection title="Branches">
  <ToggleGroup type="single" value={branches}>
    <ToggleGroupItem value="merged">
      <MergeIcon /> Merged
      <p className="text-xs">Combine user + AI in same files</p>
    </ToggleGroupItem>

    <ToggleGroupItem value="separate">
      <SplitIcon /> Separate
      <p className="text-xs">Create separate files for user/AI</p>
    </ToggleGroupItem>
  </ToggleGroup>

  {/* Only show if BOTH checkboxes selected above */}
  {extraction.includes('user') && extraction.includes('assistant') && (
    <Alert className="mt-2">Separate mode will create 2 source sets per conversation</Alert>
  )}
</FormSection>
```

**Section 3: Minimum Message Length**

```tsx
<FormSection title="Minimum Message Length">
  <div className="flex items-center gap-4">
    <Input
      type="number"
      min={0}
      value={minLength}
      onChange={(e) => setMinLength(parseInt(e.target.value))}
      className="w-32"
    />
    <span className="text-sm text-slate-400">characters</span>
  </div>

  <p className="text-xs text-slate-400 mt-1">
    Messages shorter than this will be excluded from processing
  </p>

  {/* Live preview */}
  <div className="mt-2 p-2 bg-slate-800 rounded text-xs">
    <CheckCircle className="inline w-3 h-3 text-green-500" />
    {filteredCount} messages will be included
    <XCircle className="inline w-3 h-3 text-red-500 ml-2" />
    {excludedCount} messages will be excluded
  </div>
</FormSection>
```

**Section 4: Processing Mode**

```tsx
<FormSection title="Processing">
  <ToggleGroup type="single" value={processingMode}>
    <ToggleGroupItem value="automatic">
      <Sparkles /> Automatic
      <p className="text-xs">AI-powered grouping (Pro)</p>
      {plan === 'free' && <Lock className="w-3 h-3" />}
    </ToggleGroupItem>

    <ToggleGroupItem value="manual">
      <Settings /> Manual
      <p className="text-xs">Define groups with keywords</p>
    </ToggleGroupItem>
  </ToggleGroup>
</FormSection>
```

**Section 5: Groups (Conditional - only if Processing=Manual)**

```tsx
{
  processingMode === 'manual' && (
    <FormSection title="Groups">
      <p className="text-sm text-slate-400 mb-3">
        Define keyword-based groups. Messages matching keywords will be grouped together.
      </p>

      {/* List of group definitions */}
      {groups.map((group, idx) => (
        <div key={idx} className="group-item border rounded p-3 mb-2">
          <div className="flex gap-2 mb-2">
            <Input
              placeholder="Group name"
              value={group.name}
              onChange={(e) => updateGroupName(idx, e.target.value)}
            />
            <Button variant="ghost" size="sm" onClick={() => removeGroup(idx)}>
              <Trash className="w-4 h-4" />
            </Button>
          </div>

          {/* Multi-keyword input (tags) */}
          <TagInput
            placeholder="Add keywords (press Enter)"
            tags={group.keywords}
            onTagsChange={(tags) => updateGroupKeywords(idx, tags)}
          />

          {/* Preview match count */}
          <div className="text-xs text-slate-400 mt-1">
            {group.matchCount} messages match these keywords
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={addGroup} className="w-full">
        <Plus className="w-4 h-4 mr-2" />
        Add Group
      </Button>
    </FormSection>
  );
}
```

**Section 6: Duplicate Detection (Exhaustive Controls)**

```tsx
<FormSection title="Duplicate Detection">
  <Accordion type="single" collapsible defaultValue="basic">
    {/* Basic Settings */}
    <AccordionItem value="basic">
      <AccordionTrigger>Basic Settings</AccordionTrigger>
      <AccordionContent>
        {/* Exact match */}
        <div className="space-y-2">
          <Checkbox
            checked={dedupe.exactMatch}
            onCheckedChange={(v) => setDedupe({ ...dedupe, exactMatch: v })}
          >
            Detect exact duplicates (hash-based)
          </Checkbox>

          {/* Near-duplicate threshold */}
          <div className="mt-4">
            <Label>Near-duplicate similarity threshold</Label>
            <div className="flex items-center gap-4 mt-2">
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={dedupe.similarityThreshold}
                onChange={(e) =>
                  setDedupe({ ...dedupe, similarityThreshold: parseFloat(e.target.value) })
                }
                className="w-24"
              />
              <span className="text-sm text-slate-400">(0 = different, 1 = identical)</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Messages with similarity above this threshold will be flagged as potential duplicates
            </p>
          </div>

          {/* Cross-conversation detection */}
          <Checkbox
            checked={dedupe.crossConversation}
            onCheckedChange={(v) => setDedupe({ ...dedupe, crossConversation: v })}
          >
            Detect duplicates across different conversations
          </Checkbox>
        </div>
      </AccordionContent>
    </AccordionItem>

    {/* Advanced Settings */}
    <AccordionItem value="advanced">
      <AccordionTrigger>Advanced Settings</AccordionTrigger>
      <AccordionContent>
        {/* Algorithm selection */}
        <div className="space-y-4">
          <div>
            <Label>Similarity algorithm</Label>
            <Select
              value={dedupe.algorithm}
              onValueChange={(v) => setDedupe({ ...dedupe, algorithm: v })}
            >
              <SelectItem value="jaccard">Jaccard (token overlap)</SelectItem>
              <SelectItem value="levenshtein">Levenshtein (edit distance)</SelectItem>
              <SelectItem value="cosine">Cosine similarity (Pro)</SelectItem>
              <SelectItem value="embedding">Embedding-based (Pro)</SelectItem>
            </Select>
          </div>

          {/* Token normalization */}
          <Checkbox
            checked={dedupe.normalizeTokens}
            onCheckedChange={(v) => setDedupe({ ...dedupe, normalizeTokens: v })}
          >
            Normalize tokens (lowercase, remove punctuation)
          </Checkbox>

          {/* Min token overlap */}
          <div>
            <Label>Minimum token overlap count</Label>
            <Input
              type="number"
              min={1}
              value={dedupe.minTokenOverlap}
              onChange={(e) => setDedupe({ ...dedupe, minTokenOverlap: parseInt(e.target.value) })}
              className="w-24"
            />
            <p className="text-xs text-slate-400 mt-1">
              Require at least this many shared tokens to consider as duplicate
            </p>
          </div>

          {/* Length ratio tolerance */}
          <div>
            <Label>Length ratio tolerance</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={dedupe.lengthRatioTolerance}
              onChange={(e) =>
                setDedupe({ ...dedupe, lengthRatioTolerance: parseFloat(e.target.value) })
              }
              className="w-24"
            />
            <p className="text-xs text-slate-400 mt-1">
              Max length difference ratio (0.2 = one can be up to 20% different)
            </p>
          </div>

          {/* Ignore fields */}
          <div>
            <Label>Ignore when comparing</Label>
            <CheckboxGroup>
              <Checkbox
                checked={dedupe.ignoreWhitespace}
                onCheckedChange={(v) => setDedupe({ ...dedupe, ignoreWhitespace: v })}
              >
                Whitespace differences
              </Checkbox>
              <Checkbox
                checked={dedupe.ignoreCase}
                onCheckedChange={(v) => setDedupe({ ...dedupe, ignoreCase: v })}
              >
                Case differences
              </Checkbox>
              <Checkbox
                checked={dedupe.ignoreTimestamp}
                onCheckedChange={(v) => setDedupe({ ...dedupe, ignoreTimestamp: v })}
              >
                Timestamps
              </Checkbox>
            </CheckboxGroup>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>

    {/* Review Options */}
    <AccordionItem value="review">
      <AccordionTrigger>Review Options</AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <Checkbox
            checked={dedupe.requireReview}
            onCheckedChange={(v) => setDedupe({ ...dedupe, requireReview: v })}
          >
            Require manual review before applying changes
          </Checkbox>

          <Checkbox
            checked={dedupe.autoApproveExact}
            onCheckedChange={(v) => setDedupe({ ...dedupe, autoApproveExact: v })}
            disabled={dedupe.requireReview}
          >
            Auto-approve exact duplicates (skip review)
          </Checkbox>

          <div>
            <Label>Auto-merge threshold</Label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={dedupe.autoMergeThreshold}
              onChange={(e) =>
                setDedupe({ ...dedupe, autoMergeThreshold: parseFloat(e.target.value) })
              }
              className="w-24"
            />
            <p className="text-xs text-slate-400 mt-1">
              Duplicates above this score will be auto-merged (if review disabled)
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
</FormSection>
```

**Section 7: Code Extraction (Nested Form)**

```tsx
<FormSection title="Code Extraction">
  <Checkbox checked={extractCode} onCheckedChange={setExtractCode}>
    Extract code blocks from messages
  </Checkbox>

  {extractCode && (
    <div className="ml-6 mt-4 space-y-4 border-l-2 border-purple-500 pl-4">
      {/* Min code length */}
      <div>
        <Label>Minimum code block length</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={codeSettings.minLength}
            onChange={(e) =>
              setCodeSettings({ ...codeSettings, minLength: parseInt(e.target.value) })
            }
            className="w-32"
          />
          <span className="text-sm">characters</span>
        </div>
      </div>

      {/* Language filter */}
      <div>
        <Label>Filter by languages (leave empty for all)</Label>
        <TagInput
          placeholder="e.g., python, javascript, sql"
          tags={codeSettings.languages}
          onTagsChange={(tags) => setCodeSettings({ ...codeSettings, languages: tags })}
        />
      </div>

      {/* Grouping strategy */}
      <div>
        <Label>Group code blocks by</Label>
        <RadioGroup
          value={codeSettings.groupBy}
          onValueChange={(v) => setCodeSettings({ ...codeSettings, groupBy: v })}
        >
          <RadioGroupItem value="language">
            <Code /> Programming language
          </RadioGroupItem>
          <RadioGroupItem value="conversation">
            <MessageSquare /> Conversation
          </RadioGroupItem>
          <RadioGroupItem value="keyword">
            <Tag /> Keywords (uses groups above)
          </RadioGroupItem>
        </RadioGroup>
      </div>

      {/* Code-specific deduplication */}
      <Checkbox
        checked={codeSettings.deduplicate}
        onCheckedChange={(v) => setCodeSettings({ ...codeSettings, deduplicate: v })}
      >
        Deduplicate identical code blocks globally
      </Checkbox>

      {/* IMPORTANT: Code gets same duplicate detection settings */}
      <Alert>
        <Info className="w-4 h-4" />
        Code blocks will use the same duplicate detection settings as messages
      </Alert>
    </div>
  )}
</FormSection>
```

**Footer Actions**

```tsx
<div className="modal-footer flex justify-between">
  <Button variant="ghost" onClick={onCancel}>
    Cancel
  </Button>

  <div className="flex gap-2">
    <Button variant="outline" onClick={saveAsPreset}>
      <Save className="w-4 h-4 mr-2" />
      Save Preset
    </Button>

    <Button onClick={handleImport} disabled={!filesSelected || uploading}>
      {uploading ? (
        <>
          <Loader className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Upload className="w-4 h-4 mr-2" />
          Import & Review
        </>
      )}
    </Button>
  </div>
</div>
```

---

## Phase 2: Duplicate Review Panel 🔍

### 2.1 Panel Architecture (Post-Import, Pre-Commit)

**Three-panel layout (inspired by VS Code):**

```
┌─────────────────────────────────────────────────────────┐
│  Review Duplicates - 47 potential duplicates found      │
├───────────┬─────────────────────────┬───────────────────┤
│    LHS    │       CENTER            │       RHS         │
│  Tree of  │  Comparison View        │  Actions &        │
│  Groups   │  (side-by-side or       │  Metadata         │
│  w/ Dup   │   unified diff)         │                   │
│  Badges   │                         │                   │
├───────────┴─────────────────────────┴───────────────────┤
│  [Skip Review] [Keep All] [Discard All] [Apply Changes] │
└─────────────────────────────────────────────────────────┘
```

### 2.2 LHS Tree Structure

```tsx
<TreeView>
  <TreeNode label="Import Batch" badge={<Badge>47 duplicates</Badge>} expanded>
    <TreeNode
      label="API Documentation"
      badge={<Badge variant="warning">12 duplicates</Badge>}
      icon={<FolderIcon />}
    >
      <TreeNode
        label="Exact Matches"
        badge={<Badge>5</Badge>}
        icon={<CheckCircle className="text-green-500" />}
      >
        <DuplicateItem
          primary="GET /api/users endpoint - User1"
          duplicates={['GET /api/users endpoint - User2', 'GET /api/users endpoint - User3']}
          similarity={1.0}
          selected={selected === 'dup_1'}
          onClick={() => setSelected('dup_1')}
        />
      </TreeNode>

      <TreeNode
        label="Near Duplicates (> 0.85)"
        badge={<Badge>7</Badge>}
        icon={<AlertCircle className="text-yellow-500" />}
      >
        <DuplicateItem
          primary="Authentication flow explanation"
          duplicates={['Auth flow detailed walkthrough']}
          similarity={0.87}
          selected={selected === 'dup_2'}
          onClick={() => setSelected('dup_2')}
        />
      </TreeNode>
    </TreeNode>

    {/* Other groups... */}
  </TreeNode>
</TreeView>
```

### 2.3 CENTER - Comparison View

```tsx
<ComparisonView mode={viewMode}>
  {' '}
  {/* side-by-side | unified */}
  {/* Header */}
  <div className="flex justify-between items-center p-2 border-b">
    <div className="flex gap-2">
      <Button
        size="sm"
        variant={viewMode === 'side-by-side' ? 'default' : 'ghost'}
        onClick={() => setViewMode('side-by-side')}
      >
        <Split /> Side-by-Side
      </Button>
      <Button
        size="sm"
        variant={viewMode === 'unified' ? 'default' : 'ghost'}
        onClick={() => setViewMode('unified')}
      >
        <AlignJustify /> Unified
      </Button>
    </div>

    <Badge>Similarity: {currentDuplicate.similarity.toFixed(2)}</Badge>
  </div>
  {/* Side-by-side view */}
  {viewMode === 'side-by-side' && (
    <div className="grid grid-cols-2 gap-4 p-4">
      <DiffPanel
        title="Primary (Canonical)"
        content={currentDuplicate.primary.content}
        metadata={currentDuplicate.primary.metadata}
        onSelect={() => selectAsPrimary(currentDuplicate.primary.id)}
        isSelected={primaryId === currentDuplicate.primary.id}
      />

      <DiffPanel
        title={`Duplicate ${currentDupIndex + 1}`}
        content={currentDuplicate.duplicate.content}
        metadata={currentDuplicate.duplicate.metadata}
        onSelect={() => selectAsPrimary(currentDuplicate.duplicate.id)}
        isSelected={primaryId === currentDuplicate.duplicate.id}
        differences={highlightedDifferences}
      />
    </div>
  )}
  {/* Unified diff view */}
  {viewMode === 'unified' && (
    <div className="p-4">
      <UnifiedDiff
        original={currentDuplicate.primary.content}
        modified={currentDuplicate.duplicate.content}
        highlightChanges
      />
    </div>
  )}
</ComparisonView>
```

### 2.4 RHS - Actions & Metadata

```tsx
<ActionsPanel>
  {/* Quick actions */}
  <div className="space-y-2">
    <Button className="w-full" onClick={() => applyDecision('keep-primary')}>
      <Check /> Keep Primary (Discard Duplicate)
    </Button>

    <Button className="w-full" variant="outline" onClick={() => applyDecision('keep-duplicate')}>
      <ArrowRight /> Keep Duplicate (Discard Primary)
    </Button>

    <Button className="w-full" variant="outline" onClick={() => applyDecision('keep-both')}>
      <Copy /> Keep Both (Not Duplicate)
    </Button>

    <Button
      className="w-full"
      variant="secondary"
      onClick={() => openMergeDialog()}
      disabled={plan === 'free'} // Pro feature
    >
      <Sparkles /> AI Merge {plan === 'free' && <Lock className="w-3 h-3 ml-1" />}
    </Button>
  </div>

  {/* Metadata comparison */}
  <Separator className="my-4" />

  <div className="space-y-3">
    <div>
      <Label className="text-xs">Conversation</Label>
      <div className="text-sm">Primary: {currentDuplicate.primary.conversationTitle}</div>
      <div className="text-sm text-slate-400">
        Duplicate: {currentDuplicate.duplicate.conversationTitle}
      </div>
    </div>

    <div>
      <Label className="text-xs">Timestamp</Label>
      <div className="text-sm">Primary: {formatDate(currentDuplicate.primary.timestamp)}</div>
      <div className="text-sm text-slate-400">
        Duplicate: {formatDate(currentDuplicate.duplicate.timestamp)}
      </div>
    </div>

    <div>
      <Label className="text-xs">Character Count</Label>
      <div className="text-sm">Primary: {currentDuplicate.primary.charCount} chars</div>
      <div className="text-sm text-slate-400">
        Duplicate: {currentDuplicate.duplicate.charCount} chars
      </div>
    </div>

    <div>
      <Label className="text-xs">Similarity Breakdown</Label>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span>Token overlap:</span>
          <span>{(currentDuplicate.metrics.tokenOverlap * 100).toFixed(0)}%</span>
        </div>
        <div className="flex justify-between">
          <span>Edit distance:</span>
          <span>{currentDuplicate.metrics.editDistance}</span>
        </div>
        <div className="flex justify-between">
          <span>Length ratio:</span>
          <span>{currentDuplicate.metrics.lengthRatio.toFixed(2)}</span>
        </div>
      </div>
    </div>
  </div>

  {/* Navigation */}
  <Separator className="my-4" />

  <div className="flex items-center justify-between">
    <Button size="sm" variant="ghost" onClick={previousDuplicate} disabled={currentDupIndex === 0}>
      <ChevronLeft /> Previous
    </Button>

    <span className="text-sm text-slate-400">
      {currentDupIndex + 1} of {totalDuplicates}
    </span>

    <Button
      size="sm"
      variant="ghost"
      onClick={nextDuplicate}
      disabled={currentDupIndex === totalDuplicates - 1}
    >
      Next <ChevronRight />
    </Button>
  </div>
</ActionsPanel>
```

### 2.5 Bulk Actions Footer

```tsx
<ReviewFooter>
  <div className="flex items-center gap-2">
    <Checkbox checked={selectAll} onCheckedChange={handleSelectAll} />
    <span className="text-sm">Select all in current group</span>
  </div>

  <div className="flex gap-2">
    <Button variant="ghost" onClick={skipReview}>
      Skip Review (Import All)
    </Button>

    <Button variant="outline" onClick={autoResolveExact}>
      Auto-Resolve Exact Matches
    </Button>

    <Button variant="outline" onClick={keepAllPrimary}>
      Keep All Primary
    </Button>

    <Button variant="destructive" onClick={discardAllDuplicates}>
      Discard All Duplicates
    </Button>

    <Button onClick={applyChanges} disabled={!hasDecisions}>
      <Check className="w-4 h-4 mr-2" />
      Apply Changes ({decisionCount})
    </Button>
  </div>
</ReviewFooter>
```

---

## Phase 3: Canvas Integration After Review ✅

### 3.1 Post-Review Transition

```tsx
// After "Apply Changes" is clicked
const handleApplyChanges = async () => {
  // 1. Apply all review decisions
  await applyReviewDecisions(decisions);

  // 2. Close review panel
  setShowReviewPanel(false);

  // 3. Transition to canvas with new sources
  router.push('/canvas?import_session=' + sessionId);
};
```

### 3.2 Canvas Display

```tsx
// Canvas auto-loads imported sources
<CanvasViewport>
  {importedGroups.map((group) => (
    <GroupCard
      key={group.id}
      group={group}
      badge={
        group.duplicatesResolved > 0 && (
          <Badge variant="success">{group.duplicatesResolved} duplicates resolved</Badge>
        )
      }
      onSelect={() => selectGroup(group.id)}
    />
  ))}
</CanvasViewport>
```

---

## Phase 4: LHS Tree View & RHS Inspector 🎨

### 4.1 LHS Sidebar - Tree View

```tsx
<LeftSidebar>
  <div className="p-2 border-b">
    <Input
      placeholder="Filter sources..."
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
    />
  </div>

  <TreeView className="flex-1 overflow-auto p-2">
    {/* Selection-based view (default) */}
    <TreeNode
      label="Selection"
      icon={<Layers />}
      badge={<Badge>{selectedCount} items</Badge>}
      defaultExpanded
    >
      {selectedGroups.map((group) => (
        <TreeNode
          key={group.id}
          label={group.name}
          icon={<Folder />}
          badge={<Badge>{group.memberCount}</Badge>}
          onContextMenu={(e) => showGroupContextMenu(e, group)}
        >
          {group.sources.map((source) => (
            <TreeItem
              key={source.id}
              label={source.title}
              icon={getSourceIcon(source.type)}
              selected={selectedSourceId === source.id}
              onClick={() => selectSource(source.id)}
              badges={[
                source.role && <Badge size="xs">{source.role}</Badge>,
                source.charCount && (
                  <Badge size="xs" variant="outline">
                    {source.charCount} chars
                  </Badge>
                ),
              ]}
            />
          ))}
        </TreeNode>
      ))}
    </TreeNode>

    {/* All imported content */}
    <TreeNode
      label="Recent Import"
      icon={<Clock />}
      badge={<Badge>{importSession.totalSources}</Badge>}
    >
      <TreeNode label="By Platform">
        <TreeNode label="ChatGPT" badge={<Badge>45</Badge>} />
        <TreeNode label="Claude" badge={<Badge>23</Badge>} />
      </TreeNode>

      <TreeNode label="By Type">
        <TreeNode label="User Messages" badge={<Badge>38</Badge>} />
        <TreeNode label="Assistant Messages" badge={<Badge>30</Badge>} />
        <TreeNode label="Code Blocks" badge={<Badge>67</Badge>} />
      </TreeNode>

      <TreeNode label="By Group">
        {importSession.groups.map((group) => (
          <TreeNode key={group.id} label={group.name} badge={<Badge>{group.memberCount}</Badge>} />
        ))}
      </TreeNode>
    </TreeNode>
  </TreeView>

  {/* Tree actions */}
  <div className="p-2 border-t flex gap-1">
    <Button size="sm" variant="ghost" onClick={expandAll}>
      <ChevronDown className="w-4 h-4" />
    </Button>
    <Button size="sm" variant="ghost" onClick={collapseAll}>
      <ChevronRight className="w-4 h-4" />
    </Button>
    <Separator orientation="vertical" className="mx-1" />
    <Button size="sm" variant="ghost" onClick={refreshTree}>
      <RefreshCw className="w-4 h-4" />
    </Button>
  </div>
</LeftSidebar>
```

### 4.2 RHS Inspector - Stacked Tiles

```tsx
<RightSidebar>
  {/* Header */}
  <div className="p-3 border-b flex items-center justify-between">
    <h3 className="font-semibold">Inspector</h3>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={clearSelection}>
        <X className="w-4 h-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={toggleOverlay}>
        <Maximize className="w-4 h-4" />
      </Button>
    </div>
  </div>

  {/* Stacked tiles */}
  <div className="flex-1 overflow-auto p-3 space-y-3">
    {selectedSources.length === 0 ? (
      <EmptyState>
        <FileQuestion className="w-12 h-12 text-slate-600" />
        <p className="text-sm text-slate-400 mt-2">Select sources to inspect</p>
      </EmptyState>
    ) : (
      selectedSources.map((source, idx) => (
        <Accordion key={source.id} type="single" defaultValue={idx === 0 ? 'content' : undefined}>
          {/* Tile header */}
          <div className="tile-header flex items-start gap-2 p-3 bg-slate-800 rounded-t">
            <div className="flex-1">
              <h4 className="font-medium text-sm">{source.title}</h4>
              <div className="flex gap-2 mt-1">
                <Badge size="xs">{source.type}</Badge>
                {source.role && (
                  <Badge size="xs" variant="outline">
                    {source.role}
                  </Badge>
                )}
                <Badge size="xs" variant="outline">
                  {source.charCount} chars
                </Badge>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => removeFromSelection(source.id)}>
              <X className="w-3 h-3" />
            </Button>
          </div>

          {/* Content preview */}
          <AccordionItem value="content">
            <AccordionTrigger className="px-3 py-2 hover:bg-slate-800/50">
              <FileText className="w-4 h-4 mr-2" />
              Content
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2">
              <div className="prose prose-sm prose-invert max-h-64 overflow-auto">
                <ReactMarkdown>{source.contentMarkdown}</ReactMarkdown>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Metadata */}
          <AccordionItem value="metadata">
            <AccordionTrigger className="px-3 py-2 hover:bg-slate-800/50">
              <Info className="w-4 h-4 mr-2" />
              Metadata
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-slate-400">Conversation</dt>
                  <dd>{source.conversationTitle}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Platform</dt>
                  <dd>{source.platform}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Timestamp</dt>
                  <dd>{formatDate(source.timestamp)}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Fingerprint</dt>
                  <dd className="font-mono text-xs">{source.fingerprint.slice(0, 16)}...</dd>
                </div>
              </dl>
            </AccordionContent>
          </AccordionItem>

          {/* Provenance */}
          <AccordionItem value="provenance">
            <AccordionTrigger className="px-3 py-2 hover:bg-slate-800/50">
              <GitBranch className="w-4 h-4 mr-2" />
              Provenance
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Conversation</TableHead>
                    <TableHead>Messages</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {source.provenance.map((prov, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-xs">
                        {prov.conversationId.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-xs">
                        {prov.messageIdxStart}-{prov.messageIdxEnd}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(prov.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>

          {/* Actions */}
          <div className="p-3 border-t flex gap-2">
            <Button size="sm" variant="outline" className="flex-1">
              <Eye className="w-3 h-3 mr-1" />
              View Full
            </Button>
            <Button size="sm" variant="outline" className="flex-1">
              <Download className="w-3 h-3 mr-1" />
              Export
            </Button>
          </div>
        </Accordion>
      ))
    )}
  </div>
</RightSidebar>
```

---

## TypeScript Type Definitions

```typescript
// apps/web/src/types/chat-import.ts

export interface ChatImportConfig {
  // Extraction
  extraction: {
    includeUser: boolean;
    includeAssistant: boolean;
  };

  // Branches
  branches: 'merged' | 'separate';

  // Filtering
  minMessageLength: number;

  // Processing
  processingMode: 'automatic' | 'manual';

  // Manual groups (only if processingMode='manual')
  groups: Array<{
    name: string;
    keywords: string[];
    matchCount?: number; // computed
  }>;

  // Duplicate detection
  duplicateDetection: {
    enabled: boolean;
    exactMatch: boolean;
    similarityThreshold: number;
    crossConversation: boolean;

    // Advanced
    algorithm: 'jaccard' | 'levenshtein' | 'cosine' | 'embedding';
    normalizeTokens: boolean;
    minTokenOverlap: number;
    lengthRatioTolerance: number;

    // Ignore options
    ignoreWhitespace: boolean;
    ignoreCase: boolean;
    ignoreTimestamp: boolean;

    // Review
    requireReview: boolean;
    autoApproveExact: boolean;
    autoMergeThreshold: number;
  };

  // Code extraction
  extractCode: boolean;
  codeSettings: {
    minLength: number;
    languages: string[];
    groupBy: 'language' | 'conversation' | 'keyword';
    deduplicate: boolean;
  };
}

export interface DuplicateCandidate {
  id: string;
  primary: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  duplicate: {
    id: string;
    content: string;
    conversationTitle: string;
    timestamp: number;
    charCount: number;
    metadata: any;
  };
  similarity: number;
  metrics: {
    tokenOverlap: number;
    editDistance: number;
    lengthRatio: number;
  };
  decision?: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
}

export interface ReviewDecision {
  duplicateId: string;
  action: 'keep-primary' | 'keep-duplicate' | 'keep-both' | 'merge';
  timestamp: number;
  userId?: string;
}
```

---

## Backend Services to Implement

### 1. Duplicate Detection Service

```typescript
// apps/api/src/services/duplicate-detector.ts

export class DuplicateDetector {
  async detectDuplicates(
    sources: SourceDoc[],
    config: ChatImportConfig['duplicateDetection']
  ): Promise<DuplicateCandidate[]> {
    const candidates: DuplicateCandidate[] = [];

    // Exact hash matching
    if (config.exactMatch) {
      const exactMatches = this.findExactMatches(sources);
      candidates.push(...exactMatches);
    }

    // Near-duplicate detection
    const nearDuplicates = this.findNearDuplicates(
      sources,
      config.algorithm,
      config.similarityThreshold,
      config
    );
    candidates.push(...nearDuplicates);

    return candidates;
  }

  private findExactMatches(sources: SourceDoc[]): DuplicateCandidate[] {
    const hashMap = new Map<string, SourceDoc[]>();

    for (const source of sources) {
      const hash = this.computeHash(source.content_markdown);
      if (!hashMap.has(hash)) {
        hashMap.set(hash, []);
      }
      hashMap.get(hash)!.push(source);
    }

    const duplicates: DuplicateCandidate[] = [];

    for (const [hash, docs] of hashMap.entries()) {
      if (docs.length > 1) {
        const [primary, ...dups] = docs;
        for (const dup of dups) {
          duplicates.push({
            id: `dup_${nanoid()}`,
            primary: this.toCandidate(primary),
            duplicate: this.toCandidate(dup),
            similarity: 1.0,
            metrics: {
              tokenOverlap: 1.0,
              editDistance: 0,
              lengthRatio: 1.0,
            },
          });
        }
      }
    }

    return duplicates;
  }

  private findNearDuplicates(
    sources: SourceDoc[],
    algorithm: string,
    threshold: number,
    config: any
  ): DuplicateCandidate[] {
    const candidates: DuplicateCandidate[] = [];

    // Compare all pairs
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const similarity = this.computeSimilarity(
          sources[i].content_markdown,
          sources[j].content_markdown,
          algorithm,
          config
        );

        if (similarity >= threshold) {
          candidates.push({
            id: `dup_${nanoid()}`,
            primary: this.toCandidate(sources[i]),
            duplicate: this.toCandidate(sources[j]),
            similarity,
            metrics: this.computeMetrics(sources[i].content_markdown, sources[j].content_markdown),
          });
        }
      }
    }

    return candidates;
  }

  private computeSimilarity(text1: string, text2: string, algorithm: string, config: any): number {
    // Normalize if configured
    if (config.ignoreWhitespace) {
      text1 = text1.replace(/\s+/g, ' ');
      text2 = text2.replace(/\s+/g, ' ');
    }
    if (config.ignoreCase) {
      text1 = text1.toLowerCase();
      text2 = text2.toLowerCase();
    }

    switch (algorithm) {
      case 'jaccard':
        return this.jaccardSimilarity(text1, text2, config);
      case 'levenshtein':
        return this.levenshteinSimilarity(text1, text2);
      case 'cosine':
        return this.cosineSimilarity(text1, text2);
      case 'embedding':
        return this.embeddingSimilarity(text1, text2); // Pro only
      default:
        return this.jaccardSimilarity(text1, text2, config);
    }
  }

  private jaccardSimilarity(text1: string, text2: string, config: any): number {
    const tokens1 = this.tokenize(text1, config);
    const tokens2 = this.tokenize(text2, config);

    const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
    const union = new Set([...tokens1, ...tokens2]);

    // Check min overlap
    if (intersection.size < config.minTokenOverlap) {
      return 0;
    }

    return intersection.size / union.size;
  }

  private tokenize(text: string, config: any): Set<string> {
    let tokens = text.split(/\W+/).filter((t) => t.length > 0);

    if (config.normalizeTokens) {
      tokens = tokens.map((t) => t.toLowerCase());
    }

    return new Set(tokens);
  }

  private computeMetrics(text1: string, text2: string) {
    // Implement token overlap, edit distance, length ratio
    // ...
  }
}
```

### 2. Review Decision Service

```typescript
// apps/api/src/services/review-decisions.ts

export class ReviewDecisionService {
  async applyDecisions(
    decisions: ReviewDecision[],
    duplicates: DuplicateCandidate[]
  ): Promise<void> {
    for (const decision of decisions) {
      const duplicate = duplicates.find((d) => d.id === decision.duplicateId);
      if (!duplicate) continue;

      switch (decision.action) {
        case 'keep-primary':
          await this.discardSource(duplicate.duplicate.id);
          break;
        case 'keep-duplicate':
          await this.discardSource(duplicate.primary.id);
          break;
        case 'keep-both':
          // Mark as not duplicate, keep both
          await this.markAsNotDuplicate(duplicate.primary.id, duplicate.duplicate.id);
          break;
        case 'merge':
          await this.mergeSources(duplicate.primary.id, duplicate.duplicate.id);
          break;
      }
    }
  }

  private async discardSource(sourceId: string): Promise<void> {
    // Remove from graph
    const neo4j = getNeo4jClient();
    await neo4j.execute(
      `
      MATCH (s:Source {id: $sourceId})
      DETACH DELETE s
    `,
      { sourceId }
    );
  }

  private async markAsNotDuplicate(id1: string, id2: string): Promise<void> {
    // Create NOT_DUPLICATE edge to prevent future detection
    const neo4j = getNeo4jClient();
    await neo4j.execute(
      `
      MATCH (s1:Source {id: $id1})
      MATCH (s2:Source {id: $id2})
      MERGE (s1)-[:NOT_DUPLICATE]->(s2)
    `,
      { id1, id2 }
    );
  }

  private async mergeSources(primaryId: string, duplicateId: string): Promise<void> {
    // Merge content, update provenance, create MERGED_FROM edge
    // ...
  }
}
```

---

## Next Steps

1. **Update ChatImportModal** with exact controls specified
2. **Implement DuplicateReviewPanel** with three-panel layout
3. **Build LHS TreeView** and **RHS Inspector** components
4. **Add backend duplicate detection** service
5. **Wire up review decision** application
6. **Test end-to-end** flow

This complete plan covers every detail from the exact form controls through the duplicate review UI to the final canvas integration with LHS/RHS sidebars.
