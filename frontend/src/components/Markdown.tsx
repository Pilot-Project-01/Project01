"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders the task prompt / agent note as real markdown. Element styles are
// kept inline (rather than the typography plugin) to avoid another dependency.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="mt-3 mb-2 text-base font-semibold" {...props} />,
          h2: (props) => <h2 className="mt-3 mb-1.5 text-sm font-semibold" {...props} />,
          h3: (props) => <h3 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
          p: (props) => <p className="mb-2" {...props} />,
          ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5" {...props} />,
          strong: (props) => <strong className="font-semibold" {...props} />,
          a: (props) => <a className="text-accent underline" {...props} />,
          code: (props) => (
            <code
              className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]"
              {...props}
            />
          ),
          pre: (props) => (
            <pre
              className="mb-2 overflow-auto rounded-xl bg-foreground/5 p-3 font-mono text-xs"
              {...props}
            />
          ),
          blockquote: (props) => (
            <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
