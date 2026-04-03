/**
 * AnswerCard — renders the synthesiser's markdown answer.
 *
 * Uses react-markdown + remark-gfm for tables, strikethrough, task lists.
 * The `prose` Tailwind Typography classes handle all markdown typography
 * without manual element styling.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export function AnswerCard({ content }: Props) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6">
      <h2 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-widest mb-4">
        Answer
      </h2>
      <article className="prose prose-neutral prose-sm dark:prose-invert max-w-none
                          prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400
                          prose-code:bg-neutral-100 dark:prose-code:bg-neutral-800 prose-code:rounded prose-code:px-1">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
