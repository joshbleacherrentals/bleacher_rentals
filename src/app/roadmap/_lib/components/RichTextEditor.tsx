"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
} from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded text-gray-600 hover:bg-gray-200 transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active && "bg-gray-200 text-gray-900",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, disabled }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({
        placeholder: placeholder ?? "Write a description...",
      }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "focus:outline-none p-3 min-h-[120px] prose prose-sm max-w-none",
      },
    },
  });

  // Sync content when value changes externally (e.g. loading a different task)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div className={cn("border rounded overflow-hidden", disabled && "opacity-60")}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-gray-50 p-1.5">
        <ToolbarButton
          title="Bold"
          active={editor?.isActive("bold")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor?.isActive("italic")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor?.isActive("underline")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <ToolbarButton
          title="Heading 1"
          active={editor?.isActive("heading", { level: 1 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor?.isActive("heading", { level: 2 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor?.isActive("heading", { level: 3 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-0.5" />
        <ToolbarButton
          title="Bullet list"
          active={editor?.isActive("bulletList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          title="Ordered list"
          active={editor?.isActive("orderedList")}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
}
