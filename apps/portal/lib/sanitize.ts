import sanitizeHtml from 'sanitize-html';

/**
 * Shared HTML sanitizer configured for Tiptap-generated content.
 *
 * Tiptap StarterKit + Link produces: paragraphs, headings, bold/italic/strike,
 * lists, blockquotes, code blocks, horizontal rules, and links with
 * href/target/rel attributes.
 *
 * sanitize-html's defaults are more restrictive than DOMPurify — notably
 * missing `rel` on <a> tags, which is needed for target="_blank" security
 * (noopener noreferrer). This config extends the defaults to match.
 */
const options: sanitizeHtml.IOptions = {
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
  },
  // Avoid pulling postcss into client bundles
  parseStyleAttributes: false,
};

export function sanitize(html: string): string {
  return sanitizeHtml(html, options);
}
