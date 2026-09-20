"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AudiencePicker } from "@/components/admin/email/audience-picker";
import { MergeFieldDropdown } from "@/components/admin/events/merge-field-dropdown";
import {
  saveEmailBlastAction,
  getEmailBlastDetailAction,
  sendEmailBlastAction,
  sendPreviewEmailAction,
  getAudienceCountAction,
} from "@/app/actions/email";
import { toast } from "sonner";
import { Save, Loader2, Send, Eye } from "lucide-react";
import type { AudienceFilter } from "@/lib/types/email";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmailComposerProps {
  initialAudienceType?: string;
  initialEventId?: string;
  initialBlastId?: string;
}

export function EmailComposer({
  initialAudienceType,
  initialEventId,
  initialBlastId,
}: EmailComposerProps) {
  const [isPending, startTransition] = useTransition();

  // Form state
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>(() => {
    if (initialAudienceType === "event" && initialEventId) {
      return { type: "event", eventId: initialEventId };
    }
    if (initialAudienceType === "semester_status") {
      return { type: "semester_status", semesterStatus: "" };
    }
    if (initialAudienceType === "manual") {
      return { type: "manual", userIds: [] };
    }
    return { type: "all" };
  });
  const [blastId, setBlastId] = useState<string | null>(null);

  // Track initial editor content (set once when loading a draft)
  const [initialEditorContent, setInitialEditorContent] = useState("");
  const [draftLoading, setDraftLoading] = useState(!!initialBlastId);
  const router = useRouter();
  const [confirmSend, setConfirmSend] = useState<{ count: number } | null>(null);

  // Load existing draft when editing
  useEffect(() => {
    if (!initialBlastId) return;
    (async () => {
      try {
        const result = await getEmailBlastDetailAction(initialBlastId);
        if (result?.blast) {
          const { blast } = result;
          setSubject(blast.subject);
          setBodyHtml(blast.bodyTemplate || blast.body);
          setInitialEditorContent(blast.bodyTemplate || blast.body);
          setBlastId(blast.id);
          // Parse audience filters back into AudienceFilter
          try {
            const filters = JSON.parse(blast.audienceFilters) as AudienceFilter;
            setAudienceFilter(filters);
          } catch {
            // fallback: use audienceType with defaults
          }
        }
      } catch {
        // Failed to load draft, start fresh
      } finally {
        setDraftLoading(false);
      }
    })();
  }, [initialBlastId]);

  // Ref for the Tiptap editor container to insert merge fields
  const editorRef = useRef<{ insertContent: (content: string) => void } | null>(
    null
  );

  const handleInsertMergeField = (field: string) => {
    if (editorRef.current) {
      editorRef.current.insertContent(field);
    }
  };

  const handleSaveDraft = () => {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (!bodyHtml.trim()) {
      toast.error("Email body is required");
      return;
    }

    startTransition(async () => {
      try {
        const blast = await saveEmailBlastAction({
          id: blastId || undefined,
          subject,
          bodyTemplate: bodyHtml,
          audienceType: audienceFilter.type,
          audienceFilters: audienceFilter,
        });
        setBlastId(blast.id);
        toast.success("Draft saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save draft"
        );
      }
    });
  };

  const handleSendPreview = () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    startTransition(async () => {
      try {
        // Save the latest draft first so the server-side render uses current state.
        const saved = await saveEmailBlastAction({
          id: blastId || undefined,
          subject,
          bodyTemplate: bodyHtml,
          audienceType: audienceFilter.type,
          audienceFilters: audienceFilter,
        });
        setBlastId(saved.id);
        await sendPreviewEmailAction(saved.id);
        toast.success("Preview sent - check your inbox");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send preview");
      }
    });
  };

  const handleSend = () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    startTransition(async () => {
      try {
        const saved = await saveEmailBlastAction({
          id: blastId || undefined,
          subject,
          bodyTemplate: bodyHtml,
          audienceType: audienceFilter.type,
          audienceFilters: audienceFilter,
        });
        setBlastId(saved.id);

        const audienceCount = await getAudienceCountAction(audienceFilter);
        if (audienceCount === 0) {
          toast.error("No recipients in audience");
          return;
        }
        // Open the confirmation dialog - actual send happens in confirmSendDispatch.
        setConfirmSend({ count: audienceCount });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send");
      }
    });
  };

  const confirmSendDispatch = () => {
    const ctx = confirmSend;
    setConfirmSend(null);
    if (!ctx || !blastId) return;
    startTransition(async () => {
      try {
        await sendEmailBlastAction(blastId);
        toast.success(`Sent to ${ctx.count} recipients`);
        router.push(`/admin/email/${blastId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to send");
      }
    });
  };

  if (draftLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Audience Picker */}
      <AudiencePicker value={audienceFilter} onChange={setAudienceFilter} />

      {/* Subject */}
      <div className="space-y-2">
        <Label htmlFor="subject" className="text-sm font-semibold">
          Subject
        </Label>
        <Input
          id="subject"
          placeholder="Enter email subject..."
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* Body Editor with Merge Field Dropdown */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Body</Label>
          <MergeFieldDropdown
            onInsert={handleInsertMergeField}
            showEventName={audienceFilter.type === "event"}
          />
        </div>
        <TiptapEditorWithRef
          key={initialEditorContent}
          content={initialEditorContent || bodyHtml}
          onChange={setBodyHtml}
          placeholder="Write your email..."
          ref={editorRef}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveDraft}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save Draft
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSendPreview}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Eye className="h-4 w-4 mr-1.5" />
          )}
          Preview
        </Button>

        <Button
          size="sm"
          onClick={handleSend}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-1.5" />
          )}
          Send
        </Button>
      </div>

      <AlertDialog open={!!confirmSend} onOpenChange={(open) => !open && setConfirmSend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {confirmSend?.count ?? 0} recipients?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{subject}&rdquo; will be delivered to {confirmSend?.count ?? 0} member
              {confirmSend?.count === 1 ? '' : 's'} via Resend. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendDispatch}>Send now</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Wrapper around TiptapEditor that exposes insertContent via ref
import { forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TiptapEditorWithRefProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const TiptapEditorWithRef = forwardRef<
  { insertContent: (content: string) => void },
  TiptapEditorWithRefProps
>(function TiptapEditorWithRef(
  { content, onChange, placeholder = "Write your email..." },
  ref
) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useImperativeHandle(ref, () => ({
    insertContent: (text: string) => {
      if (editor) {
        editor.chain().focus().insertContent(text).run();
      }
    },
  }));

  if (!editor) return null;

  const toolbarButtons = [
    {
      icon: Bold,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive("bold"),
    },
    {
      icon: Italic,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive("italic"),
    },
    {
      icon: List,
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive("orderedList"),
    },
    {
      icon: LinkIcon,
      action: () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
        } else {
          const url = window.prompt("Enter URL");
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }
      },
      isActive: editor.isActive("link"),
    },
  ];

  return (
    <div className="rounded-lg border border-input focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring transition-colors">
      <div className="flex gap-1 p-2 border-b border-input">
        {toolbarButtons.map((button, index) => (
          <button
            key={index}
            type="button"
            onClick={button.action}
            className={cn(
              "h-8 w-8 flex items-center justify-center rounded-md transition-colors",
              button.isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <button.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          "p-3 h-[300px] overflow-y-auto",
          "[&_.tiptap]:outline-none [&_.tiptap]:min-h-full",
          "[&_.tiptap_p]:mb-2",
          "[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-4 [&_.tiptap_ul]:mb-2",
          "[&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-4 [&_.tiptap_ol]:mb-2",
          "[&_.tiptap_a]:text-primary [&_.tiptap_a]:underline",
          "[&_.tiptap_.is-editor-empty:first-child::before]:text-muted-foreground",
          "[&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          "[&_.tiptap_.is-editor-empty:first-child::before]:float-left",
          "[&_.tiptap_.is-editor-empty:first-child::before]:h-0",
          "[&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none"
        )}
      />
    </div>
  );
});
