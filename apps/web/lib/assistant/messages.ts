// Visitor-facing sentences shared by the server (run.ts, handler.ts) and the browser (client.ts,
// the panel). No data, no numbers.
// Code generated with SI assistance (Claude Code), reviewed by the team.

export const UNAVAILABLE_MESSAGE = "Live answers are not available right now. You can read the stored answers instead.";
export const LIMIT_MESSAGE = "Live answers have reached their limit for now. You can read the stored answers instead.";
/** A visitor's own key (DOB-161). */
export const KEY_SHAPE_MESSAGE = "That does not look like an Anthropic API key. Keys start with sk-ant-.";
export const KEY_REFUSED_MESSAGE = "Anthropic refused this API key, so it was removed. Check the key and enter it again, or read the stored answers.";
export const OWN_LIMIT_MESSAGE = "Your API key has reached its rate or spend limit at Anthropic. Try again later, or read the stored answers.";
export const UNCHECKED_ANSWER =
  "I could not check that against the data, so I will not answer it from memory. Try asking about an investigation, a test, a cabin air or one of the analyses.";
export const DISCLAIMER = "Answers are written by a language model from this site's data. Check the sources.";
export const LIVE_LABEL = "SI-generated answer";
export const REFUSAL_MESSAGE = "The assistant could not answer this question. You can read the stored answers instead.";
export const CUT_NOTE = "This answer was cut short at its length limit. Ask me to continue.";
