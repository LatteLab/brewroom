# Rich Text Rendering Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make event descriptions render correctly on the user-facing page (lists, headings, spacing) matching what admins see in the Tiptap editor, and add heading buttons to the toolbar.

**Architecture:** Install `@tailwindcss/typography` (v4-compatible) so the existing `prose` classes produce proper styling. Update the Tiptap editor toolbar with H1/H2/H3 buttons and align editor preview styles with prose output. No new components needed.

**Tech Stack:** `@tailwindcss/typography` v0.5+, Tiptap StarterKit (already installed), Tailwind CSS v4

---

### Task 1: Install `@tailwindcss/typography`

**Files:**
- Modify: `package.json`
- Modify: `app/globals.css`

**Step 1: Install the plugin**

Run: `pnpm add @tailwindcss/typography`

**Step 2: Import in globals.css**

In Tailwind v4, plugins are imported via CSS. Add this import at the top of `app/globals.css` after the existing imports:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@tailwindcss/typography";
```

**Step 3: Verify prose classes work**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml app/globals.css
git commit -m "feat: add @tailwindcss/typography for prose rendering"
```

---

### Task 2: Add heading buttons to Tiptap toolbar

**Files:**
- Modify: `components/admin/events/tiptap-editor.tsx`

**Step 1: Add heading imports and toolbar buttons**

Add `Heading1`, `Heading2`, `Heading3` to the lucide-react import:

```typescript
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Heading1, Heading2, Heading3 } from 'lucide-react';
```

Insert heading buttons into the `toolbarButtons` array, after Italic and before List:

```typescript
{
  icon: Heading1,
  action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  isActive: editor.isActive('heading', { level: 1 }),
},
{
  icon: Heading2,
  action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  isActive: editor.isActive('heading', { level: 2 }),
},
{
  icon: Heading3,
  action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  isActive: editor.isActive('heading', { level: 3 }),
},
```

No new extensions needed — `StarterKit` already includes the `Heading` extension.

**Step 2: Verify headings work in the editor**

Run: `pnpm dev`
Navigate to admin event create/edit form. Click H1/H2/H3 buttons — text should toggle heading levels.

**Step 3: Commit**

```bash
git add components/admin/events/tiptap-editor.tsx
git commit -m "feat: add heading buttons to Tiptap editor toolbar"
```

---

### Task 3: Align editor preview styles with prose output

**Files:**
- Modify: `components/admin/events/tiptap-editor.tsx`

The editor currently uses custom inline Tailwind styles for lists (`[&_.tiptap_ul]:list-disc` etc.) that don't match the typography plugin's prose styles. Replace these with `prose` classes so the editor preview matches the rendered output.

**Step 1: Replace inline styles with prose classes on EditorContent**

Replace the `EditorContent` className block (lines 94-106) with:

```typescript
<EditorContent
  editor={editor}
  className={cn(
    'p-3 h-[200px] overflow-y-auto',
    'prose prose-sm max-w-none dark:prose-invert',
    '[&_.tiptap]:outline-none [&_.tiptap]:min-h-full',
    '[&_.tiptap_.is-editor-empty:first-child::before]:text-muted-foreground',
    '[&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
    '[&_.tiptap_.is-editor-empty:first-child::before]:float-left',
    '[&_.tiptap_.is-editor-empty:first-child::before]:h-0',
    '[&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none'
  )}
/>
```

This removes the manual `list-disc`, `list-decimal`, `pl-4`, `mb-2` overrides and lets the typography plugin's `prose prose-sm` handle all element styling consistently.

**Step 2: Verify editor WYSIWYG matches rendered output**

Run: `pnpm dev`
1. Create an event with bullet list, ordered list, H1, H2, link, and bold text
2. Save the event
3. View the event on the user-facing page (`/user/events/[id]`)
4. Compare editor preview vs rendered output — they should match

**Step 3: Commit**

```bash
git add components/admin/events/tiptap-editor.tsx
git commit -m "refactor: use prose classes in Tiptap editor for WYSIWYG consistency"
```

---

### Task 4: Ensure dark mode on admin rendering locations

**Files:**
- Modify: `components/admin/events/event-overview.tsx` (line 215)
- Modify: `components/admin/email/email-blast-detail.tsx` (line 195)

**Step 1: Add dark:prose-invert to admin event overview**

Change line 215 from:
```typescript
className="prose prose-sm max-w-none text-sm text-muted-foreground"
```
to:
```typescript
className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground"
```

**Step 2: Add dark:prose-invert to email blast detail**

Change line 195 from:
```typescript
className="rounded-lg border p-4 prose prose-sm max-w-none"
```
to:
```typescript
className="rounded-lg border p-4 prose prose-sm dark:prose-invert max-w-none"
```

**Step 3: Verify dark mode rendering**

Run: `pnpm dev`
Toggle dark mode. Check that event descriptions and email previews in the admin section render with proper contrast.

**Step 4: Commit**

```bash
git add components/admin/events/event-overview.tsx components/admin/email/email-blast-detail.tsx
git commit -m "fix: add dark mode prose support to admin description renders"
```

---

### Task 5: Build verification

**Step 1: Run full build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 2: Run lint**

Run: `pnpm lint`
Expected: No new lint errors.
